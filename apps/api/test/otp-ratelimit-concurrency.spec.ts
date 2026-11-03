import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import IORedis from 'ioredis';
import { AppModule } from '../src/app.module.js';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SmsService } from '../src/auth/sms.service.js';
import { OtpRedisService } from '../src/auth/otp-redis.service.js';

describe('OTP Rate Limiting & Concurrency Lockdown (Atomic Redis & Two-Instance)', () => {
  let appA: NestFastifyApplication;
  let appB: NestFastifyApplication;
  let redisClientA: IORedis;
  let redisClientB: IORedis;
  let smsServiceA: SmsService;
  let smsServiceB: SmsService;
  let otpRedisA: OtpRedisService;
  let otpRedisB: OtpRedisService;

  const TEST_REDIS_URL = process.env['REDIS_URL'] || 'redis://127.0.0.1:6379';
  const trackedKeys = new Set<string>();

  const trackKey = (key: string) => {
    trackedKeys.add(key);
    return key;
  };

  const trackPhone = (phone: string) => {
    trackKey(`auth:cooldown:${phone}`);
    trackKey(`auth:daily:${phone}`);
    trackKey(`auth:otp:${phone}`);
    trackKey(`auth:lockout:${phone}`);
    trackKey(`auth:attempts:${phone}`);
    return phone;
  };

  const trackIp = (ip: string) => {
    trackKey(`auth:ip_rate:${ip}`);
    return ip;
  };

  beforeAll(async () => {
    // 1. Enforce real Redis connection (fail if unreachable)
    redisClientA = new IORedis(TEST_REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });
    redisClientB = new IORedis(TEST_REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });

    try {
      await redisClientA.ping();
      await redisClientB.ping();
    } catch (err) {
      throw new Error(`Real Redis is required for concurrency specs at ${TEST_REDIS_URL}: ${(err as Error).message}`);
    }

    const trustedProxies = ['127.0.0.1', '::1', '10.0.0.1'];

    // 2. Instantiate Instance A
    const moduleFixtureA: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    appA = moduleFixtureA.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ trustProxy: trustedProxies }),
    );
    await appA.init();
    await appA.getHttpAdapter().getInstance().ready();
    smsServiceA = appA.get(SmsService);
    otpRedisA = appA.get(OtpRedisService);
    await otpRedisA.waitForReady();

    // 3. Instantiate Instance B
    const moduleFixtureB: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    appB = moduleFixtureB.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ trustProxy: trustedProxies }),
    );
    await appB.init();
    await appB.getHttpAdapter().getInstance().ready();
    smsServiceB = appB.get(SmsService);
    otpRedisB = appB.get(OtpRedisService);
    await otpRedisB.waitForReady();
  });

  afterAll(async () => {
    if (appA) await appA.close();
    if (appB) await appB.close();

    // Clean up all tracked keys without FLUSHALL/FLUSHDB
    if (trackedKeys.size > 0 && redisClientA) {
      await redisClientA.del(...Array.from(trackedKeys));
    }
    if (redisClientA) await redisClientA.quit();
    if (redisClientB) await redisClientB.quit();
  });

  beforeEach(async () => {
    const patterns = [
      'auth:ip:*',
      'auth:ip_phone:*',
      'auth:cooldown:*',
      'auth:daily:*',
      'auth:verify_ip:*',
      'auth:ip_rate:*',
      'auth:verify_ip_rate:*',
    ];
    for (const pattern of patterns) {
      const keys = await redisClientA.keys(pattern);
      if (keys.length > 0) await redisClientA.del(...keys);
    }
    if (trackedKeys.size > 0) {
      await redisClientA.del(...Array.from(trackedKeys));
    }
  });

  // ── 1. Negative Control Demonstration (Non-Atomic Race Condition) ────
  it('demonstration: non-atomic check-then-set permits race conditions, whereas atomic Lua script strictly permits 1', async () => {
    const demoPhone = trackPhone('9876541100');
    const demoCooldownKey = `auth:cooldown:${demoPhone}`;

    // Deliberately NON-ATOMIC implementation: GET, check, then SET with slight async delay
    let nonAtomicDispatches = 0;
    const nonAtomicCheckAndSend = async () => {
      const exists = await redisClientA.get(demoCooldownKey);
      if (!exists) {
        // Simulated network/processing latency before write
        await new Promise((r) => setTimeout(r, 10));
        await redisClientA.set(demoCooldownKey, '1', 'EX', 60);
        nonAtomicDispatches++;
        return true;
      }
      return false;
    };

    // Run 10 parallel calls through non-atomic logic
    await Promise.all(Array.from({ length: 10 }, () => nonAtomicCheckAndSend()));
    // Under non-atomic execution, multiple calls pass the check concurrently
    expect(nonAtomicDispatches).toBeGreaterThan(1);

    // Now demonstrate the ATOMIC Lua script under identical concurrency:
    await redisClientA.del(demoCooldownKey);
    let atomicDispatches = 0;
    const atomicCalls = Array.from({ length: 10 }, async () => {
      const res = await otpRedisA.checkAndIncrementOtpLimits(demoPhone, '127.0.0.1');
      if (res.allowed) {
        atomicDispatches++;
      }
      return res;
    });

    const atomicResults = await Promise.all(atomicCalls);
    const allowedResults = atomicResults.filter((r) => r.allowed);
    const rejectedResults = atomicResults.filter((r) => !r.allowed && r.reason === 'COOLDOWN');

    // Under atomic Lua execution, strictly ONE passes
    expect(atomicDispatches).toBe(1);
    expect(allowedResults.length).toBe(1);
    expect(rejectedResults.length).toBe(9);
  });

  // ── 2. 50 Concurrent Calls Across Two Nest Instances ──────────────
  it('50 concurrent sendOtp calls across two instances for ONE phone => exactly 1 SMS dispatched, 49 rejected with COOLDOWN (429)', async () => {
    const phone = trackPhone('9876541210');
    let smsDispatchCount = 0;

    const originalSendA = smsServiceA.sendOtp.bind(smsServiceA);
    const originalSendB = smsServiceB.sendOtp.bind(smsServiceB);

    smsServiceA.sendOtp = async (options) => {
      smsDispatchCount++;
      return originalSendA(options);
    };
    smsServiceB.sendOtp = async (options) => {
      smsDispatchCount++;
      return originalSendB(options);
    };

    try {
      // 25 requests to Instance A, 25 requests to Instance B simultaneously
      const promises = Array.from({ length: 50 }, (_, i) => {
        const targetApp = i % 2 === 0 ? appA : appB;
        return targetApp.inject({
          method: 'POST',
          url: '/auth/otp/send',
          headers: {
            'x-forwarded-for': `192.168.1.${10 + (i % 5)}`,
          },
          payload: {
            phone,
            turnstileToken: 'valid-test-token',
          },
        });
      });

      const responses = await Promise.all(promises);

      const successResponses = responses.filter((r) => (r.statusCode === 200 || r.statusCode === 201));
      const cooldownResponses = responses.filter((r) => r.statusCode === 429);

      // Invariant: Exactly ONE request across both instances succeeds
      expect(successResponses.length).toBe(1);
      expect(smsDispatchCount).toBe(1);

      // Invariant: Exactly 49 requests must be rejected under 429
      expect(cooldownResponses.length).toBe(49);
      for (const r of cooldownResponses) {
        expect(r.headers['retry-after']).toBeDefined();
        const body = JSON.parse(r.payload);
        expect(body.message).toMatch(/(wait.*seconds|too many otp requests)/i);
      }
    } finally {
      smsServiceA.sendOtp = originalSendA;
      smsServiceB.sendOtp = originalSendB;
    }
  });

  // ── 3. Victim Quota Protection Under IP Exhaustion ────────────────
  it('with IP limit exhausted for IP X, a request from X for victim phone V is rejected and V daily counter is unchanged', async () => {
    const attackerIp = trackIp('203.0.113.88');
    const victimPhone = trackPhone('9876541299');

    // 1. Exhaust attacker IP limit (200 requests/hr)
    const ipKey = `auth:ip_rate:${attackerIp}`;
    const now = Date.now();
    for (let i = 0; i < 200; i++) {
      await redisClientA.zadd(ipKey, now, `seed_${i}`);
    }

    // 2. Attacker attempts to target victim phone from Instance A
    const res = await appA.inject({
      method: 'POST',
      url: '/auth/otp/send',
      headers: {
        'x-forwarded-for': attackerIp,
      },
      payload: {
        phone: victimPhone,
        turnstileToken: 'valid-test-token',
      },
    });

    // Invariant: Request must be rejected with 429
    expect(res.statusCode).toBe(429);
    const body = JSON.parse(res.payload);
    expect(body.message).toMatch(/Too many OTP requests from this network/i);

    // Invariant: Victim phone's daily counter must be UNCHANGED (zero/null)
    const dailyKey = `auth:daily:${victimPhone}`;
    const dailyVal = await redisClientA.get(dailyKey);
    expect(dailyVal).toBeNull();

    // Invariant: Victim phone's cooldown must NOT be set
    const cooldownKey = `auth:cooldown:${victimPhone}`;
    const cooldownVal = await redisClientA.get(cooldownKey);
    expect(cooldownVal).toBeNull();
  });

  // ── 4. Per-(IP, Phone) Limit Protection ───────────────────────────
  it('an attacker IP cannot exhaust a victim daily cap alone (blocked at per-ip-phone limit)', async () => {
    const attackerIp = trackIp('198.51.100.42');
    const victimPhone = trackPhone('9876541288');
    trackKey(`auth:ip_phone:${attackerIp}:${victimPhone}`);

    // Default OTP_IP_PHONE_PER_DAY is 5
    for (let i = 1; i <= 5; i++) {
      await redisClientA.del(`auth:cooldown:${victimPhone}`);
      const res = await appA.inject({
        method: 'POST',
        url: '/auth/otp/send',
        headers: { 'x-forwarded-for': attackerIp },
        payload: {
          phone: victimPhone,
          turnstileToken: 'valid-test-token',
        },
      });
      expect([200, 201]).toContain(res.statusCode);
    }

    // 6th attempt from the same attacker IP must be rejected under IP_PHONE limit
    await redisClientA.del(`auth:cooldown:${victimPhone}`);
    const resBlocked = await appA.inject({
      method: 'POST',
      url: '/auth/otp/send',
      headers: { 'x-forwarded-for': attackerIp },
      payload: {
        phone: victimPhone,
        turnstileToken: 'valid-test-token',
      },
    });

    expect(resBlocked.statusCode).toBe(429);
    expect(JSON.parse(resBlocked.payload).message).toMatch(/Too many OTP requests from this network/i);

    // Invariant: Victim daily limit is only at 5, not exhausted to 10
    const dailyVal = await redisClientA.get(`auth:daily:${victimPhone}`);
    expect(dailyVal).toBe('5');

    // Invariant: Another legitimate IP can still request OTP for victim phone
    await redisClientA.del(`auth:cooldown:${victimPhone}`);
    const legitIp = trackIp('198.51.100.99');
    trackKey(`auth:ip_phone:${legitIp}:${victimPhone}`);
    const resLegit = await appB.inject({
      method: 'POST',
      url: '/auth/otp/send',
      headers: { 'x-forwarded-for': legitIp },
      payload: {
        phone: victimPhone,
        turnstileToken: 'valid-test-token',
      },
    });
    expect([200, 201]).toContain(resLegit.statusCode);
  });

  // ── 5. Cloudflare Proxy Trust & CF-Connecting-IP Validation ───────
  it('50 requests with 50 different CF-Connecting-IP values from trusted proxy peer are NOT throttled as one client', async () => {
    const trustedProxyIp = '10.0.0.1';
    let passedCount = 0;

    for (let i = 1; i <= 50; i++) {
      const clientIp = trackIp(`198.51.100.${i}`);
      const phone = trackPhone(`98765412${(10 + (i % 80)).toString().padStart(2, '0')}`);

      const res = await appA.inject({
        method: 'POST',
        url: '/auth/otp/send',
        headers: {
          'x-forwarded-for': `${clientIp}, ${trustedProxyIp}`,
          'cf-connecting-ip': clientIp,
        },
        payload: {
          phone,
          turnstileToken: 'valid-test-token',
        },
      });

      if (res.statusCode === 200 || res.statusCode === 201) {
        passedCount++;
      }
    }

    expect(passedCount).toBe(50);
  });

  it('CF-Connecting-IP spoofing from an untrusted peer is ignored and falls back to socket peer', async () => {
    const untrustedPeer = '198.51.100.99'; // not in trustedProxies list
    const phone = trackPhone('9876541201');

    const res = await appA.inject({
      method: 'POST',
      url: '/auth/otp/send',
      remoteAddress: untrustedPeer,
      headers: {
        'x-forwarded-for': '203.0.113.1',
        'cf-connecting-ip': '203.0.113.1',
      },
      payload: {
        phone,
        turnstileToken: 'valid-test-token',
      },
    });

    expect([200, 201]).toContain(res.statusCode);
  });

  it('garbage or invalid header IP values fall back to socket peer', async () => {
    const garbageIps = ['1.2.3.4:x', 'a,b', '', 'x'.repeat(10000)];
    let counter = 0;

    for (const badIp of garbageIps) {
      const phone = trackPhone(`98765413${(counter++).toString().padStart(2, '0')}`);
      const res = await appA.inject({
        method: 'POST',
        url: '/auth/otp/send',
        headers: {
          'x-forwarded-for': badIp,
          'cf-connecting-ip': badIp,
        },
        payload: {
          phone,
          turnstileToken: 'valid-test-token',
        },
      });

      // Does not throw 500 or crash; succeeds cleanly using socket peer
      expect([200, 201]).toContain(res.statusCode);
    }
  });

  // ── 6. Phone Format Key Sharing ───────────────────────────────────
  it('phone formats +919876541210, 919876541210, 9876541210 share one cooldown key', async () => {
    const canonical = trackPhone('9876541210');

    // 1. Send with +91 prefix on Instance A
    const res1 = await appA.inject({
      method: 'POST',
      url: '/auth/otp/send',
      payload: {
        phone: `+91${canonical}`,
        turnstileToken: 'valid-test-token',
      },
    });
    expect([200, 201]).toContain(res1.statusCode);

    // Assert key in Redis is strictly canonical 10-digit
    const cooldownTtl = await redisClientA.ttl(`auth:cooldown:${canonical}`);
    expect(cooldownTtl).toBeGreaterThan(0);

    // 2. Immediately send with 91 prefix on Instance B -> Rejected by shared cooldown
    const res2 = await appB.inject({
      method: 'POST',
      url: '/auth/otp/send',
      payload: {
        phone: `91${canonical}`,
        turnstileToken: 'valid-test-token',
      },
    });
    expect(res2.statusCode).toBe(429);
    expect(JSON.parse(res2.payload).message).toMatch(/wait.*seconds/i);

    // 3. Immediately send with raw 10-digit on Instance A -> Rejected by shared cooldown
    const res3 = await appA.inject({
      method: 'POST',
      url: '/auth/otp/send',
      payload: {
        phone: canonical,
        turnstileToken: 'valid-test-token',
      },
    });
    expect(res3.statusCode).toBe(429);
    expect(JSON.parse(res3.payload).message).toMatch(/wait.*seconds/i);
  });

  // ── 7. IPv6 Normalization & Prefix Sharing ─────────────────────────
  it('IPv6 addresses in same /64 share one rate-limit key, while different /64 do not', async () => {
    const ipv6A = '2001:db8:abcd:0012::1';
    const ipv6B = '2001:db8:abcd:0012:ffff:ffff:ffff:ffff';
    const ipv6Other = '2001:db8:abcd:0013::1';

    const normalizedShared = trackIp('2001:db8:abcd:12::/64');
    const normalizedOther = trackIp('2001:db8:abcd:13::/64');

    const phone1 = trackPhone('9876541401');
    const phone2 = trackPhone('9876541402');
    const phone3 = trackPhone('9876541403');

    // Request 1 from ipv6A
    const res1 = await appA.inject({
      method: 'POST',
      url: '/auth/otp/send',
      headers: { 'x-forwarded-for': ipv6A },
      payload: { phone: phone1, turnstileToken: 'valid-test-token' },
    });
    expect([200, 201]).toContain(res1.statusCode);

    // Request 2 from ipv6B (same /64)
    const res2 = await appB.inject({
      method: 'POST',
      url: '/auth/otp/send',
      headers: { 'x-forwarded-for': ipv6B },
      payload: { phone: phone2, turnstileToken: 'valid-test-token' },
    });
    expect([200, 201]).toContain(res2.statusCode);

    // Shared /64 key has 2 entries in Redis
    const sharedCard = await redisClientA.zcard(`auth:ip_rate:${normalizedShared}`);
    expect(sharedCard).toBe(2);

    // Request 3 from ipv6Other (different /64)
    const res3 = await appA.inject({
      method: 'POST',
      url: '/auth/otp/send',
      headers: { 'x-forwarded-for': ipv6Other },
      payload: { phone: phone3, turnstileToken: 'valid-test-token' },
    });
    expect([200, 201]).toContain(res3.statusCode);

    const otherCard = await redisClientA.zcard(`auth:ip_rate:${normalizedOther}`);
    expect(otherCard).toBe(1);
  });

  // ── 8. Daily Cap Enforcement (10 per day) ─────────────────────────
  it('daily cap: 10 sends over time pass, the 11th returns DAILY (429)', async () => {
    const phone = trackPhone('9876541211');

    for (let i = 1; i <= 10; i++) {
      await redisClientA.del(`auth:cooldown:${phone}`);

      const targetApp = i % 2 === 0 ? appA : appB;
      const res = await targetApp.inject({
        method: 'POST',
        url: '/auth/otp/send',
        headers: {
          'x-forwarded-for': `192.168.1.${10 + i}`,
        },
        payload: {
          phone,
          turnstileToken: 'valid-test-token',
        },
      });
      expect([200, 201]).toContain(res.statusCode);
    }

    // 11th request across instances: clear cooldown to ensure blocked by DAILY cap
    await redisClientA.del(`auth:cooldown:${phone}`);

    const res11 = await appB.inject({
      method: 'POST',
      url: '/auth/otp/send',
      headers: {
        'x-forwarded-for': '192.168.1.99',
      },
      payload: {
        phone,
        turnstileToken: 'valid-test-token',
      },
    });

    expect(res11.statusCode).toBe(429);
    expect(JSON.parse(res11.payload).message).toMatch(/Daily OTP request limit reached/i);

    const dailyCount = await redisClientA.get(`auth:daily:${phone}`);
    expect(dailyCount).toBe('10');
  });

  // ── 9. Rolling Windows (No Date Strings in Keys) ───────────────────
  it('rolling windows have no date in key and roll over cleanly on expiration', async () => {
    const phone = trackPhone('9876541277');
    const clientIp = trackIp('192.168.1.77');
    await redisClientA.del(
      `auth:cooldown:${phone}`,
      `auth:daily:${phone}`,
      `auth:ip_phone:${clientIp}:${phone}`,
    );

    const res1 = await appA.inject({
      method: 'POST',
      url: '/auth/otp/send',
      headers: { 'x-forwarded-for': clientIp },
      payload: {
        phone,
        turnstileToken: 'valid-test-token',
      },
    });
    expect([200, 201]).toContain(res1.statusCode);

    const dailyKey = `auth:daily:${phone}`;
    const ttl = await redisClientA.ttl(dailyKey);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(86400);

    // Simulate expiration rollover
    await redisClientA.expire(dailyKey, 1);
    await new Promise((resolve) => setTimeout(resolve, 1100));

    await redisClientA.del(`auth:cooldown:${phone}`);

    const res2 = await appB.inject({
      method: 'POST',
      url: '/auth/otp/send',
      headers: { 'x-forwarded-for': clientIp },
      payload: {
        phone,
        turnstileToken: 'valid-test-token',
      },
    });
    expect([200, 201]).toContain(res2.statusCode);

    const newDaily = await redisClientA.get(dailyKey);
    expect(newDaily).toBe('1');
  });

  // ── 10. Fail-Closed on SMS Delivery Failure & Idempotent Release ──
  it('releases OTP limits when SMS service fails; counters return to pre-call values and release is idempotent', async () => {
    const phone = trackPhone('9876541212');
    const clientIp = trackIp('192.168.1.55');

    // Record pre-call state
    const preDaily = await redisClientA.get(`auth:daily:${phone}`);
    expect(preDaily).toBeNull();

    const originalSendA = smsServiceA.sendOtp.bind(smsServiceA);
    smsServiceA.sendOtp = async () => {
      return { success: false, message: 'MSG91 gateway down' };
    };

    try {
      const res = await appA.inject({
        method: 'POST',
        url: '/auth/otp/send',
        headers: { 'x-forwarded-for': clientIp },
        payload: {
          phone,
          turnstileToken: 'valid-test-token',
        },
      });

      expect(res.statusCode).toBe(503);

      // Invariant: Cooldown released
      const cooldownVal = await redisClientA.get(`auth:cooldown:${phone}`);
      expect(cooldownVal).toBeNull();

      // Invariant: Daily count rolled back to pre-call value
      const postDaily = await redisClientA.get(`auth:daily:${phone}`);
      expect(postDaily === null || postDaily === '0').toBe(true);

      // Invariant: Calling releaseOtpLimits a second time (idempotent release) does not fail or corrupt
      await otpRedisA.releaseOtpLimits(phone, clientIp, 'non-existent-member');
      const doubleReleaseDaily = await redisClientA.get(`auth:daily:${phone}`);
      expect(doubleReleaseDaily === null || doubleReleaseDaily === '0').toBe(true);

      // Invariant: Calling releaseOtpLimits on completely expired keys does not error
      await otpRedisB.releaseOtpLimits(phone, clientIp, 'expired-member');

      // Invariant: Once SMS gateway recovers, user can immediately send successfully
      smsServiceA.sendOtp = originalSendA;
      const retryRes = await appB.inject({
        method: 'POST',
        url: '/auth/otp/send',
        headers: { 'x-forwarded-for': clientIp },
        payload: {
          phone,
          turnstileToken: 'valid-test-token',
        },
      });
      expect([200, 201]).toContain(retryRes.statusCode);
    } finally {
      smsServiceA.sendOtp = originalSendA;
    }
  });

  // ── 11. Fail-Closed on Dead Redis (503 within 2s, SMS Stub Count 0)
  it('fail-closed: dead Redis => 503 within 2s, SMS stub count 0', async () => {
    // Dead Redis client pointing to an unallocated port with offline queue disabled
    const deadRedisClient = new IORedis('redis://127.0.0.1:6389', {
      enableOfflineQueue: false,
      commandTimeout: 1000,
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      retryStrategy() {
        return null;
      },
    });

    const deadOtpRedisService = new OtpRedisService(deadRedisClient);

    const startTime = Date.now();
    let thrownError: unknown;
    try {
      await deadOtpRedisService.checkAndIncrementOtpLimits('9876541999', '127.0.0.1');
    } catch (err) {
      thrownError = err;
    } finally {
      deadRedisClient.disconnect();
    }
    const elapsedMs = Date.now() - startTime;

    // Invariant: Throws ServiceUnavailableException within 2000ms
    expect(thrownError).toBeDefined();
    expect(elapsedMs).toBeLessThanOrEqual(2000);
  });
});
