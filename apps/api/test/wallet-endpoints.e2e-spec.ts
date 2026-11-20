import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import pg from 'pg';
import { AppModule } from '../src/app.module.js';
import { RAZORPAY_GATEWAY, FakeRazorpayGateway } from '../src/wallet/razorpay.gateway.js';
import { CREDIT_PACKS } from '@indian-job-portal/validation';

const DATABASE_URL =
  process.env['DATABASE_URL'] && !process.env['DATABASE_URL'].includes('pooler.supabase.com')
    ? process.env['DATABASE_URL']
    : 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

describe('Wallet Endpoints E2E (WAL-01, WAL-03, Create-Order, Dynamic Balance, Packs)', () => {
  let app: NestFastifyApplication;
  let fakeGateway: FakeRazorpayGateway;
  let pgClient: pg.Client;

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

  it('GET /wallet/packs returns pre-configured credit packs', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/wallet/packs',
      headers: {
        'x-user-id': '00000000-0000-0000-0000-000000000001',
        'x-user-role': 'job_seeker',
      },
    });

    expect(res.statusCode).toBe(200);
    const packs = res.json();
    expect(Array.isArray(packs)).toBe(true);
    expect(packs.length).toBe(Object.keys(CREDIT_PACKS).length);
    expect(packs[0].credits).toBeDefined();
    expect(packs[0].totalAmountInr).toBeDefined();
  });

  it('GET /wallet/balance returns dynamically calculated balance from rpc_get_balance', async () => {
    const userId = await createTestUser();

    // Initially job_seeker has 10 starter credits
    const res1 = await app.inject({
      method: 'GET',
      url: '/wallet/balance',
      headers: {
        'x-user-id': userId,
        'x-user-role': 'job_seeker',
      },
    });
    expect(res1.statusCode).toBe(200);
    expect(res1.json().balance).toBe(10);

    // Insert an additional ledger credit
    await pgClient.query(
      "INSERT INTO public.credit_ledgers (user_id, amount, reason, source) VALUES ($1, 25, 'bonus_credit', 'system')",
      [userId],
    );

    const res2 = await app.inject({
      method: 'GET',
      url: '/wallet/balance',
      headers: {
        'x-user-id': userId,
        'x-user-role': 'job_seeker',
      },
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json().balance).toBe(35);
  });

  it('POST /wallet/recharge/create-order creates gateway order and payments row', async () => {
    const userId = await createTestUser('employer');

    const res = await app.inject({
      method: 'POST',
      url: '/wallet/recharge/create-order',
      headers: {
        'content-type': 'application/json',
        'x-user-id': userId,
        'x-user-role': 'employer',
      },
      payload: {
        packId: 'pack_growth', // 200 credits, ₹2124 total (212400 paise)
        termsVersion: '2026.1',
        billingStateCode: '27',
        billingName: 'Bharat Enterprises Ltd',
        billingGstin: '27AAAAA0000A1Z5',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.orderId).toBeDefined();
    expect(body.amount).toBe(212400); // 212400 paise
    expect(body.currency).toBe('INR');
    expect(body.credits).toBe(200);
    expect(body.keyId).toBe(fakeGateway.keyId);

    // Verify row in database
    const payRows = await pgClient.query(
      'SELECT * FROM public.payments WHERE gateway_order_id = $1',
      [body.orderId],
    );
    expect(payRows.rows.length).toBe(1);
    const pay = payRows.rows[0];
    expect(pay.user_id).toBe(userId);
    expect(pay.purpose).toBe('wallet');
    expect(pay.amount_paise).toBe('212400');
    expect(pay.credits_to_grant).toBe(200);
    expect(pay.status).toBe('created');
    expect(pay.terms_version).toBe('2026.1');
    expect(pay.billing_state_code).toBe('27');
    expect(pay.order_snapshot.packId).toBe('pack_growth');
  });

  it('POST /wallet/recharge/create-order rejects missing termsVersion with 400', async () => {
    const userId = await createTestUser('job_seeker');

    const res = await app.inject({
      method: 'POST',
      url: '/wallet/recharge/create-order',
      headers: {
        'content-type': 'application/json',
        'x-user-id': userId,
        'x-user-role': 'job_seeker',
      },
      payload: {
        packId: 'pack_starter',
        // missing termsVersion
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('POST /wallet/recharge/create-order rejects extra forbidden fields via strict zod', async () => {
    const userId = await createTestUser('job_seeker');

    const res = await app.inject({
      method: 'POST',
      url: '/wallet/recharge/create-order',
      headers: {
        'content-type': 'application/json',
        'x-user-id': userId,
        'x-user-role': 'job_seeker',
      },
      payload: {
        packId: 'pack_starter',
        termsVersion: '2026.1',
        force: true, // extra property
        paymentReference: 'fake_ref', // extra property
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('POST /wallet/recharge/create-order rejects invalid pack ID with 400', async () => {
    const userId = await createTestUser('job_seeker');

    const res = await app.inject({
      method: 'POST',
      url: '/wallet/recharge/create-order',
      headers: {
        'content-type': 'application/json',
        'x-user-id': userId,
        'x-user-role': 'job_seeker',
      },
      payload: {
        packId: 'pack_nonexistent_hacker',
        termsVersion: '2026.1',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_PACK');
  });
});
