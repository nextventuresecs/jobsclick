import { Injectable, Logger, Inject, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { OtpRedisService } from './otp-redis.service.js';
import { RateLimitException } from '../common/rate-limit.exception.js';

export interface RateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  resetSeconds?: number;
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(
    @Inject(OtpRedisService) private readonly otpRedisService: OtpRedisService,
  ) {}

  /**
   * Enforces sliding window IP rate limiting (PRD §8.7.1).
   * Default: 200 requests per hour per IP.
   */
  async checkIpRateLimit(ip: string, maxPerHour = 200): Promise<RateLimitCheckResult> {
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
    return this.otpRedisService.checkAndSetCooldown(phone, cooldownSeconds);
  }

  /**
   * Enforces maximum daily OTP request cap per mobile number (AUTH-03).
   * Default: 10 requests per calendar day.
   */
  async checkDailyLimit(phone: string, maxDaily = 10): Promise<{ allowed: boolean; count: number }> {
    return this.otpRedisService.checkAndIncrementDailyLimit(phone, maxDaily);
  }

  /**
   * Atomic OTP abuse protection via single Redis Lua script (AUTH-03, PR #97 B4).
   * Enforces:
   * 1. 60-second cooldown per mobile number
   * 2. 10 OTPs/day cap per mobile number
   * 3. 200 requests/hour IP sliding window
   * 4. 5 OTPs/day per (IP, mobile number) pair
   *
   * Rejections return HTTP 429 Too Many Requests with Retry-After header.
   */
  async checkAndIncrementOtpLimits(
    phone: string,
    clientIp?: string,
  ): Promise<{ allowed: boolean; reason: string; retryAfter: number; uniqueMember: string }> {
    const ip = clientIp || '127.0.0.1';
    let result;
    try {
      result = await this.otpRedisService.checkAndIncrementOtpLimits(phone, ip);
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      throw new ServiceUnavailableException('Authentication service temporarily unavailable. Please try again shortly.');
    }

    if (!result.allowed) {
      this.logger.warn(`OTP rate limit rejected: reason=${result.reason} retryAfter=${result.retryAfter}s`);
      if (result.reason === 'COOLDOWN') {
        throw new RateLimitException(
          `Please wait ${result.retryAfter} seconds before requesting a new OTP`,
          result.retryAfter,
        );
      }
      if (result.reason === 'DAILY') {
        throw new RateLimitException(
          'Daily OTP request limit reached. Please try again tomorrow.',
          result.retryAfter || 86400,
        );
      }
      if (result.reason === 'IP' || result.reason === 'IP_PHONE') {
        throw new RateLimitException(
          'Too many OTP requests from this network. Please try again later.',
          result.retryAfter || 3600,
        );
      }
    }

    return result;
  }

  /**
   * Enforces sliding window IP rate limit for OTP verification (PRD §8.7.1, AUTH-03).
   * Default: 30 requests per hour per IP.
   */
  async checkVerifyIpRateLimit(clientIp?: string, maxPerHour = 30): Promise<void> {
    const ip = clientIp || '127.0.0.1';
    const limit = Number(process.env['OTP_VERIFY_IP_PER_HOUR'] || maxPerHour);
    const result = await this.otpRedisService.checkVerifyIpRateLimit(ip, limit);
    if (!result.allowed) {
      this.logger.warn(`Verify OTP IP rate limit hit for ip=${ip}`);
      throw new RateLimitException(
        'Too many OTP verification attempts from this network. Please try again later.',
        result.retryAfter || 3600,
      );
    }
  }
}
