import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';

describe('Feature Flags Default-OFF Gate Tests', () => {
  let app: NestFastifyApplication;

  const employerHeaders = {
    authorization: 'Bearer jwt_session_emp-01_1792520000',
  };

  const institutionHeaders = {
    authorization: 'Bearer jwt_session_inst-01_1792520000',
  };

  const adminHeaders = {
    authorization: 'Bearer jwt_session_admin-01_1792520000',
  };

  beforeAll(async () => {
    // Explicitly delete any flags from env to test out-of-the-box defaults
    delete process.env['ENABLE_P2_PAYMENTS'];
    delete process.env['ENABLE_P2_WALLET_RECHARGE'];
    delete process.env['ENABLE_P2_PLACEMENT_PIPELINE'];
    delete process.env['ENABLE_P2_FEATURED_PROMOTIONS'];
    delete process.env['ENABLE_P2_JOB_ALERTS'];
    delete process.env['ENABLE_P2_MSME_BROADCAST'];

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Wallet Recharge (GET /wallet/packs) returns 404 FEATURE_DISABLED by default', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/wallet/packs',
      headers: employerHeaders,
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('FEATURE_DISABLED');
  });

  it('2. Payment Gateway (POST /wallet/recharge/create-order) returns 404 FEATURE_DISABLED by default', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/wallet/recharge/create-order',
      headers: employerHeaders,
      payload: { packId: 'pack_100' },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('FEATURE_DISABLED');
  });

  it('3. Featured Promotions (POST /jobs/:id/promote) returns 404 FEATURE_DISABLED by default', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/jobs/job_123/promote',
      headers: employerHeaders,
      payload: { days: 7 },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('FEATURE_DISABLED');
  });

  it('4. Featured Job Deduction (POST /wallet/feature-job) returns 404 FEATURE_DISABLED by default', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/wallet/feature-job',
      headers: employerHeaders,
      payload: { jobId: 'job_123', days: 7 },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('FEATURE_DISABLED');
  });

  it('5. Placement Pipeline (GET /placement/tie-ups) returns 404 FEATURE_DISABLED by default', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/placement/tie-ups',
      headers: institutionHeaders,
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('FEATURE_DISABLED');
  });

  it('6. Institution Sponsorship (POST /institutions/:id/sponsorship/activate) returns 404 FEATURE_DISABLED by default', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/institutions/inst_123/sponsorship/activate',
      headers: institutionHeaders,
      payload: { tier: 'gold' },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('FEATURE_DISABLED');
  });

  it('7. Job Alerts (POST /jobs/alerts) returns 404 FEATURE_DISABLED by default', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/jobs/alerts',
      headers: employerHeaders,
      payload: { title: 'Engineer', keywords: ['Node'], minSalary: 30000 },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('FEATURE_DISABLED');
  });

  it('8. MSME Broadcast (POST /admin/broadcast/preview) returns 404 FEATURE_DISABLED by default', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/broadcast/preview',
      headers: adminHeaders,
      payload: { templateId: 'DLT_MSME_SUBSIDY_ALERT_EN', targetDistrict: 'Indore' },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('FEATURE_DISABLED');
  });

  it('9. Job Apply (POST /jobs/:id/apply) REMAINS ACTIVE (not 404 FEATURE_DISABLED)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/jobs/job_123/apply',
      headers: { authorization: 'Bearer jwt_session_seeker-01_1792520000' },
    });
    // May fail with 404 (Job Not Found) or 401, but MUST NOT be FEATURE_DISABLED
    if (res.statusCode === 404) {
      const body = JSON.parse(res.payload);
      expect(body.code).not.toBe('FEATURE_DISABLED');
    }
  });

  it('10. Candidate OTP Send (POST /auth/send-otp) REMAINS ACTIVE', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/send-otp',
      payload: { phone: '9876543210' },
    });
    expect(res.statusCode).toBe(201);
  });
});
