import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { UserRepository } from '../src/database/repositories/user.repository.js';
import { OtpRedisService } from '../src/auth/otp-redis.service.js';
import { SignJWT } from 'jose';
import crypto from 'node:crypto';

describe('Server-Side State Validation & Session Revocation (P0-8, PR #97 B2)', () => {
  let appA: NestFastifyApplication;
  let appB: NestFastifyApplication;
  let authServiceA: AuthService;
  let userRepoA: UserRepository;
  let otpRedisA: OtpRedisService;
  let jwtServiceA: JwtService;

  beforeAll(async () => {
    // Instance A
    const moduleFixtureA: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    appA = moduleFixtureA.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await appA.init();
    await appA.getHttpAdapter().getInstance().ready();

    authServiceA = moduleFixtureA.get<AuthService>(AuthService);
    userRepoA = moduleFixtureA.get<UserRepository>(UserRepository);
    otpRedisA = moduleFixtureA.get<OtpRedisService>(OtpRedisService);
    jwtServiceA = moduleFixtureA.get<JwtService>(JwtService);

    // Instance B (sharing the same underlying Redis and persistent store)
    const moduleFixtureB: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    appB = moduleFixtureB.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await appB.init();
    await appB.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await appA.close();
    await appB.close();
  });

  // 1. Cryptographic and Token Claim Invariants
  describe('Cryptographic & Claim Boundary Rejections', () => {
    const validSecret = () => new TextEncoder().encode(process.env['JWT_SECRET']!);

    it('rejects token with no exp => 401', async () => {
      const secret = validSecret();
      const token = await new SignJWT({ tv: 0 })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject('usr_test_no_exp')
        .setIssuer('jobsclick-api')
        .setAudience('jobsclick-web')
        .setJti(crypto.randomUUID())
        .setIssuedAt()
        .sign(secret); // No expiration set

      const res = await appA.inject({
        method: 'POST',
        url: '/auth/sign-out-all',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects token with alg:none => 401', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          sub: 'usr_test_none',
          tv: 0,
          jti: crypto.randomUUID(),
          iss: 'jobsclick-api',
          aud: 'jobsclick-web',
          exp: Math.floor(Date.now() / 1000) + 1800,
        }),
      ).toString('base64url');
      const token = `${header}.${payload}.`;

      const res = await appA.inject({
        method: 'POST',
        url: '/auth/sign-out-all',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects RS256-labelled token => 401', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          sub: 'usr_test_rs256',
          tv: 0,
          jti: crypto.randomUUID(),
          iss: 'jobsclick-api',
          aud: 'jobsclick-web',
          exp: Math.floor(Date.now() / 1000) + 1800,
        }),
      ).toString('base64url');
      const token = `${header}.${payload}.fake_rsa_sig`;

      const res = await appA.inject({
        method: 'POST',
        url: '/auth/sign-out-all',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects wrong issuer => 401', async () => {
      const secret = validSecret();
      const token = await new SignJWT({ tv: 0 })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject('usr_test_wrong_iss')
        .setIssuer('fraudulent-issuer')
        .setAudience('jobsclick-web')
        .setJti(crypto.randomUUID())
        .setIssuedAt()
        .setExpirationTime('30m')
        .sign(secret);

      const res = await appA.inject({
        method: 'POST',
        url: '/auth/sign-out-all',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects wrong audience => 401', async () => {
      const secret = validSecret();
      const token = await new SignJWT({ tv: 0 })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject('usr_test_wrong_aud')
        .setIssuer('jobsclick-api')
        .setAudience('wrong-aud')
        .setJti(crypto.randomUUID())
        .setIssuedAt()
        .setExpirationTime('30m')
        .sign(secret);

      const res = await appA.inject({
        method: 'POST',
        url: '/auth/sign-out-all',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects missing tv claim => 401', async () => {
      const secret = validSecret();
      const token = await new SignJWT({}) // Missing tv
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject('usr_test_no_tv')
        .setIssuer('jobsclick-api')
        .setAudience('jobsclick-web')
        .setJti(crypto.randomUUID())
        .setIssuedAt()
        .setExpirationTime('30m')
        .sign(secret);

      const res = await appA.inject({
        method: 'POST',
        url: '/auth/sign-out-all',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects missing jti claim => 401', async () => {
      const secret = validSecret();
      const token = await new SignJWT({ tv: 0 }) // Missing jti
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject('usr_test_no_jti')
        .setIssuer('jobsclick-api')
        .setAudience('jobsclick-web')
        .setIssuedAt()
        .setExpirationTime('30m')
        .sign(secret);

      const res = await appA.inject({
        method: 'POST',
        url: '/auth/sign-out-all',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects tampered payload => 401', async () => {
      const secret = validSecret();
      const token = await new SignJWT({ tv: 0, role: 'job_seeker' })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject('usr_test_tamper')
        .setIssuer('jobsclick-api')
        .setAudience('jobsclick-web')
        .setJti(crypto.randomUUID())
        .setIssuedAt()
        .setExpirationTime('30m')
        .sign(secret);

      const [header, , sig] = token.split('.');
      const tamperedPayload = Buffer.from(
        JSON.stringify({
          sub: 'usr_test_tamper',
          role: 'admin',
          tv: 0,
          jti: crypto.randomUUID(),
          iss: 'jobsclick-api',
          aud: 'jobsclick-web',
          exp: Math.floor(Date.now() / 1000) + 1800,
        }),
      ).toString('base64url');

      const tamperedToken = `${header}.${tamperedPayload}.${sig}`;

      const res = await appA.inject({
        method: 'POST',
        url: '/auth/sign-out-all',
        headers: { authorization: `Bearer ${tamperedToken}` },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // 2. Cross-Instance Sign-Out-All
  describe('Cross-Instance Single Sign-Out (Instance A -> Instance B)', () => {
    it('login on instance A, sign-out-all on A, replay old token on instance B => 401', async () => {
      const phone = '9876543210';
      await otpRedisA.storeOtp(phone, '123456');

      // 1. Verify OTP on Instance A to obtain valid access token
      const verifyResA = await appA.inject({
        method: 'POST',
        url: '/auth/otp/verify',
        payload: { phone, code: '123456', role: 'job_seeker' },
      });
      expect(verifyResA.statusCode).toBe(201);
      const { accessToken } = JSON.parse(verifyResA.payload);
      expect(accessToken).toBeDefined();

      // 2. Verify token is valid on Instance B initially
      const checkResB1 = await appB.inject({
        method: 'POST',
        url: '/auth/email/add',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { email: 'crossinstance@example.com' },
      });
      expect(checkResB1.statusCode).toBe(201);

      // 3. User calls sign-out-all on Instance A
      const signOutResA = await appA.inject({
        method: 'POST',
        url: '/auth/sign-out-all',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(signOutResA.statusCode).toBe(201);

      // 4. Replay old token on Instance B => MUST return 401
      const checkResB2 = await appB.inject({
        method: 'POST',
        url: '/auth/email/add',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { email: 'replayattempt@example.com' },
      });
      expect(checkResB2.statusCode).toBe(401);
    });
  });

  // 3. Account Disabling
  describe('Account Disabling across instances', () => {
    it('disable the user in DB (token_version bump); old token => 401 on both instances', async () => {
      const user = await userRepoA.create({
        phone: '9876543211',
        role: 'employer',
        status: 'active',
      });

      const token = await jwtServiceA.signAccessToken(user.id, user.token_version ?? 0);

      // Verify token works initially on instance A and B
      const resA1 = await appA.inject({
        method: 'POST',
        url: '/auth/email/add',
        headers: { authorization: `Bearer ${token}` },
        payload: { email: 'emp_active@example.com' },
      });
      expect(resA1.statusCode).toBe(201);

      // Disable user in DB and bump token_version
      await userRepoA.update(user.id, {
        status: 'disabled',
        token_version: (user.token_version ?? 0) + 1,
      });
      await otpRedisA.deleteAuthState(user.id);

      // Old token must return 401 on both instances
      const resA2 = await appA.inject({
        method: 'POST',
        url: '/auth/email/add',
        headers: { authorization: `Bearer ${token}` },
        payload: { email: 'emp_disabled@example.com' },
      });
      expect(resA2.statusCode).toBe(401);

      const resB2 = await appB.inject({
        method: 'POST',
        url: '/auth/email/add',
        headers: { authorization: `Bearer ${token}` },
        payload: { email: 'emp_disabled@example.com' },
      });
      expect(resB2.statusCode).toBe(401);
    });
  });

  // 4. Server-Side Role Enforcement & Dynamic Demotion
  describe('Server-Side Dynamic Role Mutation', () => {
    it('change user role in DB; next request uses NEW role (admin-only route returns 403 after demotion)', async () => {
      const adminUser = await userRepoA.create({
        phone: '9876543212',
        role: 'admin',
        status: 'active',
      });

      const token = await jwtServiceA.signAccessToken(adminUser.id, adminUser.token_version ?? 0, {
        role: 'admin',
      });

      // Initially can access admin metrics
      const adminRes1 = await appA.inject({
        method: 'GET',
        url: '/admin/metrics',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(adminRes1.statusCode).toBe(200);

      // Demote admin to job_seeker in DB and refresh server-side state
      await userRepoA.update(adminUser.id, { role: 'job_seeker' });
      await otpRedisA.deleteAuthState(adminUser.id);

      // Next request with UNCHANGED token to admin-only endpoint MUST return 403
      const adminRes2 = await appA.inject({
        method: 'GET',
        url: '/admin/metrics',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(adminRes2.statusCode).toBe(403);
    });
  });

  // 5. Fail-Closed Redis Outage
  describe('Fail-Closed Under Redis Outage', () => {
    it('redis failure => 503 Service Unavailable, never 200 and never 401-then-allow', async () => {
      const user = await userRepoA.create({
        phone: '9876543213',
        role: 'job_seeker',
        status: 'active',
      });

      const token = await jwtServiceA.signAccessToken(user.id, user.token_version ?? 0);

      // Simulate Redis connection failure
      const originalGetAuthState = otpRedisA.getAuthState.bind(otpRedisA);
      otpRedisA.getAuthState = async () => {
        throw new Error('Connection refused: redis cluster unavailable');
      };

      try {
        const res = await appA.inject({
          method: 'POST',
          url: '/auth/email/add',
          headers: { authorization: `Bearer ${token}` },
          payload: { email: 'outage@example.com' },
        });

        expect(res.statusCode).toBe(503);
        expect(res.payload).toContain('temporarily unavailable');
      } finally {
        otpRedisA.getAuthState = originalGetAuthState;
      }
    });
  });

  // 6. Elimination of Test Backdoors in Production Module
  describe('Zero Test-Mode Backdoors in Production Module', () => {
    it("rejects 'x-user-id: anything' header with 401 in production module", async () => {
      const res = await appA.inject({
        method: 'POST',
        url: '/auth/sign-out-all',
        headers: { 'x-user-id': 'usr_admin_impersonator' },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects 'Bearer jwt_session_x_1' with 401 in production module", async () => {
      const res = await appA.inject({
        method: 'POST',
        url: '/auth/sign-out-all',
        headers: { authorization: 'Bearer jwt_session_x_1' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // 7. Memory Leak & Unbounded Map Verification
  describe('Memory Leak Prevention', () => {
    it('asserts localSessionCache and localTokenCache fields no longer exist on AuthService', () => {
      expect((authServiceA as unknown as Record<string, unknown>)['localSessionCache']).toBeUndefined();
      expect((authServiceA as unknown as Record<string, unknown>)['localTokenCache']).toBeUndefined();
    });
  });

  // 8. Unauthenticated Route Rejections
  describe('Unauthenticated Route Rejection', () => {
    it('/auth/email/add without a token => 401', async () => {
      const res = await appA.inject({
        method: 'POST',
        url: '/auth/email/add',
        payload: { email: 'notoken@example.com' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('/auth/sign-out-all without a token => 401', async () => {
      const res = await appA.inject({
        method: 'POST',
        url: '/auth/sign-out-all',
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
