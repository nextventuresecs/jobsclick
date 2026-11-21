import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import pg from 'pg';
import crypto from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { RAZORPAY_GATEWAY, FakeRazorpayGateway } from '../src/wallet/razorpay.gateway.js';
import {
  isWalletRechargeEnabled,
  isSponsorshipOrderEnabled,
  assertWalletRechargeEnabled,
  assertSponsorshipOrderEnabled,
} from '../src/config/rollout.js';

const DATABASE_URL =
  process.env['DATABASE_URL'] && !process.env['DATABASE_URL'].includes('pooler.supabase.com')
    ? process.env['DATABASE_URL']
    : 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

describe('Rollout Controls & Kill-Switch Semantics (WALLET_ENABLED & SPONSORSHIP_ENABLED)', () => {
  let app: NestFastifyApplication;
  let fakeGateway: FakeRazorpayGateway;
  let pgClient: pg.Client;

  process.env['ENABLE_P2_PAYMENTS'] = 'true';
  process.env['ENABLE_P2_WALLET_RECHARGE'] = 'true';

  beforeAll(async () => {
    pgClient = new pg.Client({ connectionString: DATABASE_URL });
    await pgClient.connect();

    fakeGateway = new FakeRazorpayGateway();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RAZORPAY_GATEWAY)
      .useValue(fakeGateway)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { rawBody: true },
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    delete process.env['WALLET_ENABLED'];
    delete process.env['SPONSORSHIP_ENABLED'];
    await app.close();
    await pgClient.end();
  });

  beforeEach(() => {
    fakeGateway.clear();
  });

  async function createTestUser(role = 'job_seeker'): Promise<string> {
    const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
    const res = await pgClient.query(
      'INSERT INTO public.users (phone, role, status) VALUES ($1, $2, \'active\') RETURNING id',
      [phone, role],
    );
    return res.rows[0].id;
  }

  describe('Unit helper functions and defaults', () => {
    it('defaults to OFF in production when unset', () => {
      const origNodeEnv = process.env['NODE_ENV'];
      const origWallet = process.env['WALLET_ENABLED'];
      const origSponsorship = process.env['SPONSORSHIP_ENABLED'];
      try {
        process.env['NODE_ENV'] = 'production';
        delete process.env['WALLET_ENABLED'];
        delete process.env['SPONSORSHIP_ENABLED'];

        expect(isWalletRechargeEnabled()).toBe(false);
        expect(isSponsorshipOrderEnabled()).toBe(false);

        expect(() => assertWalletRechargeEnabled()).toThrowError(/Recharge temporarily paused/);
        expect(() => assertSponsorshipOrderEnabled()).toThrowError(/Sponsorship temporarily paused/);
      } finally {
        process.env['NODE_ENV'] = origNodeEnv;
        if (origWallet !== undefined) process.env['WALLET_ENABLED'] = origWallet;
        if (origSponsorship !== undefined) process.env['SPONSORSHIP_ENABLED'] = origSponsorship;
      }
    });

    it('defaults to OFF in staging when unset (both NODE_ENV=staging and APP_ENV=staging)', () => {
      const origNodeEnv = process.env['NODE_ENV'];
      const origAppEnv = process.env['APP_ENV'];
      const origWallet = process.env['WALLET_ENABLED'];
      const origSponsorship = process.env['SPONSORSHIP_ENABLED'];
      try {
        delete process.env['WALLET_ENABLED'];
        delete process.env['SPONSORSHIP_ENABLED'];

        // Case 1: NODE_ENV=staging alone
        delete process.env['APP_ENV'];
        process.env['NODE_ENV'] = 'staging';
        expect(isWalletRechargeEnabled()).toBe(false);
        expect(isSponsorshipOrderEnabled()).toBe(false);

        // Case 2: NODE_ENV=production + APP_ENV=staging
        process.env['NODE_ENV'] = 'production';
        process.env['APP_ENV'] = 'staging';
        expect(isWalletRechargeEnabled()).toBe(false);
        expect(isSponsorshipOrderEnabled()).toBe(false);

        expect(() => assertWalletRechargeEnabled()).toThrowError(/Recharge temporarily paused/);
        expect(() => assertSponsorshipOrderEnabled()).toThrowError(/Sponsorship temporarily paused/);
      } finally {
        process.env['NODE_ENV'] = origNodeEnv;
        if (origAppEnv !== undefined) process.env['APP_ENV'] = origAppEnv;
        else delete process.env['APP_ENV'];
        if (origWallet !== undefined) process.env['WALLET_ENABLED'] = origWallet;
        if (origSponsorship !== undefined) process.env['SPONSORSHIP_ENABLED'] = origSponsorship;
      }
    });

    it('in staging returns true when explicitly set to "true" or "1"', () => {
      const origNodeEnv = process.env['NODE_ENV'];
      const origAppEnv = process.env['APP_ENV'];
      const origWallet = process.env['WALLET_ENABLED'];
      const origSponsorship = process.env['SPONSORSHIP_ENABLED'];
      try {
        process.env['NODE_ENV'] = 'production';
        process.env['APP_ENV'] = 'staging';
        process.env['WALLET_ENABLED'] = 'true';
        process.env['SPONSORSHIP_ENABLED'] = '1';

        expect(isWalletRechargeEnabled()).toBe(true);
        expect(isSponsorshipOrderEnabled()).toBe(true);
        expect(() => assertWalletRechargeEnabled()).not.toThrow();
        expect(() => assertSponsorshipOrderEnabled()).not.toThrow();
      } finally {
        process.env['NODE_ENV'] = origNodeEnv;
        if (origAppEnv !== undefined) process.env['APP_ENV'] = origAppEnv;
        else delete process.env['APP_ENV'];
        if (origWallet !== undefined) process.env['WALLET_ENABLED'] = origWallet;
        else delete process.env['WALLET_ENABLED'];
        if (origSponsorship !== undefined) process.env['SPONSORSHIP_ENABLED'] = origSponsorship;
        else delete process.env['SPONSORSHIP_ENABLED'];
      }
    });

    it('returns true when explicitly set to "true" or "1"', () => {
      process.env['WALLET_ENABLED'] = 'true';
      process.env['SPONSORSHIP_ENABLED'] = '1';
      expect(isWalletRechargeEnabled()).toBe(true);
      expect(isSponsorshipOrderEnabled()).toBe(true);

      expect(() => assertWalletRechargeEnabled()).not.toThrow();
      expect(() => assertSponsorshipOrderEnabled()).not.toThrow();
    });

    it('returns false when explicitly set to "false" or "0"', () => {
      process.env['WALLET_ENABLED'] = 'false';
      process.env['SPONSORSHIP_ENABLED'] = '0';
      expect(isWalletRechargeEnabled()).toBe(false);
      expect(isSponsorshipOrderEnabled()).toBe(false);

      expect(() => assertWalletRechargeEnabled()).toThrowError(/Recharge temporarily paused/);
      expect(() => assertSponsorshipOrderEnabled()).toThrowError(/Sponsorship temporarily paused/);
    });
  });

  describe('Kill-Switch Behavior on HTTP Endpoints', () => {
    it('when WALLET_ENABLED=false: POST /wallet/recharge/create-order returns 503', async () => {
      process.env['WALLET_ENABLED'] = 'false';
      const userId = await createTestUser('employer');

      const res = await app.inject({
        method: 'POST',
        url: '/wallet/recharge/create-order',
        headers: {
          'x-user-id': userId,
          'x-user-role': 'employer',
        },
        payload: {
          packId: 'pack_growth',
          termsVersion: 'v1.0',
        },
      });

      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body.code).toBe('WALLET_DISABLED');
      expect(body.message).toContain('Recharge temporarily paused');
    });

    it('when WALLET_ENABLED=false: POST /wallet/recharge/verify stays LIVE (does NOT return 503)', async () => {
      process.env['WALLET_ENABLED'] = 'false';
      const userId = await createTestUser('employer');

      // Attempt verification on an unknown order -> should return 404, NEVER 503
      const res = await app.inject({
        method: 'POST',
        url: '/wallet/recharge/verify',
        headers: {
          'x-user-id': userId,
          'x-user-role': 'employer',
        },
        payload: {
          razorpayOrderId: 'order_nonexistent_test',
          razorpayPaymentId: 'pay_nonexistent_test',
          razorpaySignature: crypto.createHmac('sha256', 'test_razorpay_key_secret_256bits_fixture')
            .update('order_nonexistent_test|pay_nonexistent_test')
            .digest('hex'),
        },
      });

      // Must not be 503! It remains active for in-flight orders
      expect(res.statusCode).not.toBe(503);
      expect(res.statusCode).toBe(404);
    });

    it('when WALLET_ENABLED=false: Webhooks stay LIVE (POST /webhooks/razorpay does NOT return 503)', async () => {
      process.env['WALLET_ENABLED'] = 'false';

      // Send a webhook with invalid signature -> should return 400, NEVER 503
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/razorpay',
        headers: {
          'x-razorpay-event-id': 'evt_test_kill_switch_1',
          'x-razorpay-signature': '0'.repeat(64),
        },
        payload: {
          event: 'payment.captured',
          payload: { payment: { entity: { id: 'pay_test' } } },
        },
      });

      // Webhook handler is live and evaluated signature
      expect(res.statusCode).not.toBe(503);
      expect(res.statusCode).toBe(400);
    });

    it('when WALLET_ENABLED=false: GET /wallet/balance and GET /wallet/packs stay operational', async () => {
      process.env['WALLET_ENABLED'] = 'false';
      const userId = await createTestUser('job_seeker');

      const balanceRes = await app.inject({
        method: 'GET',
        url: '/wallet/balance',
        headers: {
          'x-user-id': userId,
          'x-user-role': 'job_seeker',
        },
      });
      expect(balanceRes.statusCode).toBe(200);

      const packsRes = await app.inject({
        method: 'GET',
        url: '/wallet/packs',
        headers: {
          'x-user-id': userId,
          'x-user-role': 'job_seeker',
        },
      });
      expect(packsRes.statusCode).toBe(200);
    });

    it('when SPONSORSHIP_ENABLED=false: POST /institution/sponsorship/create-order returns 503', async () => {
      process.env['SPONSORSHIP_ENABLED'] = 'false';
      const userId = await createTestUser('intermediary');

      // Create an institution owned by user
      const instRes = await pgClient.query(
        'INSERT INTO public.institution_profiles (user_id, institution_name, affiliation, city) VALUES ($1, $2, $3, $4) RETURNING id',
        [userId, 'Test College', 'AICTE', 'New Delhi'],
      );
      const institutionId = instRes.rows[0].id;

      const res = await app.inject({
        method: 'POST',
        url: '/institution/sponsorship/create-order',
        headers: {
          'x-user-id': userId,
          'x-user-role': 'intermediary',
        },
        payload: {
          institutionId,
          declaredStudentCount: 50,
          termsVersion: 'v1.0',
        },
      });

      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body.code).toBe('SPONSORSHIP_DISABLED');
      expect(body.message).toContain('Sponsorship temporarily paused');
    });

    it('when SPONSORSHIP_ENABLED=false: POST /institution/sponsorship/quote stays operational', async () => {
      process.env['SPONSORSHIP_ENABLED'] = 'false';
      const userId = await createTestUser('intermediary');

      const instRes = await pgClient.query(
        'INSERT INTO public.institution_profiles (user_id, institution_name, affiliation, city) VALUES ($1, $2, $3, $4) RETURNING id',
        [userId, 'Quote College', 'AICTE', 'Mumbai'],
      );
      const institutionId = instRes.rows[0].id;

      const res = await app.inject({
        method: 'POST',
        url: '/institution/sponsorship/quote',
        headers: {
          'x-user-id': userId,
          'x-user-role': 'intermediary',
        },
        payload: {
          institutionId,
          declaredStudentCount: 50,
        },
      });

      expect([200, 201]).toContain(res.statusCode);
      const quote = res.json();
      expect(quote.tier).toBeDefined();
      expect(quote.totalAnnualFeeInr).toBeGreaterThan(0);
    });

    it('when flags are enabled: create-order succeeds normally', async () => {
      process.env['WALLET_ENABLED'] = 'true';
      const userId = await createTestUser('employer');

      fakeGateway.seedOrder('order_ks_active_123', 59000);

      const res = await app.inject({
        method: 'POST',
        url: '/wallet/recharge/create-order',
        headers: {
          'x-user-id': userId,
          'x-user-role': 'employer',
        },
        payload: {
          packId: 'pack_growth',
          termsVersion: 'v1.0',
        },
      });

      expect(res.statusCode).toBe(201);
      const order = res.json();
      expect(order.orderId).toBeDefined();
      expect(order.amount).toBe(212400);
    });
  });
});
