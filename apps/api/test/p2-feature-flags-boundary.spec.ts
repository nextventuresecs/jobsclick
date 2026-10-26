import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';

describe('Phase 2 Feature Flag Boundaries & Blast-Radius Verification (PRN-06)', () => {
  let app: NestFastifyApplication;

  const employerHeaders = {
    authorization: 'Bearer jwt_session_emp-01_1792520000',
  };

  const institutionHeaders = {
    authorization: 'Bearer jwt_session_inst-01_1792520000',
  };

  beforeAll(async () => {
    process.env['ENABLE_P2_PAYMENTS'] = 'true';
    process.env['ENABLE_P2_WALLET_RECHARGE'] = 'true';
    process.env['ENABLE_P2_PLACEMENT_PIPELINE'] = 'true';
    process.env['ENABLE_P2_FEATURED_PROMOTIONS'] = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(() => {
    process.env['ENABLE_P2_PAYMENTS'] = 'true';
    process.env['ENABLE_P2_WALLET_RECHARGE'] = 'true';
    process.env['ENABLE_P2_PLACEMENT_PIPELINE'] = 'true';
    process.env['ENABLE_P2_FEATURED_PROMOTIONS'] = 'true';
  });

  afterAll(async () => {
    process.env['ENABLE_P2_PAYMENTS'] = 'true';
    process.env['ENABLE_P2_WALLET_RECHARGE'] = 'true';
    process.env['ENABLE_P2_PLACEMENT_PIPELINE'] = 'true';
    process.env['ENABLE_P2_FEATURED_PROMOTIONS'] = 'true';
    await app.close();
  });

  // =========================================================================
  // 1. PAYMENT GATEWAY BOUNDARY (ENABLE_P2_PAYMENTS=false)
  // =========================================================================
  describe('Payment Gateway & Invoicing Boundary (ENABLE_P2_PAYMENTS=false)', () => {
    it('returns 404 FEATURE_DISABLED when attempting to create a recharge order', async () => {
      process.env['ENABLE_P2_PAYMENTS'] = 'false';

      const res = await app.inject({
        method: 'POST',
        url: '/wallet/recharge/create-order',
        headers: employerHeaders,
        payload: {
          packId: 'pack_100',
        },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('FEATURE_DISABLED');
    });

    it('returns 404 FEATURE_DISABLED when attempting to verify a payment', async () => {
      process.env['ENABLE_P2_PAYMENTS'] = 'false';

      const res = await app.inject({
        method: 'POST',
        url: '/wallet/recharge/verify',
        headers: employerHeaders,
        payload: {
          razorpayOrderId: 'order_test_123',
          razorpayPaymentId: 'pay_test_123',
          razorpaySignature: 'sig_test_123',
        },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('FEATURE_DISABLED');
    });

    it('returns 404 FEATURE_DISABLED when receiving incoming Razorpay webhooks', async () => {
      process.env['ENABLE_P2_PAYMENTS'] = 'false';

      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/razorpay',
        headers: {
          'x-razorpay-signature': 'sig_test',
        },
        payload: {
          event: 'payment.captured',
        },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('FEATURE_DISABLED');
    });

    it('returns 404 FEATURE_DISABLED on invoice retrieval endpoints', async () => {
      process.env['ENABLE_P2_PAYMENTS'] = 'false';

      const res = await app.inject({
        method: 'GET',
        url: '/wallet/invoice/pay_test_123',
        headers: employerHeaders,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('FEATURE_DISABLED');
    });

    it('returns 404 FEATURE_DISABLED when attempting institution sponsorship activation', async () => {
      process.env['ENABLE_P2_PAYMENTS'] = 'false';

      const res = await app.inject({
        method: 'POST',
        url: '/institutions/inst_123/sponsorship/activate',
        headers: institutionHeaders,
        payload: {
          tier: 'starter',
          academicYear: '2026-27',
        },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('FEATURE_DISABLED');
    });
  });

  // =========================================================================
  // 2. WALLET RECHARGE BOUNDARY (ENABLE_P2_WALLET_RECHARGE=false)
  // =========================================================================
  describe('Wallet Recharge Pack Boundary (ENABLE_P2_WALLET_RECHARGE=false)', () => {
    it('returns 404 FEATURE_DISABLED when querying credit packs', async () => {
      process.env['ENABLE_P2_WALLET_RECHARGE'] = 'false';

      const res = await app.inject({
        method: 'GET',
        url: '/wallet/packs',
        headers: employerHeaders,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('FEATURE_DISABLED');
    });
  });

  // =========================================================================
  // 3. PLACEMENT PIPELINE BOUNDARY (ENABLE_P2_PLACEMENT_PIPELINE=false)
  // =========================================================================
  describe('Placement Pipeline Boundary (ENABLE_P2_PLACEMENT_PIPELINE=false)', () => {
    it('blocks /placement/tie-ups with 404 FEATURE_DISABLED', async () => {
      process.env['ENABLE_P2_PLACEMENT_PIPELINE'] = 'false';

      const res = await app.inject({
        method: 'GET',
        url: '/placement/tie-ups',
        headers: institutionHeaders,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('FEATURE_DISABLED');
    });

    it('blocks /placement/pipeline with 404 FEATURE_DISABLED', async () => {
      process.env['ENABLE_P2_PLACEMENT_PIPELINE'] = 'false';

      const res = await app.inject({
        method: 'GET',
        url: '/placement/pipeline',
        headers: institutionHeaders,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('FEATURE_DISABLED');
    });

    it('blocks candidate batch sharing with 404 FEATURE_DISABLED', async () => {
      process.env['ENABLE_P2_PLACEMENT_PIPELINE'] = 'false';

      const res = await app.inject({
        method: 'POST',
        url: '/placement/batch-share',
        headers: institutionHeaders,
        payload: {
          tieUpId: 'tie_123',
          jobTitle: 'CNC Operator',
          studentIds: ['seeker_1', 'seeker_2'],
        },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('FEATURE_DISABLED');
    });
  });

  // =========================================================================
  // 4. FEATURED PROMOTIONS BOUNDARY (ENABLE_P2_FEATURED_PROMOTIONS=false)
  // =========================================================================
  describe('Featured Job Promotions Boundary (ENABLE_P2_FEATURED_PROMOTIONS=false)', () => {
    it('blocks /jobs/:id/promote with 404 FEATURE_DISABLED', async () => {
      process.env['ENABLE_P2_FEATURED_PROMOTIONS'] = 'false';

      const res = await app.inject({
        method: 'POST',
        url: '/jobs/job_123/promote',
        headers: employerHeaders,
        payload: {
          durationDays: 7,
          creditCost: 10,
        },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('FEATURE_DISABLED');
    });

    it('blocks /wallet/feature-job with 404 FEATURE_DISABLED', async () => {
      process.env['ENABLE_P2_FEATURED_PROMOTIONS'] = 'false';

      const res = await app.inject({
        method: 'POST',
        url: '/wallet/feature-job',
        headers: employerHeaders,
        payload: {
          jobId: 'job_123',
          cost: 10,
        },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('FEATURE_DISABLED');
    });
  });

  // =========================================================================
  // 5. RESTORATION & PASS-THROUGH WHEN FLAGS ARE ACTIVE
  // =========================================================================
  describe('Restoration Verification (Flags Enabled = true)', () => {
    it('allows access to endpoints when feature flags are restored to true', async () => {
      process.env['ENABLE_P2_PAYMENTS'] = 'true';
      process.env['ENABLE_P2_WALLET_RECHARGE'] = 'true';
      process.env['ENABLE_P2_PLACEMENT_PIPELINE'] = 'true';
      process.env['ENABLE_P2_FEATURED_PROMOTIONS'] = 'true';

      // 1. Credit packs endpoint is accessible
      const packsRes = await app.inject({
        method: 'GET',
        url: '/wallet/packs',
        headers: employerHeaders,
      });
      expect(packsRes.statusCode).toBe(200);

      // 2. Placement tie-ups endpoint is accessible
      const placementRes = await app.inject({
        method: 'GET',
        url: '/placement/tie-ups',
        headers: institutionHeaders,
      });
      expect(placementRes.statusCode).toBe(200);
    });
  });
});
