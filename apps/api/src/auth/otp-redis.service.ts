import crypto from 'node:crypto';
import { Injectable, OnModuleInit, OnModuleDestroy, Logger, ServiceUnavailableException } from '@nestjs/common';
import IORedis from 'ioredis';
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

export const VERIFY_OTP_LUA = `
local lockTtl = redis.call('TTL', KEYS[1])
if lockTtl > 0 or lockTtl == -1 then
  local remaining = lockTtl > 0 and lockTtl or tonumber(ARGV[2])
  return {0, 'LOCKED_OUT', tostring(remaining)}
end

local storedHash = redis.call('HGET', KEYS[2], 'hash')
if not storedHash or storedHash == false then
  return {0, 'EXPIRED', '0'}
end

if storedHash == ARGV[1] then
  redis.call('DEL', KEYS[2])
  return {1, 'SUCCESS', '0'}
end

local attempts = redis.call('HINCRBY', KEYS[2], 'attempts', 1)
local maxAttempts = tonumber(ARGV[3])
local lockoutSec = tonumber(ARGV[2])

if attempts >= maxAttempts then
  redis.call('DEL', KEYS[2])
  redis.call('SET', KEYS[1], '1', 'EX', lockoutSec)
  return {0, 'LOCKED_OUT', tostring(lockoutSec)}
else
  local remaining = maxAttempts - attempts
  return {0, 'INVALID', tostring(remaining)}
end
`;

export const STORE_OTP_LUA = `
redis.call('DEL', KEYS[1])
redis.call('HSET', KEYS[1], 'hash', ARGV[1], 'attempts', '0')
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
return 1
`;

export const CHECK_VERIFY_IP_RATE_LUA = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local oneHourAgo = now - 3600000

redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', oneHourAgo)
local count = redis.call('ZCARD', KEYS[1])

if count >= tonumber(ARGV[1]) then
  return {0, '3600'}
end

