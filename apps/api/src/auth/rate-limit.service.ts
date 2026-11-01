import { Injectable, Logger, Optional, Inject, BadRequestException } from '@nestjs/common';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { OtpRedisService } from './otp-redis.service.js';

export interface RateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  resetSeconds?: number;
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly ipLimiter?: Ratelimit;
  private readonly cooldownLimiter?: Ratelimit;
  private readonly dailyLimiter?: Ratelimit;
  private readonly isUpstashActive: boolean = false;

  constructor(
    @Inject(OtpRedisService) private readonly otpRedisService: OtpRedisService,
    @Optional() @Inject('UPSTASH_REDIS_CLIENT') customRedis?: Redis,
  ) {
    const restUrl = process.env['UPSTASH_REDIS_REST_URL'];
    const restToken = process.env['UPSTASH_REDIS_REST_TOKEN'];

    if (customRedis) {
      this.isUpstashActive = true;
      this.ipLimiter = new Ratelimit({
        redis: customRedis,
        limiter: Ratelimit.slidingWindow(20, '1 h'),
        prefix: 'ratelimit:ip',
      });
      this.cooldownLimiter = new Ratelimit({
        redis: customRedis,
        limiter: Ratelimit.fixedWindow(1, '60 s'),
        prefix: 'ratelimit:cooldown',
      });
      this.dailyLimiter = new Ratelimit({
        redis: customRedis,
        limiter: Ratelimit.fixedWindow(10, '1 d'),
        prefix: 'ratelimit:daily',
      });
    } else if (restUrl && restToken) {
      try {
        const redisClient = new Redis({
          url: restUrl,
          token: restToken,
        });
        this.isUpstashActive = true;
        this.ipLimiter = new Ratelimit({
          redis: redisClient,
          limiter: Ratelimit.slidingWindow(20, '1 h'),
          prefix: 'ratelimit:ip',
        });
        this.cooldownLimiter = new Ratelimit({
          redis: redisClient,
          limiter: Ratelimit.fixedWindow(1, '60 s'),
          prefix: 'ratelimit:cooldown',
        });
        this.dailyLimiter = new Ratelimit({
          redis: redisClient,
          limiter: Ratelimit.fixedWindow(10, '1 d'),
          prefix: 'ratelimit:daily',
        });
        this.logger.log('[@upstash/ratelimit] Successfully initialized with Upstash Redis REST endpoint');
      } catch (err) {
        this.logger.warn(`Failed to initialize Upstash Redis REST client: ${(err as Error).message}`);
        this.isUpstashActive = false;
      }
    }
  }

  /**
   * Enforces sliding window IP rate limiting (PRD §8.7.1).
   * Default: 20 requests per hour per IP.
   */
  async checkIpRateLimit(ip: string, maxPerHour = 20): Promise<RateLimitCheckResult> {
    if (this.isUpstashActive && this.ipLimiter) {
      try {
        const result = await this.ipLimiter.limit(ip);
        const resetSeconds = result.reset ? Math.max(0, Math.ceil((result.reset - Date.now()) / 1000)) : 3600;
        return {
          allowed: result.success,
          remaining: result.remaining,
          resetSeconds,
        };
      } catch (error) {
        this.logger.warn(`Upstash IP limiter error, falling back to OtpRedisService: ${(error as Error).message}`);
      }
    }

    // Fallback to Redis / IORedis-mock
    const fallback = await this.otpRedisService.checkIpRateLimit(ip, maxPerHour);
    return {
      allowed: fallback.allowed,
      remaining: Math.max(0, maxPerHour - fallback.count),
    };
  }

  /**
   * Enforces 60-second cool-down per mobile number (AUTH-03).
   */
  async checkCooldown(phone: string, cooldownSeconds = 60): Promise<{ allowed: boolean; remainingSeconds: number }> {
    if (this.isUpstashActive && this.cooldownLimiter) {
      try {
        const result = await this.cooldownLimiter.limit(phone);
        const remainingSeconds = result.reset ? Math.max(0, Math.ceil((result.reset - Date.now()) / 1000)) : cooldownSeconds;
        return {
          allowed: result.success,
          remainingSeconds: result.success ? 0 : remainingSeconds,
        };
      } catch (error) {
        this.logger.warn(`Upstash cooldown limiter error, falling back to OtpRedisService: ${(error as Error).message}`);
      }
    }

    return this.otpRedisService.checkAndSetCooldown(phone, cooldownSeconds);
  }

  /**
   * Enforces maximum daily OTP request cap per mobile number (AUTH-03).
   * Default: 10 requests per calendar day.
   */
  async checkDailyLimit(phone: string, maxDaily = 10): Promise<{ allowed: boolean; count: number }> {
    if (this.isUpstashActive && this.dailyLimiter) {
      try {
        const result = await this.dailyLimiter.limit(phone);
        return {
          allowed: result.success,
          count: result.limit - result.remaining,
        };
      } catch (error) {
        this.logger.warn(`Upstash daily limiter error, falling back to OtpRedisService: ${(error as Error).message}`);
      }
    }

    return this.otpRedisService.checkAndIncrementDailyLimit(phone, maxDaily);
  }

  /**
   * Enforces all OTP abuse protection rate limits in sequence (AUTH-03):
   * 1. Sliding window IP rate limit (20 req/hour)
   * 2. 60-second cool-down per mobile number
   * 3. Daily request cap (10 req/day per mobile number)
   */
  async checkAndIncrementOtpLimits(phone: string, clientIp?: string): Promise<void> {
    if (clientIp && clientIp !== '127.0.0.1' && clientIp !== '::1' && !clientIp.includes('localhost')) {
      const ipCheck = await this.checkIpRateLimit(clientIp, 20);
      if (!ipCheck.allowed) {
        throw new BadRequestException('Too many OTP requests from this network. Please try again later.');
      }
    }

    const cooldown = await this.checkCooldown(phone, 60);
    if (!cooldown.allowed) {
      throw new BadRequestException(`Please wait ${cooldown.remainingSeconds} seconds before requesting a new OTP`);
    }

    const daily = await this.checkDailyLimit(phone, 10);
    if (!daily.allowed) {
      throw new BadRequestException('Daily OTP request limit reached. Please try again tomorrow.');
    }
  }
}
