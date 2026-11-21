import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { createHmac, randomUUID } from 'node:crypto';
import pg from 'pg';
import { AppModule } from '../src/app.module.js';
import { RAZORPAY_GATEWAY, FakeRazorpayGateway } from '../src/wallet/razorpay.gateway.js';

const DATABASE_URL =
  process.env['DATABASE_URL'] && !process.env['DATABASE_URL'].includes('pooler.supabase.com')
    ? process.env['DATABASE_URL']
    : 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

describe('Payment Verify E2E (WAL-03, Signature, Owner-Bound, Race Conditions, Authorized Status)', () => {
  let app: NestFastifyApplication;
  let fakeGateway: FakeRazorpayGateway;
  let pgClient: pg.Client;

  const keySecret = 'test_key_secret_256bits_fixture_long';
  const webhookSecret = 'test_webhook_secret_256bits_fixture';
  process.env['RAZORPAY_KEY_SECRET'] = keySecret;
  process.env['RAZORPAY_WEBHOOK_SECRET'] = webhookSecret;
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
    await app.close();
    await pgClient.end();
  });

  beforeEach(() => {
    fakeGateway.clear();
  });

  async function createTestUser(): Promise<string> {
    const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
    const res = await pgClient.query(
      "INSERT INTO public.users (phone, role, status) VALUES ($1, 'job_seeker', 'active') RETURNING id",
      [phone],
    );
    return res.rows[0].id;
  }

  async function createTestOrder(userId: string, orderId: string, amountPaise = 59000, credits = 50): Promise<string> {
    const res = await pgClient.query(
      `INSERT INTO public.payments (
         user_id, gateway_order_id, amount_paise, amount_inr, currency,
         purpose, credits_to_grant, credits_added, status, order_snapshot
       ) VALUES ($1, $2, $3, $4, 'INR', 'wallet', $5, $5, 'created', $6)
       RETURNING id`,
      [
        userId,
        orderId,
        amountPaise,
        amountPaise / 100,
        credits,
        JSON.stringify({ packId: 'pack_starter', credits }),
      ],
    );
    return res.rows[0].id;
  }

  function signCheckout(orderId: string, paymentId: string, secret = keySecret): string {
    return createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  }

  function signWebhook(payload: string, secret = webhookSecret): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  it('rejects forged or malformed client checkout signature with 400', async () => {
    const userA = await createTestUser();
    const orderId = `order_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const paymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    await createTestOrder(userA, orderId, 59000, 50);

    const res = await app.inject({
      method: 'POST',
      url: '/wallet/recharge/verify',
      headers: {
        'content-type': 'application/json',
        'x-user-id': userA,
        'x-user-role': 'job_seeker',
      },
      payload: {
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: 'bad_signature_here_not_valid_hex',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_SIGNATURE');
  });

  it('rejects non-owner with 404 (no existence leak)', async () => {
    const owner = await createTestUser();
    const stranger = await createTestUser();
    const orderId = `order_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const paymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    await createTestOrder(owner, orderId, 59000, 50);
    const validSig = signCheckout(orderId, paymentId);

    fakeGateway.seedPayment({
      id: paymentId,
      orderId,
      status: 'captured',
      amountPaise: 59000,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/wallet/recharge/verify',
      headers: {
        'content-type': 'application/json',
        'x-user-id': stranger, // Stranger attempts to verify owner's order
        'x-user-role': 'job_seeker',
      },
      payload: {
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSig,
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it('unknown order returns 404', async () => {
    const user = await createTestUser();
    const orderId = `order_unknown_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    const paymentId = `pay_unknown_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    const validSig = signCheckout(orderId, paymentId);

    const res = await app.inject({
      method: 'POST',
      url: '/wallet/recharge/verify',
      headers: {
        'content-type': 'application/json',
        'x-user-id': user,
        'x-user-role': 'job_seeker',
      },
      payload: {
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSig,
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it('authorized-only payment returns { status: "pending" } without granting credits', async () => {
    const user = await createTestUser();
    const orderId = `order_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const paymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    await createTestOrder(user, orderId, 59000, 50);
    const validSig = signCheckout(orderId, paymentId);

    fakeGateway.seedPayment({
      id: paymentId,
      orderId,
      status: 'authorized', // Not captured yet!
      amountPaise: 59000,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/wallet/recharge/verify',
      headers: {
        'content-type': 'application/json',
        'x-user-id': user,
        'x-user-role': 'job_seeker',
      },
      payload: {
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSig,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('pending');
    expect(body.balance).toBe(10); // Only starter credits, no recharge credits yet

    const pay = await pgClient.query('SELECT status FROM public.payments WHERE gateway_order_id = $1', [orderId]);
    expect(pay.rows[0].status).toBe('created');
  });

  it('settled payment returns { status: "settled", balance: N }', async () => {
    const user = await createTestUser();
    const orderId = `order_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const paymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    await createTestOrder(user, orderId, 59000, 50);
    const validSig = signCheckout(orderId, paymentId);

    fakeGateway.seedPayment({
      id: paymentId,
      orderId,
      status: 'captured',
      amountPaise: 59000,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/wallet/recharge/verify',
      headers: {
        'content-type': 'application/json',
        'x-user-id': user,
        'x-user-role': 'job_seeker',
      },
      payload: {
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSig,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('settled');
    expect(body.balance).toBe(60); // 10 starter + 50 recharge = 60

    const pay = await pgClient.query('SELECT status FROM public.payments WHERE gateway_order_id = $1', [orderId]);
    expect(pay.rows[0].status).toBe('captured');
  });

  it('race condition: concurrent verify and webhook execute in parallel => exactly one grant', async () => {
    const user = await createTestUser();
    const orderId = `order_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const paymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const eventId = `evt_race_${Date.now()}`;

    await createTestOrder(user, orderId, 59000, 50);
    const checkoutSig = signCheckout(orderId, paymentId);

    fakeGateway.seedPayment({
      id: paymentId,
      orderId,
      status: 'captured',
      amountPaise: 59000,
    });

    const webhookPayload = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: paymentId, order_id: orderId } } },
    });
    const webhookSig = signWebhook(webhookPayload);

    // Fire verify and webhook concurrently
    const [verifyRes, webhookRes] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/wallet/recharge/verify',
        headers: {
          'content-type': 'application/json',
          'x-user-id': user,
          'x-user-role': 'job_seeker',
        },
        payload: {
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: checkoutSig,
        },
      }),
      app.inject({
        method: 'POST',
        url: '/webhooks/razorpay',
        headers: {
          'content-type': 'application/json',
          'x-razorpay-signature': webhookSig,
          'x-razorpay-event-id': eventId,
        },
        payload: webhookPayload,
      }),
    ]);

    expect(verifyRes.statusCode).toBe(201);
    expect(webhookRes.statusCode).toBe(200);

    // Verify balance is exactly 60 (10 starter + 50 recharge once)
    const ledgers = await pgClient.query(
      "SELECT amount FROM public.credit_ledgers WHERE user_id = $1 AND reason = 'wallet_recharge'",
      [user],
    );
    expect(ledgers.rows.length).toBe(1);
    expect(ledgers.rows[0].amount).toBe(50);
  });

  it('verification anomaly (amount mismatch) rejects with 400 Bad Request and AMOUNT_MISMATCH code', async () => {
    const user = await createTestUser();
    const orderId = `order_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const paymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    await createTestOrder(user, orderId, 59000, 50);
    const validSig = signCheckout(orderId, paymentId);

    // Gateway reports amount mismatch (100 paise instead of 59000 paise)
    fakeGateway.seedPayment({
      id: paymentId,
      orderId,
      status: 'captured',
      amountPaise: 100,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/wallet/recharge/verify',
      headers: {
        'content-type': 'application/json',
        'x-user-id': user,
        'x-user-role': 'job_seeker',
      },
      payload: {
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSig,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('AMOUNT_MISMATCH');

    // Verify ZERO recharge credits granted
    const ledgers = await pgClient.query(
      "SELECT amount FROM public.credit_ledgers WHERE user_id = $1 AND reason = 'wallet_recharge'",
      [user],
    );
    expect(ledgers.rows.length).toBe(0);
  });
});
