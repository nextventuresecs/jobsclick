import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { ThrottlerGuard } from '@nestjs/throttler';
import { OtpRedisService } from '../src/auth/otp-redis.service.js';
import { OtpGenerator } from '../src/auth/otp-generator.service.js';

class MockOtpGenerator extends OtpGenerator {
  override generate(): string {
    return '123456';
  }
}

describe('AuthController (e2e) - Issues #6, #7, #8', () => {
  let app: NestFastifyApplication;
  let authToken = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(OtpGenerator)
      .useClass(MockOtpGenerator)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/send-otp - sends OTP successfully and enforces cool-down', async () => {
    await app.get(OtpRedisService).resetForTest('9876543299');

    const res1 = await app.inject({
      method: 'POST',
      url: '/auth/send-otp',
      payload: { phone: '9876543299' },
    });

    expect(res1.statusCode).toBe(201);
    const body1 = JSON.parse(res1.payload);
    expect(body1.success).toBe(true);
    expect(body1.cooldownSeconds).toBe(60);

    // Immediate second request should be blocked by cool-down (HTTP 429 per AUTH-03)
    const res2 = await app.inject({
      method: 'POST',
      url: '/auth/send-otp',
      payload: { phone: '9876543299' },
    });

    expect(res2.statusCode).toBe(429);
    const body2 = JSON.parse(res2.payload);
    expect(body2.message).toContain('Please wait');
  });

  it('POST /auth/verify-otp - verifies OTP code and returns access token + role', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: { phone: '9876543299', code: '123456', role: 'employer' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.accessToken).toBeDefined();
    expect(body.user.phone).toBe('9876543299');
    expect(body.user.role).toBe('employer');
    authToken = body.accessToken;
  });

  it('POST /auth/email/add & /auth/email/verify - handles secondary email verification', async () => {
    const resAdd = await app.inject({
      method: 'POST',
      url: '/auth/email/add',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { email: 'employer@msme.in' },
    });

    expect(resAdd.statusCode).toBe(201);
    const bodyAdd = JSON.parse(resAdd.payload);
    expect(bodyAdd.success).toBe(true);
  });

  it('POST /auth/sign-out-all - signs out of all devices', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sign-out-all',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
  });
});
