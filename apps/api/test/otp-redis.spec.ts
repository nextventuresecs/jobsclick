import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OtpRedisService } from '../src/auth/otp-redis.service.js';

describe('OtpRedisService (Phase 1: Redis Infrastructure & Atomic State)', () => {
  let service: OtpRedisService;

  beforeEach(() => {
    service = new OtpRedisService();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('OTP Store & Verification Lifecycle', () => {
    const phone = '9876543210';
    const code = '654321';

    it('stores OTP and verifies successfully on correct code, burning the OTP', async () => {
      await service.storeOtp(phone, code, 600);

      const result = await service.verifyOtp(phone, code);
      expect(result.status).toBe('SUCCESS');

      // Subsequent attempt should fail because code is burned
      const repeatResult = await service.verifyOtp(phone, code);
      expect(repeatResult.status).toBe('EXPIRED');
    });

    it('returns EXPIRED when verifying non-existent or expired OTP', async () => {
      const result = await service.verifyOtp('9999999999', '123456');
      expect(result.status).toBe('EXPIRED');
    });

    it('tracks failed attempts and locks out phone after 3 failed attempts (Brute-Force Guard)', async () => {
      await service.storeOtp(phone, code, 600);

      // Attempt 1: wrong code
      const res1 = await service.verifyOtp(phone, '000001');
      expect(res1.status).toBe('INVALID');
      expect(res1.attemptsRemaining).toBe(2);

      // Attempt 2: wrong code
      const res2 = await service.verifyOtp(phone, '000002');
      expect(res2.status).toBe('INVALID');
      expect(res2.attemptsRemaining).toBe(1);

      // Attempt 3: wrong code -> triggers 15-minute lockout
      const res3 = await service.verifyOtp(phone, '000003');
      expect(res3.status).toBe('LOCKED_OUT');
      expect(res3.remainingSeconds).toBeGreaterThan(0);

      // Verify phone is reported as locked out
      const lockout = await service.isLockedOut(phone);
      expect(lockout.locked).toBe(true);
      expect(lockout.remainingSeconds).toBeGreaterThan(800);

      // Even correct code should now be rejected due to lockout
      const resAfterLockout = await service.verifyOtp(phone, code);
      expect(resAfterLockout.status).toBe('LOCKED_OUT');
    });
  });

  describe('Cooldown & Daily Limit Guards', () => {
    const phone = '9876543211';

    it('enforces 60-second cooldown between requests', async () => {
      const first = await service.checkAndSetCooldown(phone, 60);
      expect(first.allowed).toBe(true);
      expect(first.remainingSeconds).toBe(0);

      const immediateSecond = await service.checkAndSetCooldown(phone, 60);
      expect(immediateSecond.allowed).toBe(false);
      expect(immediateSecond.remainingSeconds).toBeGreaterThan(0);
    });

    it('enforces daily request limit (max 10 requests/day per number)', async () => {
      const testPhone = '9876543299';
      for (let i = 1; i <= 10; i++) {
        const res = await service.checkAndIncrementDailyLimit(testPhone, 10);
        expect(res.allowed).toBe(true);
        expect(res.count).toBe(i);
      }

      // 11th request exceeds daily limit
      const exceeded = await service.checkAndIncrementDailyLimit(testPhone, 10);
      expect(exceeded.allowed).toBe(false);
      expect(exceeded.count).toBe(11);
    });
  });

  describe('Sliding Window IP Rate Limiter', () => {
    const testIp = '192.168.1.100';

    it('allows requests up to hourly limit and blocks when exceeded', async () => {
      const limit = 5;
      for (let i = 1; i <= limit; i++) {
        const res = await service.checkIpRateLimit(testIp, limit);
        expect(res.allowed).toBe(true);
        expect(res.count).toBe(i);
      }

      const blocked = await service.checkIpRateLimit(testIp, limit);
      expect(blocked.allowed).toBe(false);
      expect(blocked.count).toBe(limit);
    });
  });

  describe('Daily Spend & Quota Guard', () => {
    it('accumulates daily SMS spend and flags over-budget status', async () => {
      // 100 segments at ₹0.20 = ₹20.00
      const res1 = await service.recordSmsSpend(100, 0.20, 50.0);
      expect(res1.currentDailySpend).toBe(20.0);
      expect(res1.overBudget).toBe(false);

      // Another 200 segments = +₹40.00 -> total ₹60.00 (exceeds ₹50.00 budget)
      const res2 = await service.recordSmsSpend(200, 0.20, 50.0);
      expect(res2.currentDailySpend).toBe(60.0);
      expect(res2.overBudget).toBe(true);
    });
  });
});
