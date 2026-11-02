import crypto from 'node:crypto';
import { Injectable, OnModuleInit, OnModuleDestroy, Logger, ServiceUnavailableException } from '@nestjs/common';
import IORedis from 'ioredis';
import IORedisMock from 'ioredis-mock';
import { maskPhone } from '../common/mask.js';
import { normalizeIp } from '../common/ip-normalizer.js';

export const CHECK_AND_INCREMENT_OTP_LIMITS_LUA = `
local cooldownTtl = redis.call('TTL', KEYS[1])
if cooldownTtl > 0 then
  return {0, 'COOLDOWN', tostring(cooldownTtl), ''}
end

local currentDaily = tonumber(redis.call('GET', KEYS[2]) or '0')
if currentDaily >= tonumber(ARGV[2]) then
  local dailyTtl = redis.call('TTL', KEYS[2])
  if dailyTtl < 0 then dailyTtl = 86400 end
  return {0, 'DAILY', tostring(dailyTtl), ''}
end

local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local oneHourAgo = now - 3600000
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', oneHourAgo)
local ipCount = redis.call('ZCARD', KEYS[3])
if ipCount >= tonumber(ARGV[3]) then
  return {0, 'IP', '3600', ''}
end

local ipPhoneDaily = tonumber(redis.call('GET', KEYS[4]) or '0')
if ipPhoneDaily >= tonumber(ARGV[4]) then
  local ipPhoneTtl = redis.call('TTL', KEYS[4])
  if ipPhoneTtl < 0 then ipPhoneTtl = 86400 end
  return {0, 'IP_PHONE', tostring(ipPhoneTtl), ''}
end

redis.call('SET', KEYS[1], '1', 'EX', tonumber(ARGV[1]))

local newDaily = redis.call('INCR', KEYS[2])
if newDaily == 1 then
  redis.call('EXPIRE', KEYS[2], 86400)
end

local zsetMember = tostring(now) .. '_' .. tostring(ARGV[5])
redis.call('ZADD', KEYS[3], now, zsetMember)
redis.call('EXPIRE', KEYS[3], 3600)

local newIpPhone = redis.call('INCR', KEYS[4])
if newIpPhone == 1 then
  redis.call('EXPIRE', KEYS[4], 86400)
end

return {1, 'OK', '0', zsetMember}
`;

export const RELEASE_OTP_LIMITS_LUA = `
redis.call('DEL', KEYS[1])

local daily = tonumber(redis.call('GET', KEYS[2]) or '0')
if daily > 1 then
  redis.call('DECR', KEYS[2])
elseif daily == 1 then
  redis.call('DEL', KEYS[2])
end

if ARGV[1] and ARGV[1] ~= '' then
  redis.call('ZREM', KEYS[3], ARGV[1])
end

local ipPhone = tonumber(redis.call('GET', KEYS[4]) or '0')
if ipPhone > 1 then
  redis.call('DECR', KEYS[4])
elseif ipPhone == 1 then
  redis.call('DEL', KEYS[4])
end

return 1
`;

export type OtpVerifyResult =
  | { status: 'SUCCESS' }
  | { status: 'EXPIRED' }
  | { status: 'LOCKED_OUT'; remainingSeconds: number }
  | { status: 'INVALID'; attemptsRemaining: number };

export interface UserAuthState {
  role: 'employer' | 'intermediary' | 'job_seeker' | 'admin' | 'msme_admin';
  status: 'invited' | 'active' | 'disabled';
  tokenVersion: number;
}

export interface AuthUserSession {
  id: string;
  phone: string;
  email: string | null;
  emailVerified: boolean;
  role: 'employer' | 'intermediary' | 'job_seeker' | 'admin' | 'msme_admin';
  status: 'invited' | 'active' | 'disabled';
}

interface CustomRedisClient {
  defineCommand?: (name: string, def: { numberOfKeys: number; lua: string }) => void;
  checkAndIncrementOtpLimits?: (...args: (string | number)[]) => Promise<[number, string, string, string]>;
  releaseOtpLimits?: (...args: string[]) => Promise<unknown>;
}

