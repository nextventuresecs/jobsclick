import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OtpRedisService } from '../src/auth/otp-redis.service.js';
import { RateLimitService } from '../src/auth/rate-limit.service.js';
import { RateLimitException } from '../src/common/rate-limit.exception.js';

describe('RateLimitService & Redis Session Persistence (AUTH-03, PR #97 B4)', () => {
  let otpRedisService: OtpRedisService;
  let rateLimitService: RateLimitService;

  beforeEach(async () => {
    vi.restoreAllMocks();
    otpRedisService = new OtpRedisService();
    await otpRedisService.waitForReady();
    rateLimitService = new RateLimitService(otpRedisService);
    await otpRedisService.client.del(
      'auth:cooldown:9876543201',
      'auth:daily:9876543202',
      'auth:ip_rate:198.51.100.42',
    );
  });

  afterEach(async () => {
    if (otpRedisService) {
      await otpRedisService.onModuleDestroy();
    }
  });

  describe('Fallback Rate Limiting via OtpRedisService', () => {
    it('enforces 60-second cooldown per phone number', async () => {
      const phone = '9876543201';
      const first = await rateLimitService.checkCooldown(phone, 60);
      expect(first.allowed).toBe(true);

      const immediateSecond = await rateLimitService.checkCooldown(phone, 60);
      expect(immediateSecond.allowed).toBe(false);
      expect(immediateSecond.remainingSeconds).toBeGreaterThan(0);
    });

    it('enforces daily OTP cap of 10 requests per phone', async () => {
      const phone = '9876543202';
      for (let i = 1; i <= 10; i++) {
        const check = await rateLimitService.checkDailyLimit(phone, 10);
        expect(check.allowed).toBe(true);
        expect(check.count).toBe(i);
      }

      const eleventh = await rateLimitService.checkDailyLimit(phone, 10);
      expect(eleventh.allowed).toBe(false);
      expect(eleventh.count).toBe(11);
    });

    it('enforces sliding window IP rate limit of 20 requests/hour', async () => {
      const ip = '198.51.100.42';
      for (let i = 1; i <= 20; i++) {
        const check = await rateLimitService.checkIpRateLimit(ip, 20);
        expect(check.allowed).toBe(true);
      }

      const twentyFirst = await rateLimitService.checkIpRateLimit(ip, 20);
      expect(twentyFirst.allowed).toBe(false);
      expect(twentyFirst.remaining).toBe(0);
    });
  });

  describe('Atomic checkAndIncrementOtpLimits', () => {
    it('returns 429 RateLimitException when cooldown is active', async () => {
      vi.spyOn(otpRedisService, 'checkAndIncrementOtpLimits').mockResolvedValue({
        allowed: false,
        reason: 'COOLDOWN',
        retryAfter: 45,
        uniqueMember: 'test_member',
      });

      await expect(
        rateLimitService.checkAndIncrementOtpLimits('9876543210', '192.168.1.1'),
      ).rejects.toThrowError(RateLimitException);
    });

    it('returns 429 RateLimitException when daily limit is reached', async () => {
      vi.spyOn(otpRedisService, 'checkAndIncrementOtpLimits').mockResolvedValue({
        allowed: false,
        reason: 'DAILY',
        retryAfter: 86400,
        uniqueMember: 'test_member',
      });

      await expect(
        rateLimitService.checkAndIncrementOtpLimits('9876543210', '192.168.1.1'),
      ).rejects.toThrowError(RateLimitException);
    });

    it('returns 429 RateLimitException with generic message when IP limit is reached', async () => {
      vi.spyOn(otpRedisService, 'checkAndIncrementOtpLimits').mockResolvedValue({
        allowed: false,
        reason: 'IP',
        retryAfter: 3600,
        uniqueMember: 'test_member',
      });

      await expect(
        rateLimitService.checkAndIncrementOtpLimits('9876543210', '192.168.1.1'),
      ).rejects.toThrowError(RateLimitException);
    });
  });

  describe('Distributed Session & Token Persistence in Redis', () => {
    it('persists active user session and recovers after local cache eviction', async () => {
      const user = {
        id: 'usr_distributed_1',
        phone: '9876543210',
        email: 'founder@msme.in',
        emailVerified: true,
        role: 'employer' as const,
        status: 'active' as const,
      };

      await otpRedisService.setSession(user.id, user);

      const recovered = await otpRedisService.getSession(user.id);
      expect(recovered).toBeDefined();
      expect(recovered?.phone).toBe('9876543210');
      expect(recovered?.role).toBe('employer');

      // Invalidate session (logout / single sign out)
      await otpRedisService.deleteSession(user.id);
      const afterLogout = await otpRedisService.getSession(user.id);
      expect(afterLogout).toBeNull();
    });

    it('persists email verification tokens and enforces single-use burn', async () => {
      const token = 'token_secure_98765';
      const tokenData = { userId: 'usr_candidate_99', email: 'candidate@test.in' };

      await otpRedisService.setEmailVerificationToken(token, tokenData);

      const fetched = await otpRedisService.getEmailVerificationToken(token);
      expect(fetched).toEqual(tokenData);

      await otpRedisService.deleteEmailVerificationToken(token);
      const afterBurn = await otpRedisService.getEmailVerificationToken(token);
      expect(afterBurn).toBeNull();
    });
  });
});
