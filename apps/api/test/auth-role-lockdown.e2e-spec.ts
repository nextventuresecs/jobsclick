import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { OtpGenerator } from '../src/auth/otp-generator.service.js';
import { UserRepository } from '../src/database/repositories/user.repository.js';
import { OtpRedisService } from '../src/auth/otp-redis.service.js';

class MockOtpGenerator extends OtpGenerator {
  override generate(): string {
    return '123456';
  }
}

describe('Audit P0-5 & PR #97: Role Lockdown & Indian Phone Normalization (E2E)', () => {
  let app: NestFastifyApplication;
  let userRepo: UserRepository;
  let otpRedisService: OtpRedisService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OtpGenerator)
      .useClass(MockOtpGenerator)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    userRepo = app.get(UserRepository);
    otpRedisService = app.get(OtpRedisService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Table-Driven Role Whitelist Matrix for /auth/verify-otp', () => {
    const testCases: Array<{
      role: unknown;
      expectedStatus: number;
      isAllowed: boolean;
      label: string;
    }> = [
      // Allowed Self-Signup Roles
      { role: 'job_seeker', expectedStatus: 201, isAllowed: true, label: 'valid job_seeker role' },
      { role: 'employer', expectedStatus: 201, isAllowed: true, label: 'valid employer role' },

      // Forbidden Backend Elevated Roles
      { role: 'intermediary', expectedStatus: 400, isAllowed: false, label: 'elevated intermediary role' },
      { role: 'admin', expectedStatus: 400, isAllowed: false, label: 'elevated admin role' },
      { role: 'msme_admin', expectedStatus: 400, isAllowed: false, label: 'elevated msme_admin role' },

      // Forbidden Client Roles
      { role: 'jobseeker', expectedStatus: 400, isAllowed: false, label: 'client role jobseeker' },
      { role: 'institution', expectedStatus: 400, isAllowed: false, label: 'client role institution' },
      { role: 'msme_dept', expectedStatus: 400, isAllowed: false, label: 'client role msme_dept' },
      { role: 'platform_admin', expectedStatus: 400, isAllowed: false, label: 'client role platform_admin' },
      { role: 'institution_admin', expectedStatus: 400, isAllowed: false, label: 'legacy institution_admin role' },

      // Forbidden Arbitrary & Casing Variants
      { role: '', expectedStatus: 400, isAllowed: false, label: 'empty string' },
      { role: null, expectedStatus: 400, isAllowed: false, label: 'null value' },
      { role: 'ADMIN', expectedStatus: 400, isAllowed: false, label: 'uppercase ADMIN' },
      { role: 'superadmin', expectedStatus: 400, isAllowed: false, label: 'arbitrary role string' },
    ];

    let phoneCounter = 9810000000;

    for (const tc of testCases) {
      it(`enforces role gate for "${tc.label}" (role: ${JSON.stringify(tc.role)}) -> HTTP ${tc.expectedStatus}`, async () => {
        const countBefore = (await userRepo.findAll()).length;
        const testPhone = `${phoneCounter++}`;
        await otpRedisService.resetForTest(testPhone);

        // Pre-dispatch OTP so valid attempts have an active OTP record
        if (tc.isAllowed) {
          const sendRes = await app.inject({
            method: 'POST',
            url: '/auth/send-otp',
            payload: { phone: testPhone },
          });
          expect(sendRes.statusCode).toBe(201);
        }

        const verifyRes = await app.inject({
          method: 'POST',
          url: '/auth/verify-otp',
          payload: {
            phone: testPhone,
            code: '123456',
            role: tc.role,
          },
        });

        expect(verifyRes.statusCode).toBe(tc.expectedStatus);

        const storedUser = await userRepo.findByPhone(testPhone);
        const countAfter = (await userRepo.findAll()).length;

        if (tc.isAllowed) {
          expect(storedUser).toBeDefined();
          expect(storedUser?.role).toBe(tc.role);
          expect(countAfter).toBe(countBefore + 1);
        } else {
          // Hard Invariant: No user record created for rejected roles (repo count unchanged)
          expect(storedUser).toBeNull();
          expect(countAfter).toBe(countBefore);
        }
      });
    }

    it('asserts valid employer self-signup explicitly creates user with persisted role === "employer"', async () => {
      const employerPhone = '9819999001';
      await otpRedisService.resetForTest(employerPhone);
      const countBefore = (await userRepo.findAll()).length;

      const sendRes = await app.inject({
        method: 'POST',
        url: '/auth/send-otp',
        payload: { phone: employerPhone },
      });
      expect(sendRes.statusCode).toBe(201);

      const verifyRes = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        payload: {
          phone: employerPhone,
          code: '123456',
          role: 'employer',
        },
      });
      expect(verifyRes.statusCode).toBe(201);

      const storedUser = await userRepo.findByPhone(employerPhone);
      expect(storedUser).toBeDefined();
      expect(storedUser?.role).toBe('employer');

      const countAfter = (await userRepo.findAll()).length;
      expect(countAfter).toBe(countBefore + 1);
    });

    it('asserts omitted role in verify-otp payload defaults cleanly to "job_seeker"', async () => {
      const defaultPhone = '9819999002';
      await otpRedisService.resetForTest(defaultPhone);
      const countBefore = (await userRepo.findAll()).length;

      const sendRes = await app.inject({
        method: 'POST',
        url: '/auth/send-otp',
        payload: { phone: defaultPhone },
      });
      expect(sendRes.statusCode).toBe(201);

      // Verify payload without 'role' field
      const verifyRes = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        payload: {
          phone: defaultPhone,
          code: '123456',
        },
      });
      expect(verifyRes.statusCode).toBe(201);

      const storedUser = await userRepo.findByPhone(defaultPhone);
      expect(storedUser).toBeDefined();
      expect(storedUser?.role).toBe('job_seeker');

      const countAfter = (await userRepo.findAll()).length;
      expect(countAfter).toBe(countBefore + 1);
    });
  });

  describe('Existing User Role Preservation', () => {
    it('preserves stored role when existing job_seeker logs in with role: "employer"', async () => {
      const phone = '9822200001';
      await otpRedisService.resetForTest(phone);

      // 1. Seed existing user with role job_seeker
      await userRepo.save({
        id: 'usr_existing_seeker_01',
        phone,
        email: null,
        role: 'job_seeker',
        status: 'active',
        source: 'seed',
        created_by: null,
        updated_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // 2. Dispatch OTP
      await app.inject({
        method: 'POST',
        url: '/auth/send-otp',
        payload: { phone },
      });

      // 3. User attempts to submit role: 'employer'
      const verifyRes = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        payload: {
          phone,
          code: '123456',
          role: 'employer',
        },
      });

      expect([200, 201]).toContain(verifyRes.statusCode);
      const data = verifyRes.json();
      expect(data.user.role).toBe('job_seeker'); // Must preserve database role

      // 4. Check persistent record in database
      const userInDb = await userRepo.findByPhone(phone);
      expect(userInDb?.role).toBe('job_seeker');
    });
  });

  describe('IndianPhoneSchema Normalization & Cooldown Rate-Limit Mapping (Uses ioredis-mock)', () => {
    it('maps "+91 98765-43210" and "919876543210" to same rate limit cooldown key in ioredis-mock and blocks second request with COOLDOWN (429)', async () => {
      // NOTE: This test runs against the in-memory ioredis-mock client active during test runs.
      const canonicalPhone = '9876543210';
      const formatA = '+91 98765-43210';
      const formatB = '919876543210';

      await otpRedisService.resetForTest(canonicalPhone);

      // 1. Send OTP using format A
      const sendResA = await app.inject({
        method: 'POST',
        url: '/auth/send-otp',
        payload: { phone: formatA },
      });
      expect(sendResA.statusCode).toBe(201);

      // Assert that ioredis-mock stored the cooldown under the canonical phone key
      const expectedCooldownKey = `auth:cooldown:${canonicalPhone}`;
      const cooldownVal = await otpRedisService.client.get(expectedCooldownKey);
      expect(cooldownVal).toBe('1');

      // Assert that unnormalized keys were NEVER created in Redis
      expect(await otpRedisService.client.get(`auth:cooldown:${formatA}`)).toBeNull();
      expect(await otpRedisService.client.get(`auth:cooldown:${formatB}`)).toBeNull();

      // 2. Immediate second request using format B must be blocked by the 60s cool-down (returns HTTP 400 Bad Request)
      const sendResB = await app.inject({
        method: 'POST',
        url: '/auth/send-otp',
        payload: { phone: formatB },
      });
      expect(sendResB.statusCode).toBe(429);
      expect(sendResB.headers['retry-after']).toBeDefined();
      const bodyB = sendResB.json();
      expect(bodyB.message).toMatch(/Please wait \d+ seconds before requesting a new OTP/);

      // 3. Verify OTP using format A creates user with canonical 10-digit phone
      const verifyResA = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        payload: {
          phone: formatA,
          code: '123456',
        },
      });
      expect([200, 201]).toContain(verifyResA.statusCode);
      const dataA = verifyResA.json();
      expect(dataA.user.phone).toBe(canonicalPhone);

      // 4. Reset OTP in Redis and verify that format B resolves the same user record
      await otpRedisService.storeOtp(canonicalPhone, '123456', 300);
      const verifyResB = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        payload: {
          phone: formatB,
          code: '123456',
        },
      });
      expect([200, 201]).toContain(verifyResB.statusCode);
      const dataB = verifyResB.json();
      expect(dataB.user.id).toBe(dataA.user.id);
      expect(dataB.user.phone).toBe(canonicalPhone);
    });
  });
});
