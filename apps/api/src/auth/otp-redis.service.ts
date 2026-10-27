import crypto from 'node:crypto';
import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import IORedis from 'ioredis';
import IORedisMock from 'ioredis-mock';

export type OtpVerifyResult =
  | { status: 'SUCCESS' }
  | { status: 'EXPIRED' }
  | { status: 'LOCKED_OUT'; remainingSeconds: number }
  | { status: 'INVALID'; attemptsRemaining: number };

export interface AuthUserSession {
  id: string;
  phone: string;
  email: string | null;
  emailVerified: boolean;
  role: 'employer' | 'intermediary' | 'job_seeker' | 'admin' | 'msme_admin';
  status: 'invited' | 'active' | 'disabled';
}

@Injectable()
export class OtpRedisService implements OnModuleDestroy {
  private readonly logger = new Logger(OtpRedisService.name);
  public readonly client: IORedis;
  private readonly isMock: boolean;
  private readonly salt: string;

  constructor() {
    this.isMock =
      process.env['NODE_ENV'] === 'test' ||
      Boolean(process.env['VITEST']) ||
      process.env['USE_MOCK_REDIS'] === 'true';

    this.salt = process.env['OTP_SALT'] || 'indian-job-portal-otp-salt-secure';
    const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';

    if (this.isMock) {
      this.client = new IORedisMock() as unknown as IORedis;
    } else {
      const isTls = redisUrl.startsWith('rediss://');
      this.client = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        tls: isTls ? { rejectUnauthorized: false } : undefined,
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

  private hashOtp(code: string): string {
    return crypto.createHmac('sha256', this.salt).update(code.trim()).digest('hex');
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
      this.logger.warn(`[Brute-Force Guard] 3 invalid OTP attempts on +91${phone}. Locked out for 15m.`);
      return { status: 'LOCKED_OUT', remainingSeconds: lockoutSeconds };
    }

    await this.client.hset(key, 'attempts', String(nextAttempts));
    return { status: 'INVALID', attemptsRemaining: 3 - nextAttempts };
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
    const dateStr = this.getDateKey();
    const key = `auth:daily_count:${phone}:${dateStr}`;

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
    const key = `auth:ip_rate:${ip}`;
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
}
