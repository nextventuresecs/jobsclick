import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import IORedis from 'ioredis';
import { OtpRedisService } from '../src/auth/otp-redis.service.js';

describe('OTP Parallel Guessing & Atomic Verification Lockdown (AUTH-03)', () => {
  let service: OtpRedisService;
  let redisClient: IORedis;
  const TEST_REDIS_URL = process.env['REDIS_URL'] || 'redis://127.0.0.1:6379';
  const trackedKeys = new Set<string>();

  const trackKey = (key: string) => {
    trackedKeys.add(key);
    return key;
  };

  const trackPhone = (phone: string) => {
    trackKey(`auth:otp:${phone}`);
    trackKey(`auth:lockout:${phone}`);
    trackKey(`auth:cooldown:${phone}`);
    trackKey(`auth:daily:${phone}`);
    return phone;
  };

  const trackIp = (ip: string) => {
    trackKey(`auth:verify_ip_rate:${ip}`);
    return ip;
  };

  beforeAll(async () => {
    redisClient = new IORedis(TEST_REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });

    try {
      await redisClient.ping();
    } catch (err) {
      throw new Error(`Real Redis required at ${TEST_REDIS_URL}: ${(err as Error).message}`);
    }

    service = new OtpRedisService();
    await service.waitForReady();
  });

  afterAll(async () => {
    if (trackedKeys.size > 0 && redisClient) {
      await redisClient.del(...Array.from(trackedKeys));
    }
    if (service) {
      await service.onModuleDestroy();
    }
    if (redisClient) {
      await redisClient.quit();
    }
  });

  beforeEach(async () => {
    if (trackedKeys.size > 0 && redisClient) {
      await redisClient.del(...Array.from(trackedKeys));
    }
  });

  // ── 1. 1,000 Parallel Wrong Guesses Concurrency Lockdown ───────────
  it('store OTP 111111: 1,000 parallel wrong guesses => at most 3 return INVALID, rest LOCKED; subsequent correct code is LOCKED', async () => {
    const phone = trackPhone('9876543801');
    const correctCode = '111111';

    // Store the OTP
    await service.storeOtp(phone, correctCode, 600);

    // Fire 1,000 parallel verify calls with wrong codes
    const wrongCodes = Array.from({ length: 1000 }, (_, i) =>
      (200000 + i).toString()
    );

    const promises = wrongCodes.map((code) => service.verifyOtp(phone, code));
    const results = await Promise.all(promises);

    const invalidCount = results.filter((r) => r.status === 'INVALID').length;
    const lockedCount = results.filter((r) => r.status === 'LOCKED_OUT').length;
    const successCount = results.filter((r) => r.status === 'SUCCESS').length;
    const expiredCount = results.filter((r) => r.status === 'EXPIRED').length;

    // Invariant: Zero leaks through as success or expired
    expect(successCount).toBe(0);
    expect(expiredCount).toBe(0);

    // Invariant: At most 3 return INVALID, the remainder are immediately LOCKED_OUT
    expect(invalidCount).toBeLessThanOrEqual(3);
    expect(lockedCount).toBeGreaterThanOrEqual(997);
    expect(invalidCount + lockedCount).toBe(1000);

    // Invariant: Subsequent attempt with the CORRECT code is strictly LOCKED_OUT
    const postLockoutAttempt = await service.verifyOtp(phone, correctCode);
    expect(postLockoutAttempt.status).toBe('LOCKED_OUT');
    expect(postLockoutAttempt.remainingSeconds).toBeGreaterThan(800);
  });

  // ── 2. 20 Parallel Correct Submissions (Single-Use Burn) ───────────
  it('correct code succeeds exactly once even with 20 parallel correct submissions (one SUCCESS, others EXPIRED)', async () => {
    const phone = trackPhone('9876543802');
    const correctCode = '222222';

    await service.storeOtp(phone, correctCode, 600);

    // Fire 20 parallel correct submissions
    const promises = Array.from({ length: 20 }, () =>
      service.verifyOtp(phone, correctCode)
    );
    const results = await Promise.all(promises);

    const successCount = results.filter((r) => r.status === 'SUCCESS').length;
    const expiredCount = results.filter((r) => r.status === 'EXPIRED').length;
    const invalidCount = results.filter((r) => r.status === 'INVALID').length;
    const lockedCount = results.filter((r) => r.status === 'LOCKED_OUT').length;

    // Invariant: Exactly ONE request succeeds; all others observe burned/expired state
    expect(successCount).toBe(1);
    expect(expiredCount).toBe(19);
    expect(invalidCount).toBe(0);
    expect(lockedCount).toBe(0);
  });

  // ── 3. Phone-Bound HMAC Isolation ─────────────────────────────────
  it('a hash stored for phone A does not validate for phone B with the same code', async () => {
    const phoneA = trackPhone('9876543803');
    const phoneB = trackPhone('9876543804');
    const sharedCode = '333333';

    // Store OTP for Phone A
    await service.storeOtp(phoneA, sharedCode, 600);

    // Copy Phone A's raw hash directly into Phone B's OTP redis key to simulate an attempted hash replay
    const rawHashData = await redisClient.hget(`auth:otp:${phoneA}`, 'hash');
    expect(rawHashData).toBeDefined();
    await redisClient.hset(`auth:otp:${phoneB}`, 'hash', rawHashData!, 'attempts', '0');
    await redisClient.expire(`auth:otp:${phoneB}`, 600);

    // Verify Phone B with the exact same code
    const resultB = await service.verifyOtp(phoneB, sharedCode);

    // Invariant: Because hash is HMAC(pepper, `${phone}|${code}`), Phone A's hash fails for Phone B!
    expect(resultB.status).toBe('INVALID');
    expect((resultB as { attemptsRemaining: number }).attemptsRemaining).toBe(2);

    // Verify Phone A still validates successfully
    const resultA = await service.verifyOtp(phoneA, sharedCode);
    expect(resultA.status).toBe('SUCCESS');
  });

  // ── 4. Lockout Expiration Cycle & Recovery ─────────────────────────
  it('after lockout TTL expires, a new send/verify cycle works cleanly', async () => {
    const phone = trackPhone('9876543805');
    const initialCode = '444444';
    const newCode = '555555';

    await service.storeOtp(phone, initialCode, 600);

    // Fail 3 times to trigger lockout
    await service.verifyOtp(phone, '000001');
    await service.verifyOtp(phone, '000002');
    const lockRes = await service.verifyOtp(phone, '000003');
    expect(lockRes.status).toBe('LOCKED_OUT');

    // Simulate lockout TTL expiration (set TTL to 1 second and wait 1.1s)
    await redisClient.expire(`auth:lockout:${phone}`, 1);
    await new Promise((r) => setTimeout(r, 1100));

    // Confirm lockout is expired
    const lockoutCheck = await service.isLockedOut(phone);
    expect(lockoutCheck.locked).toBe(false);

    // A new store/verify cycle must succeed
    await service.storeOtp(phone, newCode, 600);
    const verifyNew = await service.verifyOtp(phone, newCode);
    expect(verifyNew.status).toBe('SUCCESS');
  });

  // ── 5. Static AST / Grep Invariant Check ───────────────────────────
  it('grep: no HGETALL-then-HSET pattern remains in otp-redis.service.ts', () => {
    const serviceFilePath = path.resolve(__dirname, '../src/auth/otp-redis.service.ts');
    const content = fs.readFileSync(serviceFilePath, 'utf-8');

    // Invariant: hgetall must NOT appear in the service implementation
    expect(content).not.toMatch(/\.hgetall\s*\(/i);

    // Invariant: no incrementAndGetAttempts remains
    expect(content).not.toContain('incrementAndGetAttempts');

    // Invariant: no verifyOtpHash remains
    expect(content).not.toContain('verifyOtpHash');
  });

  // ── 6. Per-IP Verify Rate Limiting (30/hour) ───────────────────────
  it('enforces 30 verification attempts per hour per IP (sliding window)', async () => {
    const testIp = trackIp('198.51.100.123');

    // 30 verification attempts from the same IP pass
    for (let i = 1; i <= 30; i++) {
      const check = await service.checkVerifyIpRateLimit(testIp, 30);
      expect(check.allowed).toBe(true);
    }

    // 31st verification attempt from that IP is rejected
    const blockedCheck = await service.checkVerifyIpRateLimit(testIp, 30);
    expect(blockedCheck.allowed).toBe(false);
    expect(blockedCheck.retryAfter).toBe(3600);
  });
});
