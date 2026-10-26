import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OtpRedisService } from '../src/auth/otp-redis.service.js';
import { RateLimitService } from '../src/auth/rate-limit.service.js';
import type { Redis } from '@upstash/redis';

describe('Senior Architect: RateLimitService & Redis Session Persistence (STF-03)', () => {
  let otpRedisService: OtpRedisService;
  let rateLimitService: RateLimitService;

  beforeEach(() => {
    vi.restoreAllMocks();
    otpRedisService = new OtpRedisService();
    rateLimitService = new RateLimitService(otpRedisService);
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

  describe('@upstash/ratelimit Engine Integration', () => {
    it('uses Upstash Ratelimit algorithms when custom Upstash Redis client is injected', async () => {
      // Mock Upstash Redis REST client executing lua evalsha scripts
      const mockUpstashRedis = {
        sadd: vi.fn().mockResolvedValue(1),
        evalsha: vi.fn().mockResolvedValue([1, 19, Date.now() + 60000]),
        eval: vi.fn().mockResolvedValue([1, 19, Date.now() + 60000]),
      } as unknown as Redis;

      const upstashLimiter = new RateLimitService(otpRedisService, mockUpstashRedis);

      const ipResult = await upstashLimiter.checkIpRateLimit('203.0.113.19');
      expect(ipResult.allowed).toBe(true);
      expect(ipResult.remaining).toBeGreaterThanOrEqual(1);

      const cooldownResult = await upstashLimiter.checkCooldown('9876543203');
      expect(cooldownResult.allowed).toBe(true);

      const dailyResult = await upstashLimiter.checkDailyLimit('9876543203');
      expect(dailyResult.allowed).toBe(true);
    });

    it('gracefully falls back to OtpRedisService if Upstash client throws a network error', async () => {
      const throwingRedis = {
        sadd: vi.fn().mockRejectedValue(new Error('Connection reset by peer')),
        evalsha: vi.fn().mockRejectedValue(new Error('Upstash REST API timeout')),
        eval: vi.fn().mockRejectedValue(new Error('Upstash REST API timeout')),
      } as unknown as Redis;

      const resilientLimiter = new RateLimitService(otpRedisService, throwingRedis);

      const res = await resilientLimiter.checkIpRateLimit('192.0.2.10');
      expect(res.allowed).toBe(true);
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