local member = tostring(now) .. '_' .. tostring(ARGV[2])
redis.call('ZADD', KEYS[1], now, member)
redis.call('EXPIRE', KEYS[1], 3600)
return {1, '0'}
`;

export type OtpVerifyResult =
  | { status: 'SUCCESS' }
  | { status: 'EXPIRED' }
  | { status: 'LOCKED_OUT'; remainingSeconds: number }
  | { status: 'INVALID'; attemptsRemaining: number };

export const AUTH_STATE_TTL_SECONDS = 60;

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
  verifyOtpAtomic?: (...args: (string | number)[]) => Promise<[number, string, string]>;
  storeOtpAtomic?: (...args: (string | number)[]) => Promise<unknown>;
  checkVerifyIpRate?: (...args: (string | number)[]) => Promise<[number, string]>;
}

@Injectable()
export class OtpRedisService implements OnModuleInit, OnModuleDestroy {
  private readonly untrustedUsers = new Set<string>();

  markUntrustedUser(userId: string): void {
    if (userId) {
      this.untrustedUsers.add(userId);
    }
  }

  clearUntrustedUser(userId: string): void {
    if (userId) {
      this.untrustedUsers.delete(userId);
    }
  }

  isUserCacheTrusted(userId: string): boolean {
    return !this.untrustedUsers.has(userId);
  }
  private readonly logger = new Logger(OtpRedisService.name);
  public readonly client: IORedis;
  private readonly pepper: string;

  constructor(customClient?: IORedis) {
    const pepper = process.env['OTP_PEPPER'];
    if (!pepper || pepper.trim().length < 32) {
      throw new Error('OTP_PEPPER environment variable must be set (min 32 chars)');
    }
    this.pepper = pepper.trim();
    const redisUrl = process.env['REDIS_URL'] || 'redis://127.0.0.1:6379';

    const commandTimeout = process.env['REDIS_COMMAND_TIMEOUT_MS']
      ? parseInt(process.env['REDIS_COMMAND_TIMEOUT_MS'], 10)
      : 2000;

    if (customClient) {
      this.client = customClient;
    } else {
      const isTls = redisUrl.startsWith('rediss://');
      this.client = new IORedis(redisUrl, {
        enableOfflineQueue: false,
        commandTimeout,
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        tls: isTls ? {} : undefined,
        retryStrategy(times) {
          return Math.min(times * 200, 5000);
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

        customClient.defineCommand('verifyOtpAtomic', {
          numberOfKeys: 2,
          lua: VERIFY_OTP_LUA,
        });

        customClient.defineCommand('storeOtpAtomic', {
          numberOfKeys: 1,
          lua: STORE_OTP_LUA,
        });

        customClient.defineCommand('checkVerifyIpRate', {
          numberOfKeys: 1,
          lua: CHECK_VERIFY_IP_RATE_LUA,
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

  async waitForReady(timeoutMs = 5000): Promise<void> {
    if (this.client.status === 'ready' || !this.client.status) {
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

  private hashOtp(phone: string, code: string): string {
    const cleanPhone = phone.trim();
    const cleanCode = code.trim();
    return crypto
      .createHmac('sha256', this.pepper)
      .update(`${cleanPhone}|${cleanCode}`)
      .digest('hex');
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
   * Atomically overwrites any previous hash and resets attempts to 0.
   */
  async storeOtp(phone: string, code: string, ttlSeconds = 600): Promise<void> {
    const key = `auth:otp:${phone}`;
    const hash = this.hashOtp(phone, code);

    const customClient = this.client as unknown as CustomRedisClient;
    if (typeof customClient.storeOtpAtomic === 'function') {
      await customClient.storeOtpAtomic(key, hash, ttlSeconds);
    } else {
      await this.client.eval(STORE_OTP_LUA, 1, key, hash, ttlSeconds);
    }
  }

  /**
   * Atomically verifies an OTP code via Lua:
   * 1. Check lockout key: if active => LOCKED_OUT
   * 2. Read stored hash: if missing => EXPIRED
   * 3. Compare hash: if match => DEL otp and return SUCCESS
   * 4. If mismatch => HINCRBY attempts:
   *    - If attempts >= 3 => DEL otp, SET lockout 900s, return LOCKED_OUT
   *    - Else return INVALID with remaining attempts
   */
  async verifyOtp(phone: string, inputCode: string): Promise<OtpVerifyResult> {
    const lockoutKey = `auth:lockout:${phone}`;
    const otpKey = `auth:otp:${phone}`;
    const expectedHash = this.hashOtp(phone, inputCode);
    const lockoutSeconds = 900;
    const maxAttempts = 3;

    let res: [number, string, string];
    try {
      const customClient = this.client as unknown as CustomRedisClient;
      if (typeof customClient.verifyOtpAtomic === 'function') {
        res = (await customClient.verifyOtpAtomic(
          lockoutKey,
          otpKey,
          expectedHash,
          lockoutSeconds,
          maxAttempts,
        )) as [number, string, string];
      } else {
        res = (await this.client.eval(
          VERIFY_OTP_LUA,
          2,
          lockoutKey,
          otpKey,
          expectedHash,
          lockoutSeconds,
          maxAttempts,
        )) as [number, string, string];
      }
    } catch (err) {
      this.logger.error(`Redis failure during OTP verification: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Authentication service temporarily unavailable. Please try again shortly.');
    }

    const status = res[1] as 'SUCCESS' | 'EXPIRED' | 'LOCKED_OUT' | 'INVALID';
    const param = parseInt(res[2] || '0', 10);

    if (status === 'SUCCESS') {
      return { status: 'SUCCESS' };
    }
    if (status === 'LOCKED_OUT') {
      this.logger.warn(`[Brute-Force Guard] 3 invalid OTP attempts on ${maskPhone(phone)}. Locked out for 15m.`);
      return { status: 'LOCKED_OUT', remainingSeconds: param };
    }
    if (status === 'INVALID') {
      return { status: 'INVALID', attemptsRemaining: param };
    }
    return { status: 'EXPIRED' };
  }

  async deleteOtp(phone: string): Promise<void> {
    await this.client.del(`auth:otp:${phone}`);
  }

  async resetForTest(phone: string): Promise<void> {
    await this.waitForReady(1500).catch(() => {});
    const norm = phone.replace(/\D/g, '');
    const specificKeys = [
      `auth:otp:${norm}`,
      `auth:cooldown:${norm}`,
      `auth:daily:${norm}`,
      `auth:lockout:${norm}`,
      `auth:state:${norm}`,
      `auth:session:${norm}`,
    ];
    await this.client.del(...specificKeys).catch(() => {});
    try {
      const keys = await this.client.keys(`auth:*${norm}*`);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch {
      // In case keys scan hits timeout, targeted del above already removed primary keys
    }
  }

  /**
   * Enforces sliding-window IP rate limit for OTP verification (default 30/hour).
   */
  async checkVerifyIpRateLimit(
    rawIp: string,
    maxPerHour = 30,
  ): Promise<{ allowed: boolean; retryAfter: number }> {
    const normIp = normalizeIp(rawIp);
    const key = `auth:verify_ip_rate:${normIp}`;
    const nonce = crypto.randomBytes(8).toString('hex');

    let res: [number, string];
    try {
      const customClient = this.client as unknown as CustomRedisClient;
      if (typeof customClient.checkVerifyIpRate === 'function') {
        res = (await customClient.checkVerifyIpRate(key, maxPerHour, nonce)) as [number, string];
      } else {
        res = (await this.client.eval(CHECK_VERIFY_IP_RATE_LUA, 1, key, maxPerHour, nonce)) as [number, string];
      }
    } catch (err) {
      this.logger.error(`Redis failure during verify IP rate check: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Authentication service temporarily unavailable. Please try again shortly.');
    }

    const allowed = Number(res[0]) === 1;
    const retryAfter = parseInt(res[1] || '0', 10);

    return { allowed, retryAfter };
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
   * Stores active user authentication state in Redis with maximum 60-second TTL (P0-8).
   * Centralizes and enforces TTL <= 60 seconds across all callers.
   */
  async setAuthState(userId: string, state: UserAuthState, ttlSeconds = AUTH_STATE_TTL_SECONDS): Promise<void> {
    const effectiveTtl = Math.min(ttlSeconds, AUTH_STATE_TTL_SECONDS);
    const key = 'auth:state:' + userId;
    await this.client.set(key, JSON.stringify(state), 'EX', effectiveTtl);
  }

  /**
   * Explicit user-specific session cache invalidation (P0-8).
   * Atomically removes canonical Redis authentication and session state keys:
   * auth:state:{userId} and auth:session:{userId}.
   * Propagates errors rather than silently swallowing Redis failures.
   */
  async invalidateUserSession(userId: string): Promise<void> {
    if (!userId || typeof userId !== 'string') {
      return;
    }
    const stateKey = 'auth:state:' + userId;
    const sessionKey = 'auth:session:' + userId;
    try {
      await this.client.del(stateKey, sessionKey);
      this.clearUntrustedUser(userId);
    } catch (err) {
      this.markUntrustedUser(userId);
      throw err;
    }
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
    tokenHash: string,
    data: { userId: string; email: string },
    ttlSeconds = 86400,
  ): Promise<void> {
    const key = `auth:email_verify:${tokenHash}`;
    await this.client.set(key, JSON.stringify(data), 'EX', ttlSeconds);
  }

  /**
   * Retrieves email verification token from Redis.
   */
  async getEmailVerificationToken(
    tokenHash: string,
  ): Promise<{ userId: string; email: string } | null> {
    const key = `auth:email_verify:${tokenHash}`;
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
  async deleteEmailVerificationToken(tokenHash: string): Promise<void> {
    const key = `auth:email_verify:${tokenHash}`;
    await this.client.del(key);
  }

  /**
   * Saves email verification token with userId and email mapping (AUTH-04).
   */
  async saveEmailVerificationToken(
    userId: string,
    email: string,
    tokenHash: string,
    ttlSeconds = 86400,
  ): Promise<void> {
    await this.setEmailVerificationToken(tokenHash, { userId, email }, ttlSeconds);
  }

  /**
   * Stores active email token hash for a user to enforce single active token.
   */
  async getUserActiveEmailToken(userId: string): Promise<string | null> {
    const key = `auth:user_email_token:${userId}`;
    return this.client.get(key);
  }

  async setUserActiveEmailToken(userId: string, tokenHash: string, ttlSeconds = 86400): Promise<void> {
    const key = `auth:user_email_token:${userId}`;
    await this.client.set(key, tokenHash, 'EX', ttlSeconds);
  }

  async deleteUserActiveEmailToken(userId: string): Promise<void> {
    const key = `auth:user_email_token:${userId}`;
    await this.client.del(key);
  }

  /**
   * Rate limiting for addEmail:
   * - Max 3/hour per user
   * - Max 3/day per target email
   */
  async checkAddEmailRateLimit(
    userId: string,
    email: string,
  ): Promise<{ allowed: boolean; reason?: 'USER_LIMIT' | 'TARGET_LIMIT'; retryAfter?: number }> {
    const userKey = `auth:rate:add_email:user:${userId}`;
    const targetKey = `auth:rate:add_email:target:${email.trim().toLowerCase()}`;

    const [userCountStr, targetCountStr] = await Promise.all([
      this.client.get(userKey),
      this.client.get(targetKey),
    ]);

    const userCount = parseInt(userCountStr || '0', 10);
    const targetCount = parseInt(targetCountStr || '0', 10);

    if (userCount >= 3) {
      const ttl = await this.client.ttl(userKey);
      return { allowed: false, reason: 'USER_LIMIT', retryAfter: Math.max(ttl, 1) };
    }
    if (targetCount >= 3) {
      const ttl = await this.client.ttl(targetKey);
      return { allowed: false, reason: 'TARGET_LIMIT', retryAfter: Math.max(ttl, 1) };
    }

    const p = this.client.pipeline();
    p.incr(userKey);
    if (!userCountStr) p.expire(userKey, 3600);
    p.incr(targetKey);
    if (!targetCountStr) p.expire(targetKey, 86400);
    await p.exec();

    return { allowed: true };
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
