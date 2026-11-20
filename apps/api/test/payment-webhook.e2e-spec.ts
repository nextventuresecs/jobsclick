import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { createHmac, randomUUID } from 'node:crypto';
import pg from 'pg';
import { AppModule } from '../src/app.module.js';
import { RAZORPAY_GATEWAY, FakeRazorpayGateway } from '../src/wallet/razorpay.gateway.js';
import { PaymentRepository } from '../src/database/repositories/payment.repository.js';

const DATABASE_URL =
  process.env['DATABASE_URL'] && !process.env['DATABASE_URL'].includes('pooler.supabase.com')
    ? process.env['DATABASE_URL']
    : 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

describe('Payment Webhook E2E (WAL-03, Razorpay HMAC, Deduplication, Anomalies)', () => {
  let app: NestFastifyApplication;
  let fakeGateway: FakeRazorpayGateway;
  let pgClient: pg.Client;
  const webhookSecret = 'test_webhook_secret_key_32bytes_long!';
  process.env['RAZORPAY_WEBHOOK_SECRET'] = webhookSecret;
  process.env['ENABLE_P2_PAYMENTS'] = 'true';

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

  function signPayload(payload: Buffer | string, secret = webhookSecret): string {
    const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf-8');
    return createHmac('sha256', secret).update(buf).digest('hex');
  }

  it('rejects missing signature header with 400', async () => {
    const body = Buffer.from(JSON.stringify({ event: 'payment.captured' }));
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-event-id': 'evt_missing_sig',
      },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_SIGNATURE');
  });

  it('rejects forged signature with 400', async () => {
    const body = Buffer.from(JSON.stringify({ event: 'payment.captured' }));
    const fakeSig = 'a'.repeat(64);
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': fakeSig,
        'x-razorpay-event-id': 'evt_forged',
      },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_SIGNATURE');
  });

  it('rejects signature created with wrong secret with 400', async () => {
    const body = Buffer.from(JSON.stringify({ event: 'payment.captured' }));
    const wrongSig = signPayload(body, 'wrong_secret_key_long_enough_for_test');
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': wrongSig,
        'x-razorpay-event-id': 'evt_wrong_sec',
      },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_SIGNATURE');
  });

  it('rejects altered body bytes with 400', async () => {
    const body = Buffer.from(JSON.stringify({ event: 'payment.captured' }));
    const validSig = signPayload(body);
    const altered = Buffer.concat([body, Buffer.from(' ')]);

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': validSig,
        'x-razorpay-event-id': 'evt_altered',
      },
      payload: altered,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_SIGNATURE');
  });

  it('rejects truncated signature with 400', async () => {
    const body = Buffer.from(JSON.stringify({ event: 'payment.captured' }));
    const truncated = signPayload(body).slice(0, 62);

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': truncated,
        'x-razorpay-event-id': 'evt_truncated',
      },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_SIGNATURE');
  });

  it('rejects missing x-razorpay-event-id header with 400', async () => {
    const body = Buffer.from(JSON.stringify({ event: 'payment.captured' }));
    const sig = signPayload(body);

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': sig,
      },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('MISSING_EVENT_ID');
  });

  it('rejects malformed JSON with valid signature with 400 without settling', async () => {
    const brokenBody = Buffer.from('{"event": "payment.captured", "payload":');
    const sig = signPayload(brokenBody);

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': sig,
        'x-razorpay-event-id': 'evt_broken_json',
      },
      payload: brokenBody,
    });
    expect(res.statusCode).toBe(400);
  });

  it('settles valid payment.captured webhook, creates ledger row, and returns no PII', async () => {
    const userId = await createTestUser();
    const orderId = `order_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const paymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const eventId = `evt_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    await createTestOrder(userId, orderId, 59000, 50);

    fakeGateway.seedPayment({
      id: paymentId,
      orderId,
      status: 'captured',
      amountPaise: 59000,
      currency: 'INR',
    });

    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: { entity: { id: paymentId, order_id: orderId } },
      },
    });
    const sig = signPayload(payload);

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': sig,
        'x-razorpay-event-id': eventId,
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({ status: 'ok', received: true });
    // Zero user or candidate PII in response
    expect(JSON.stringify(body)).not.toContain(userId);

    // Verify DB settlement
    const payRows = await pgClient.query('SELECT status, gateway_payment_id FROM public.payments WHERE gateway_order_id = $1', [orderId]);
    expect(payRows.rows[0].status).toBe('captured');
    expect(payRows.rows[0].gateway_payment_id).toBe(paymentId);

    const ledgers = await pgClient.query(
      "SELECT amount, reason FROM public.credit_ledgers WHERE user_id = $1 AND reason = 'wallet_recharge'",
      [userId],
    );
    expect(ledgers.rows.length).toBe(1);
    expect(ledgers.rows[0].amount).toBe(50);
  });

  it('replaying the exact same event id returns 200 with exactly one grant', async () => {
    const userId = await createTestUser();
    const orderId = `order_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const paymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const eventId = `evt_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    await createTestOrder(userId, orderId, 59000, 50);
    fakeGateway.seedPayment({
      id: paymentId,
      orderId,
      status: 'captured',
      amountPaise: 59000,
    });

    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: paymentId, order_id: orderId } } },
    });
    const sig = signPayload(payload);

    // First call
    const res1 = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': sig,
        'x-razorpay-event-id': eventId,
      },
      payload,
    });
    expect(res1.statusCode).toBe(200);

    // Replay with exact same event ID
    const res2 = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': sig,
        'x-razorpay-event-id': eventId,
      },
      payload,
    });
    expect(res2.statusCode).toBe(200);

    // Ledger still has exactly 1 recharge entry
    const ledgers = await pgClient.query(
      "SELECT amount FROM public.credit_ledgers WHERE user_id = $1 AND reason = 'wallet_recharge'",
      [userId],
    );
    expect(ledgers.rows.length).toBe(1);
  });

  it('different event id for same payment returns 200 with exactly one grant', async () => {
    const userId = await createTestUser();
    const orderId = `order_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const paymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    await createTestOrder(userId, orderId, 59000, 50);
    fakeGateway.seedPayment({
      id: paymentId,
      orderId,
      status: 'captured',
      amountPaise: 59000,
    });

    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: paymentId, order_id: orderId } } },
    });
    const sig = signPayload(payload);

    // First event id
    await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': sig,
        'x-razorpay-event-id': `evt_first_${Date.now()}`,
      },
      payload,
    });

    // Second event id (e.g. order.paid event)
    const res2 = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': sig,
        'x-razorpay-event-id': `evt_second_${Date.now()}`,
      },
      payload,
    });
    expect(res2.statusCode).toBe(200);

    const ledgers = await pgClient.query(
      "SELECT amount FROM public.credit_ledgers WHERE user_id = $1 AND reason = 'wallet_recharge'",
      [userId],
    );
    expect(ledgers.rows.length).toBe(1);
  });

  it('payload claims ₹1 while gateway says ₹590: gateway facts win, credits granted', async () => {
    const userId = await createTestUser();
    const orderId = `order_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const paymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    await createTestOrder(userId, orderId, 59000, 50);
    fakeGateway.seedPayment({
      id: paymentId,
      orderId,
      status: 'captured',
      amountPaise: 59000, // Gateway authoritatively says 59000
    });

    // Untrusted client/payload claims amount is 100 paise (₹1)
    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: paymentId, order_id: orderId, amount: 100 } } },
    });
    const sig = signPayload(payload);

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': sig,
        'x-razorpay-event-id': `evt_gw_wins_${Date.now()}`,
      },
      payload,
    });
    expect(res.statusCode).toBe(200);

    const pay = await pgClient.query('SELECT status FROM public.payments WHERE gateway_order_id = $1', [orderId]);
    expect(pay.rows[0].status).toBe('captured');
    const ledgers = await pgClient.query(
      "SELECT amount FROM public.credit_ledgers WHERE user_id = $1 AND reason = 'wallet_recharge'",
      [userId],
    );
    expect(ledgers.rows.length).toBe(1);
  });

  it('payload claims ₹590 while gateway says ₹1: anomaly recorded, 200 returned, no credit granted', async () => {
    const userId = await createTestUser();
    const orderId = `order_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const paymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    await createTestOrder(userId, orderId, 59000, 50);
    fakeGateway.seedPayment({
      id: paymentId,
      orderId,
      status: 'captured',
      amountPaise: 100, // Gateway authoritatively reports mismatch: only ₹1 captured
    });

    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: paymentId, order_id: orderId, amount: 59000 } } },
    });
    const sig = signPayload(payload);

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': sig,
        'x-razorpay-event-id': `evt_anomaly_${Date.now()}`,
      },
      payload,
    });
    expect(res.statusCode).toBe(200); // 200 so gateway doesn't retry forever

    const pay = await pgClient.query('SELECT status FROM public.payments WHERE gateway_order_id = $1', [orderId]);
    expect(pay.rows[0].status).toBe('created'); // Still created, not captured!

    const ledgers = await pgClient.query(
      "SELECT amount FROM public.credit_ledgers WHERE user_id = $1 AND reason = 'wallet_recharge'",
      [userId],
    );
    expect(ledgers.rows.length).toBe(0);

    const anomalies = await pgClient.query(
      'SELECT kind FROM private_payments.payment_anomalies WHERE gateway_order_id = $1',
      [orderId],
    );
    expect(anomalies.rows.length).toBe(1);
    expect(anomalies.rows[0].kind).toBe('AMOUNT_MISMATCH');
  });

  it('unknown order returns 200, logs anomaly, grants no credits', async () => {
    const orderId = `order_ghost_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const paymentId = `pay_ghost_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

    fakeGateway.seedPayment({
      id: paymentId,
      orderId,
      status: 'captured',
      amountPaise: 59000,
    });

    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: paymentId, order_id: orderId } } },
    });
    const sig = signPayload(payload);

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': sig,
        'x-razorpay-event-id': `evt_unknown_${Date.now()}`,
      },
      payload,
    });
    expect(res.statusCode).toBe(200);

    const anomalies = await pgClient.query(
      'SELECT kind FROM private_payments.payment_anomalies WHERE gateway_order_id = $1',
      [orderId],
    );
    expect(anomalies.rows.length).toBe(1);
    expect(anomalies.rows[0].kind).toBe('UNKNOWN_ORDER');
  });

  it('transient database error returns 500 so Razorpay retries', async () => {
    const orderId = `order_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const paymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    fakeGateway.seedPayment({
      id: paymentId,
      orderId,
      status: 'captured',
      amountPaise: 59000,
    });

    const payRepo = app.get(PaymentRepository);
    const origSettle = payRepo.settlePayment.bind(payRepo);
    payRepo.settlePayment = async () => {
      throw new Error('Connection terminated unexpectedly');
    };

    try {
      const payload = JSON.stringify({
        event: 'payment.captured',
        payload: { payment: { entity: { id: paymentId, order_id: orderId } } },
      });
      const sig = signPayload(payload);

      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/razorpay',
        headers: {
          'content-type': 'application/json',
          'x-razorpay-signature': sig,
          'x-razorpay-event-id': `evt_fail_${Date.now()}`,
        },
        payload,
      });
      expect(res.statusCode).toBe(500);
    } finally {
      payRepo.settlePayment = origSettle;
    }
  });
});
