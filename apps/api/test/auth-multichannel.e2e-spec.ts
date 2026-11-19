import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('Auth Multichannel Endpoints (E2E)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['JWT_SECRET'] = 'test-secret-at-least-32-characters-long!!';
    process.env['TURNSTILE_SECRET_KEY'] = '1x0000000000000000000000000000000AA';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('POST /auth/email/send-otp dispatches OTP and POST /auth/email/verify-otp creates user with requiresPhoneLink', async () => {
    const testEmail = `seeker_${Date.now()}@test-domain.ac.in`;

    // 1. Send Email OTP
    const sendRes = await app.inject({
      method: 'POST',
      url: '/auth/email/send-otp',
      payload: {
        email: testEmail,
        role: 'job_seeker',
        turnstileToken: 'turnstile_pass_token',
      },
    });

    expect([200, 201]).toContain(sendRes.statusCode);
    const sendBody = JSON.parse(sendRes.payload);
    expect(sendBody.success).toBe(true);
    expect(sendBody).toHaveProperty('expiresInSeconds', 300);

    // 2. Verify Email OTP
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/auth/email/verify-otp',
      payload: {
        email: testEmail,
        code: sendBody.codeForTest || '123456',
        role: 'job_seeker',
      },
    });

    expect([200, 201]).toContain(verifyRes.statusCode);
    const verifyBody = JSON.parse(verifyRes.payload);
    expect(verifyBody.success).toBe(true);
    expect(verifyBody).toHaveProperty('accessToken');
    expect(verifyBody.user).toHaveProperty('email', testEmail);
    expect(verifyBody.user.requiresPhoneLink).toBe(true);
  });

  it('POST /auth/oauth/exchange exchanges valid provider token for session with requiresPhoneLink', async () => {
    const testGoogleEmail = `google_${Date.now()}@gmail.com`;

    const res = await app.inject({
      method: 'POST',
      url: '/auth/oauth/exchange',
      payload: {
        providerToken: `mock_provider_token:${testGoogleEmail}`,
        role: 'employer',
      },
    });

    expect([200, 201]).toContain(res.statusCode);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body).toHaveProperty('accessToken');
    expect(body.user.role).toBe('employer');
    expect(body.user.email).toBe(testGoogleEmail);
    expect(body.user.requiresPhoneLink).toBe(true);
  });

  it('POST /auth/link-phone/send and POST /auth/link-phone/verify links mobile number to account', async () => {
    // 1. Create email-first user
    const testEmail = `linkphone_${Date.now()}@example.com`;
    const sendRes = await app.inject({
      method: 'POST',
      url: '/auth/email/send-otp',
      payload: {
        email: testEmail,
        role: 'job_seeker',
        turnstileToken: 'turnstile_pass_token',
      },
    });
    const sendBody = JSON.parse(sendRes.payload);

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/auth/email/verify-otp',
      payload: {
        email: testEmail,
        code: sendBody.codeForTest || '123456',
        role: 'job_seeker',
      },
    });
    const verifyBody = JSON.parse(verifyRes.payload);
    const token = verifyBody.accessToken;
    expect(verifyBody.user.requiresPhoneLink).toBe(true);

    // Generate a unique 10-digit Indian phone (e.g., 9820000000 + random 5 digits)
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    const validPhone = `98200${randomSuffix}`;

    // 2. Request OTP to link phone
    const linkSendRes = await app.inject({
      method: 'POST',
      url: '/auth/link-phone/send',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        phone: validPhone,
        turnstileToken: 'turnstile_pass_token',
      },
    });

    expect([200, 201]).toContain(linkSendRes.statusCode);
    const linkSendBody = JSON.parse(linkSendRes.payload);
    expect(linkSendBody.success).toBe(true);
    expect(linkSendBody).toHaveProperty('expiresInSeconds', 300);

    // 3. Verify OTP to link phone
    const linkVerifyRes = await app.inject({
      method: 'POST',
      url: '/auth/link-phone/verify',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        phone: validPhone,
        code: linkSendBody.codeForTest || '123456',
      },
    });

    expect([200, 201]).toContain(linkVerifyRes.statusCode);
    const linkVerifyBody = JSON.parse(linkVerifyRes.payload);
    expect(linkVerifyBody.success).toBe(true);
    expect(linkVerifyBody.user.phone).toBe(validPhone);
    expect(linkVerifyBody.user.requiresPhoneLink).toBe(false);
  });
});