@Injectable()
export class OtpRedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OtpRedisService.name);
  public readonly client: IORedis;
  private readonly isMock: boolean;
  private readonly pepper: string;

    constructor(customClient?: IORedis) {
    this.isMock =
      process.env['USE_MOCK_REDIS'] === '1' ||
      process.env['USE_MOCK_REDIS'] === 'true';

    const rawEnv = (process.env['NODE_ENV'] ?? '').trim().toLowerCase();
    const isDevOrTest = rawEnv === 'development' || rawEnv === 'test';
    const pepper = process.env['OTP_PEPPER'];

    if (!pepper) {
      if (isDevOrTest || this.isMock) {
        this.pepper = crypto.randomBytes(32).toString('hex');
      } else {
        throw new Error('OTP_PEPPER environment variable must be set (min 32 chars)');
      }
    } else {
      this.pepper = pepper;
    }
    const redisUrl = process.env['REDIS_URL'] || 'redis://127.0.0.1:6379';

    if (customClient) {
      this.client = customClient;
    } else if (this.isMock) {
      this.client = new IORedisMock() as unknown as IORedis;
    } else {
      const isTls = redisUrl.startsWith('rediss://');
      this.client = new IORedis(redisUrl, {
        enableOfflineQueue: false,
        commandTimeout: 1000,
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
        tls: isTls ? {} : undefined,
        retryStrategy() {
          return null;
        },
      });

      // Prevent unhandled EventEmitter errors from terminating the Node process
      this.client.on('error', (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Redis connection warning: ${msg}`);
      });
    }

    try {
      const customClient = this.client as unknown as CustomRedisClient;
      if (typeof customClient.defineCommand === 'function') {
        customClient.defineCommand('checkAndIncrementOtpLimits', {
          numberOfKeys: 4,
          lua: CHECK_AND_INCREMENT_OTP_LIMITS_LUA,
        });

        customClient.defineCommand('releaseOtpLimits', {
          numberOfKeys: 4,
          lua: RELEASE_OTP_LIMITS_LUA,
        });
      }
    } catch (err) {
      this.logger.warn(`Failed to register Redis custom commands: ${(err as Error).message}`);
    }
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.waitForReady(1500);
    } catch (err) {
      this.logger.warn(`Redis connection initialization warning: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (typeof this.client.disconnect === 'function') {
        this.client.disconnect();
      }
    } catch {
      // Ignore disconnect errors during teardown
    }
  }

  async waitForReady(timeoutMs = 2000): Promise<void> {
    if (this.isMock || this.client.status === 'ready') {
      return;
    }
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Redis client not ready after ${timeoutMs}ms (current status: ${this.client.status})`));
      }, timeoutMs);
      this.client.once('ready', () => {
        clearTimeout(timer);
        resolve();
      });
      this.client.once('error', (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  private hashOtp(code: string): string {
    return crypto.createHmac('sha256', this.pepper).update(code.trim()).digest('hex');
  }

  private getDateKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Checks whether a phone number is currently in brute-force lockout.
   */
  async isLockedOut(phone: string): Promise<{ locked: boolean; remainingSeconds: number }> {
    const key = `auth:lockout:${phone}`;
    const ttl = await this.client.ttl(key);
    if (ttl > 0) {
      return { locked: true, remainingSeconds: ttl };
    }
    return { locked: false, remainingSeconds: 0 };
  }

  /**
   * Stores a newly generated OTP with expiration TTL.
   */
  async storeOtp(phone: string, code: string, ttlSeconds = 600): Promise<void> {
    const key = `auth:otp:${phone}`;
    const hash = this.hashOtp(code);

    await this.client.hset(key, 'hash', hash, 'attempts', '0');
    await this.client.expire(key, ttlSeconds);
  }

  /**
   * Verifies an OTP code with brute-force attempt tracking and timing-safe comparison.
   */
  async verifyOtp(phone: string, inputCode: string): Promise<OtpVerifyResult> {
    // 1. Lockout check
    const lockout = await this.isLockedOut(phone);
    if (lockout.locked) {
      return { status: 'LOCKED_OUT', remainingSeconds: lockout.remainingSeconds };
    }

    const key = `auth:otp:${phone}`;
    const data = await this.client.hgetall(key);

    if (!data || !data['hash']) {
      return { status: 'EXPIRED' };
    }

    const storedHash = data['hash'];
    const attempts = parseInt(data['attempts'] || '0', 10);

    // 2. Timing-safe hash comparison
    const inputHash = this.hashOtp(inputCode);
    const storedBuf = Buffer.from(storedHash, 'hex');
    const inputBuf = Buffer.from(inputHash, 'hex');

    const isMatch =
      storedBuf.length === inputBuf.length &&
      crypto.timingSafeEqual(storedBuf, inputBuf);

    if (isMatch) {
      // Single-use burn on success
      await this.client.del(key);
      return { status: 'SUCCESS' };
    }

    // 3. Failed attempt handling
    const nextAttempts = attempts + 1;
    if (nextAttempts >= 3) {
      // Burn OTP and trigger 15-minute phone lockout
      await this.client.del(key);
      const lockoutSeconds = 900;
      await this.client.set(`auth:lockout:${phone}`, '1', 'EX', lockoutSeconds);
      this.logger.warn(`[Brute-Force Guard] 3 invalid OTP attempts on ${maskPhone(phone)}. Locked out for 15m.`);
      return { status: 'LOCKED_OUT', remainingSeconds: lockoutSeconds };
    }

    await this.client.hset(key, 'attempts', String(nextAttempts));
    return { status: 'INVALID', attemptsRemaining: 3 - nextAttempts };
  }

  async incrementAndGetAttempts(phone: string): Promise<number> {
    const key = `auth:otp:${phone}`;
    return this.client.hincrby(key, 'attempts', 1);
  }

  async clearOtp(phone: string): Promise<void> {
    await this.client.del(`auth:otp:${phone}`);
  }

  async deleteOtp(phone: string): Promise<void> {
    await this.clearOtp(phone);
  }

  async resetForTest(phone: string): Promise<void> {
    await this.waitForReady(1500).catch(() => {});
    const keys = await this.client.keys(`auth:*${phone}*`);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  async verifyOtpHash(phone: string, inputCode: string): Promise<boolean> {
    const result = await this.verifyOtp(phone, inputCode);
    return result.status === 'SUCCESS';
  }

  /**
   * Enforces 60-second cooldown between outbound requests.
   */
  async checkAndSetCooldown(phone: string, cooldownSeconds = 60): Promise<{ allowed: boolean; remainingSeconds: number }> {
    const key = `auth:cooldown:${phone}`;
    const ttl = await this.client.ttl(key);

    if (ttl > 0) {
      return { allowed: false, remainingSeconds: ttl };
    }

    await this.client.set(key, '1', 'EX', cooldownSeconds);
    return { allowed: true, remainingSeconds: 0 };
  }

  /**
   * Enforces daily request cap per mobile number.
   */
  async checkAndIncrementDailyLimit(
    phone: string,
    maxDaily = 10,
  ): Promise<{ allowed: boolean; count: number }> {
    const key = `auth:daily:${phone}`;

    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, 86400);
    }

    return { allowed: count <= maxDaily, count };
  }

  /**
   * Sliding window IP rate limiter (maxPerHour requests per IP).
   */
  async checkIpRateLimit(
    ip: string,
    maxPerHour = 20,
  ): Promise<{ allowed: boolean; count: number }> {
    const normIp = normalizeIp(ip);
    const key = `auth:ip_rate:${normIp}`;
    const now = Date.now();
    const oneHourAgo = now - 3600 * 1000;

    await this.client.zremrangebyscore(key, 0, oneHourAgo);
    const count = await this.client.zcard(key);

    if (count >= maxPerHour) {
      return { allowed: false, count };
    }

    await this.client.zadd(key, now, `${now}_${Math.random()}`);
    await this.client.expire(key, 3600);
    return { allowed: true, count: count + 1 };
  }

  /**
   * Atomic OTP abuse check and increment via Redis Lua script (AUTH-03, PR #97 B4).
   * Atomically verifies:
   * 1. 60-second cool-down per mobile number
   * 2. Daily limit per mobile number (default 10)
   * 3. Hourly sliding window rate limit per IP (default 200)
   * 4. Daily limit per (IP, mobile number) pair (default 5)
   *
   * Only mutates Redis state if ALL checks pass!
   */
  async checkAndIncrementOtpLimits(
    phone: string,
    rawIp: string,
    customMember?: string,
  ): Promise<{
    allowed: boolean;
    reason: 'OK' | 'COOLDOWN' | 'DAILY' | 'IP' | 'IP_PHONE';
    retryAfter: number;
    uniqueMember: string;
  }> {
    if (!/^[6-9]\d{9}$/.test(phone)) {
      throw new Error(`OtpRedisService requires a normalized 10-digit Indian phone number. Received: ${phone}`);
    }

    const normIp = normalizeIp(rawIp);
    const cooldownKey = `auth:cooldown:${phone}`;
    const dailyKey = `auth:daily:${phone}`;
    const ipKey = `auth:ip_rate:${normIp}`;
    const ipPhoneKey = `auth:ip_phone:${normIp}:${phone}`;

    const cooldownSec = Number(process.env['OTP_COOLDOWN_SEC'] || 60);
    const maxDaily = Number(process.env['OTP_PHONE_PER_DAY'] || 10);
    const maxIpPerHour = Number(process.env['OTP_IP_PER_HOUR'] || 200);
    const maxIpPhoneDaily = Number(process.env['OTP_IP_PHONE_PER_DAY'] || 5);
    const nonce = customMember || crypto.randomBytes(8).toString('hex');

    let res: [number, string, string, string];
    try {
      const customClient = this.client as unknown as CustomRedisClient;
      if (typeof customClient.checkAndIncrementOtpLimits === 'function') {
        res = (await customClient.checkAndIncrementOtpLimits(
          cooldownKey,
          dailyKey,
          ipKey,
          ipPhoneKey,
          cooldownSec,
          maxDaily,
          maxIpPerHour,
          maxIpPhoneDaily,
          nonce,
        )) as [number, string, string, string];
      } else {
        res = (await this.client.eval(
          CHECK_AND_INCREMENT_OTP_LIMITS_LUA,
          4,
          cooldownKey,
          dailyKey,
          ipKey,
          ipPhoneKey,
          cooldownSec,
          maxDaily,
          maxIpPerHour,
          maxIpPhoneDaily,
          nonce,
        )) as [number, string, string, string];
      }
    } catch (err) {
      this.logger.error(`Redis failure during OTP rate check: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Authentication service temporarily unavailable. Please try again shortly.');
    }

    const allowed = Number(res[0]) === 1;
    const reason = res[1] as 'OK' | 'COOLDOWN' | 'DAILY' | 'IP' | 'IP_PHONE';
    const retryAfter = parseInt(res[2] || '0', 10);
    const uniqueMember = res[3] || '';

    if (!allowed) {
      this.logger.warn(`OTP rate limit hit: reason=${reason}, retryAfter=${retryAfter}s, ip=${normIp}`);
    }

    return {
      allowed,
      reason,
      retryAfter,
      uniqueMember,
    };
  }

  /**
   * Releases OTP rate limits upon SMS delivery failure.
   * Decrements daily counters and removes cooldown/IP member.
   */
  async releaseOtpLimits(phone: string, rawIp: string, uniqueMember?: string): Promise<void> {
    if (!/^[6-9]\d{9}$/.test(phone)) {
      return;
    }

    const normIp = normalizeIp(rawIp);
    const cooldownKey = `auth:cooldown:${phone}`;
    const dailyKey = `auth:daily:${phone}`;
    const ipKey = `auth:ip_rate:${normIp}`;
    const ipPhoneKey = `auth:ip_phone:${normIp}:${phone}`;

    try {
      const customClient = this.client as unknown as CustomRedisClient;
      if (typeof customClient.releaseOtpLimits === 'function') {
        await customClient.releaseOtpLimits(
          cooldownKey,
          dailyKey,
          ipKey,
          ipPhoneKey,
          uniqueMember || '',
        );
      } else {
        await this.client.eval(
          RELEASE_OTP_LIMITS_LUA,
          4,
          cooldownKey,
          dailyKey,
          ipKey,
          ipPhoneKey,
          uniqueMember || '',
        );
      }
    } catch (err) {
      this.logger.error(`Failed to release OTP limits: ${(err as Error).message}`);
    }
  }

  /**
   * Records SMS segment spend and alerts when exceeding daily budget limit.
   */
  async recordSmsSpend(
    segmentCount: number,
    costPerSegmentInr = 0.2,
    budgetLimitInr?: number,
  ): Promise<{ currentDailySpend: number; overBudget: boolean }> {
    const dateStr = this.getDateKey();
    const key = `spend:sms:daily:${dateStr}`;

    const cost = Number((segmentCount * costPerSegmentInr).toFixed(2));
    const currentStr = (await this.client.get(key)) || '0';
    const newSpend = Number((parseFloat(currentStr) + cost).toFixed(2));

    await this.client.set(key, String(newSpend), 'EX', 172800);

    const maxBudget =
      budgetLimitInr !== undefined
        ? budgetLimitInr
        : Number(process.env['DAILY_SMS_BUDGET_INR'] || 500);

    return {
      currentDailySpend: newSpend,
      overBudget: newSpend >= maxBudget,
    };
  }

  /**
   * Stores active user session in Redis with 30-day TTL (replaces volatile in-memory Map).
   */
  async setAuthState(userId: string, state: UserAuthState, ttlSeconds = 300): Promise<void> {
    const key = 'auth:state:' + userId;
    await this.client.set(key, JSON.stringify(state), 'EX', ttlSeconds);
  }

  async getAuthState(userId: string): Promise<UserAuthState | null> {
    const key = 'auth:state:' + userId;
    const data = await this.client.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as UserAuthState;
    } catch {
      return null;
    }
  }

  async deleteAuthState(userId: string): Promise<void> {
    const key = 'auth:state:' + userId;
    await this.client.del(key);
  }

  async setSession(userId: string, session: AuthUserSession, ttlSeconds = 30 * 86400): Promise<void> {
    const key = `auth:session:${userId}`;
    await this.client.set(key, JSON.stringify(session), 'EX', ttlSeconds);
  }

  /**
   * Fetches active user session from Redis.
   */
  async getSession(userId: string): Promise<AuthUserSession | null> {
    const key = `auth:session:${userId}`;
    const data = await this.client.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as AuthUserSession;
    } catch {
      return null;
    }
  }

  /**
   * Invalidates user session across all instances/containers (Single Sign-Out).
   */
  async deleteSession(userId: string): Promise<void> {
    const key = `auth:session:${userId}`;
    await this.client.del(key);
  }

  /**
   * Stores email verification token with 24-hour TTL (replaces volatile in-memory Map).
   */
  async setEmailVerificationToken(
    token: string,
    data: { userId: string; email: string },
    ttlSeconds = 86400,
  ): Promise<void> {
    const key = `auth:email_verify:${token}`;
    await this.client.set(key, JSON.stringify(data), 'EX', ttlSeconds);
  }

  /**
   * Retrieves email verification token from Redis.
   */
  async getEmailVerificationToken(
    token: string,
  ): Promise<{ userId: string; email: string } | null> {
    const key = `auth:email_verify:${token}`;
    const data = await this.client.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  /**
   * Burns email verification token after single use.
   */
  async deleteEmailVerificationToken(token: string): Promise<void> {
    const key = `auth:email_verify:${token}`;
    await this.client.del(key);
  }

  /**
   * Saves email verification token with userId and email mapping (AUTH-04).
   */
  async saveEmailVerificationToken(
    userId: string,
    email: string,
    token: string,
    ttlSeconds = 86400,
  ): Promise<void> {
    await this.setEmailVerificationToken(token, { userId, email }, ttlSeconds);
  }

  /**
   * Records a global revocation timestamp for a user (invalidates all previous JWTs).
   */
  async setRevokedTimestamp(userId: string, timestamp: number, ttlSeconds = 7 * 86400): Promise<void> {
    const key = `auth:revocation:${userId}`;
    await this.client.set(key, String(timestamp), 'EX', ttlSeconds);
  }

  /**
   * Retrieves global revocation timestamp for a user.
   */
  async getRevokedTimestamp(userId: string): Promise<number | null> {
    const key = `auth:revocation:${userId}`;
    const data = await this.client.get(key);
    if (!data) return null;
    const parsed = parseInt(data, 10);
    return isNaN(parsed) ? null : parsed;
  }
}
