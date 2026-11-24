import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AppModule } from '../src/app.module.js';
import { RAZORPAY_GATEWAY, FakeRazorpayGateway } from '../src/wallet/razorpay.gateway.js';
import { PaymentService } from '../src/wallet/payment.service.js';

const DATABASE_URL =
  process.env['DATABASE_URL'] && !process.env['DATABASE_URL'].includes('pooler.supabase.com')
    ? process.env['DATABASE_URL']
    : 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const WEBHOOK_SECRET = process.env['RAZORPAY_WEBHOOK_SECRET'] || 'test_razorpay_webhook_secret_256bits_fixture';
const KEY_SECRET = process.env['RAZORPAY_KEY_SECRET'] || 'test_razorpay_key_secret_256bits_fixture';

export interface AttackVectorResult {
  vectorId: number;
  name: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL';
  details?: string;
}

describe('Module 4 Attacker Security Suite (14 Attack Vectors)', () => {
  let app: NestFastifyApplication;
  let fakeGateway: FakeRazorpayGateway;
  let adminClient: pg.Client;
  let anonClient: pg.Client;
  let authClient: pg.Client;
  let paymentService: PaymentService;

  const vectorResults: AttackVectorResult[] = [];

  beforeAll(async () => {
    process.env['ENABLE_P2_PAYMENTS'] = 'true';
    process.env['ENABLE_P2_WALLET_RECHARGE'] = 'true';
    process.env['WALLET_ENABLED'] = 'true';
    process.env['SPONSORSHIP_ENABLED'] = 'true';

    adminClient = new pg.Client({ connectionString: DATABASE_URL });
    await adminClient.connect();

    anonClient = new pg.Client({ connectionString: DATABASE_URL });
    await anonClient.connect();
    await anonClient.query('SET ROLE anon;');

    authClient = new pg.Client({ connectionString: DATABASE_URL });
    await authClient.connect();
    await authClient.query('SET ROLE authenticated;');

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

    fakeGateway = app.get<FakeRazorpayGateway>(RAZORPAY_GATEWAY);
    paymentService = app.get(PaymentService);
  });

  afterAll(async () => {
    await app.close();
    await anonClient.end();
    await authClient.end();
    await adminClient.end();

    // Format output and write to evidence file
    const logHeader = [
      '=========================================================================================================',
      '🛡️  MODULE 4: WALLET, RAZORPAY & SPONSORSHIPS — ATTACKER SECURITY VERIFICATION SUITE',
      '=========================================================================================================',
      `Timestamp: ${new Date().toISOString()}`,
      `Database: PostgreSQL (Real Catalog & Storage Engines)`,
      `Total Vectors Tested: 14`,
      '---------------------------------------------------------------------------------------------------------',
      'ID | Attack Vector Description                                              | Expected | Actual   | Status',
      '---|------------------------------------------------------------------------|----------|----------|-------',
    ];

    const logRows = vectorResults.map((r) => {
      const idStr = String(r.vectorId).padStart(2, ' ');
      const nameStr = r.name.padEnd(70, ' ').slice(0, 70);
      const expStr = r.expected.padEnd(8, ' ').slice(0, 8);
      const actStr = r.actual.padEnd(8, ' ').slice(0, 8);
      return `${idStr} | ${nameStr} | ${expStr} | ${actStr} | ${r.status}`;
    });

    const failedCount = vectorResults.filter((r) => r.status === 'FAIL').length;
    const passCount = vectorResults.filter((r) => r.status === 'PASS').length;

    const logFooter = [
      '---------------------------------------------------------------------------------------------------------',
      `Summary: ${passCount}/14 Vectors Passed, ${failedCount} Failed.`,
      failedCount === 0
        ? '✅ ALL 14 ATTACK VECTORS BLOCKED: Zero unearned grants, zero negative balances, zero privilege leaks.'
        : '❌ SECURITY ASSERTION FAILED: At least one attack vector succeeded in obtaining unearned value.',
      '=========================================================================================================',
    ];

    const fullLog = [...logHeader, ...logRows, ...logFooter].join('\n');
    console.log('\n' + fullLog + '\n');

    const rootDir = fs.existsSync(path.resolve(process.cwd(), 'packages'))
      ? process.cwd()
      : path.resolve(process.cwd(), '../..');
    const evidenceDir = path.resolve(rootDir, 'docs/audits/evidence/module-4');
    fs.mkdirSync(evidenceDir, { recursive: true });
    const logPath = path.join(evidenceDir, 'attacker-run.log');
    fs.writeFileSync(logPath, fullLog + '\n', 'utf8');

    expect(failedCount).toBe(0);
  });

  beforeEach(() => {
    fakeGateway.clear();
  });

  async function createTestUser(role = 'job_seeker', status = 'active'): Promise<string> {
    const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
    const res = await adminClient.query(
      'INSERT INTO public.users (phone, role, status) VALUES ($1, $2, $3) RETURNING id',
      [phone, role, status],
    );
    return res.rows[0].id;
  }

  async function insertTestOrder(
    userId: string,
    orderId: string,
    amountPaise = 59000,
    credits = 100,
    purpose = 'wallet',
  ): Promise<string> {
    const res = await adminClient.query(
      `INSERT INTO public.payments (
         user_id, gateway_order_id, amount_paise, amount_inr, currency,
         purpose, credits_to_grant, credits_added, status, order_snapshot
       ) VALUES ($1, $2, $3, $4, 'INR', $5, $6, $6, 'created', $7)
       RETURNING id`,
      [
        userId,
        orderId,
        amountPaise,
        Math.floor(amountPaise / 100),
        purpose,
        credits,
        JSON.stringify({ packId: 'pack_growth' }),
      ],
    );
    return res.rows[0].id;
  }

  // =====================================================================================
  // Vector 1: Anon key attempting direct calls to rpc_* or private tables -> 42501
  // =====================================================================================
  it('Vector 1: Anon role blocked from direct calls to rpc_* or private tables -> 42501', async () => {
    const targets = [
      "SELECT public.rpc_settle_payment('ord_1', 'pay_1', 59000, 'INR', 'card', 'evt_1', 'webhook')",
      "SELECT public.rpc_charge_application('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid)",
      "SELECT public.rpc_get_balance('00000000-0000-0000-0000-000000000001'::uuid)",
      "SELECT public.rpc_claim_sponsorship_seats('00000000-0000-0000-0000-000000000001'::uuid, ARRAY['00000000-0000-0000-0000-000000000001'::uuid])",
      'SELECT * FROM public.payments LIMIT 1',
      'SELECT * FROM public.credit_ledgers LIMIT 1',
      'SELECT * FROM public.institution_sponsorships LIMIT 1',
    ];

    let allBlocked = true;
    let actualCode = '42501';

    for (const sql of targets) {
      try {
        await anonClient.query(sql);
        allBlocked = false;
        actualCode = 'SUCCESS';
        break;
      } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code !== '42501') {
          allBlocked = false;
          actualCode = error.code || 'ERROR';
          break;
        }
      }
    }

    vectorResults.push({
      vectorId: 1,
      name: 'Anon key direct calls to rpc_* & private tables blocked',
      expected: '42501',
      actual: actualCode,
      status: allBlocked ? 'PASS' : 'FAIL',
    });

    expect(allBlocked).toBe(true);
    expect(actualCode).toBe('42501');
  });

  // =====================================================================================
  // Vector 2: Authenticated role attempting direct calls to rpc_* or private tables -> 42501
  // =====================================================================================
  it('Vector 2: Authenticated role blocked from direct calls to rpc_* or private tables -> 42501', async () => {
    const targets = [
      "SELECT public.rpc_settle_payment('ord_1', 'pay_1', 59000, 'INR', 'card', 'evt_1', 'webhook')",
      "SELECT public.rpc_charge_application('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid)",
      "SELECT public.rpc_get_balance('00000000-0000-0000-0000-000000000001'::uuid)",
      "SELECT public.rpc_claim_sponsorship_seats('00000000-0000-0000-0000-000000000001'::uuid, ARRAY['00000000-0000-0000-0000-000000000001'::uuid])",
      'SELECT * FROM public.payments LIMIT 1',
      'SELECT * FROM public.credit_ledgers LIMIT 1',
      'SELECT * FROM public.institution_sponsorships LIMIT 1',
    ];

    let allBlocked = true;
    let actualCode = '42501';

    for (const sql of targets) {
      try {
        await authClient.query(sql);
        allBlocked = false;
        actualCode = 'SUCCESS';
        break;
      } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code !== '42501') {
          allBlocked = false;
          actualCode = error.code || 'ERROR';
          break;
        }
      }
    }

    vectorResults.push({
      vectorId: 2,
      name: 'Authenticated role direct calls to rpc_* & private tables blocked',
      expected: '42501',
      actual: actualCode,
      status: allBlocked ? 'PASS' : 'FAIL',
    });

    expect(allBlocked).toBe(true);
    expect(actualCode).toBe('42501');
  });

  // =====================================================================================
  // Vector 3: Forged webhook (bad sig, wrong secret, altered body, missing event id) -> 400
  // =====================================================================================
  it('Vector 3: Forged webhook signatures, secrets, altered bytes, and missing headers -> 400', async () => {
    const rawPayload = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_attack_3', order_id: 'ord_attack_3', amount: 59000 } } },
    });

    const validSig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawPayload).digest('hex');
    const wrongSecretSig = crypto.createHmac('sha256', 'wrong_secret_key_that_does_not_match').update(rawPayload).digest('hex');

    // Case A: Missing signature header
    const resA = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-event-id': 'evt_3a',
      },
      payload: rawPayload,
    });

    // Case B: Wrong signature hex
    const resB = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-event-id': 'evt_3b',
        'x-razorpay-signature': '0'.repeat(64),
      },
      payload: rawPayload,
    });

    // Case C: Computed with wrong secret
    const resC = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-event-id': 'evt_3c',
        'x-razorpay-signature': wrongSecretSig,
      },
      payload: rawPayload,
    });

    // Case D: Altered body after HMAC computed
    const resD = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-event-id': 'evt_3d',
        'x-razorpay-signature': validSig,
      },
      payload: rawPayload + ' ', // Altered bytes
    });

    // Case E: Missing x-razorpay-event-id header
    const resE = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': validSig,
      },
      payload: rawPayload,
    });

    const all400 = [resA, resB, resC, resD, resE].every((r) => r.statusCode === 400);

    vectorResults.push({
      vectorId: 3,
      name: 'Forged webhooks (bad sig, wrong secret, altered bytes, missing event id)',
      expected: '400',
      actual: all400 ? '400' : 'NON_400',
      status: all400 ? 'PASS' : 'FAIL',
    });

    expect(all400).toBe(true);
  });

  // =====================================================================================
  // Vector 4: Replay same webhook event id x100 -> exactly 1 grant
  // =====================================================================================
  it('Vector 4: Replay same webhook event id x100 -> exactly 1 grant', async () => {
    const userId = await createTestUser('employer');
    const orderId = `order_v4_${Date.now()}`;
    const paymentId = `pay_v4_${Date.now()}`;
    const eventId = `evt_v4_${Date.now()}`;

    const paymentDbId = await insertTestOrder(userId, orderId, 59000, 100);

    fakeGateway.seedOrder({
      id: orderId,
      amountPaise: 59000,
      receipt: 'rcpt_v4',
      notes: {},
    });
    fakeGateway.seedPayment({
      id: paymentId,
      orderId,
      amountPaise: 59000,
      currency: 'INR',
      status: 'captured',
      method: 'upi',
    });

    const payloadObj = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            amount: 59000,
            currency: 'INR',
            status: 'captured',
            method: 'upi',
          },
        },
      },
    };
    const rawBody = JSON.stringify(payloadObj);
    const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');

    // Fire 100 webhook requests in parallel with identical event ID
    const promises = Array.from({ length: 100 }, () =>
      app.inject({
        method: 'POST',
        url: '/webhooks/razorpay',
        headers: {
          'x-razorpay-event-id': eventId,
          'x-razorpay-signature': signature,
          'content-type': 'application/json',
        },
        payload: rawBody,
      }),
    );

    const responses = await Promise.all(promises);
    expect(responses.every((r) => r.statusCode === 200)).toBe(true);

    // Verify DB grants: exactly 1 grant row in private_payments.payment_grants, exactly 1 credit ledger row
    const grantsRes = await adminClient.query(
      'SELECT COUNT(*)::int as count FROM private_payments.payment_grants WHERE payment_id = $1',
      [paymentDbId],
    );
    const ledgersRes = await adminClient.query(
      'SELECT COUNT(*)::int as count FROM public.credit_ledgers WHERE payment_id = $1',
      [paymentDbId],
    );

    const grantsCount = grantsRes.rows[0].count;
    const ledgersCount = ledgersRes.rows[0].count;

    const pass = grantsCount === 1 && ledgersCount === 1;

    vectorResults.push({
      vectorId: 4,
      name: 'Replay same webhook event id x100 -> exactly 1 grant',
      expected: '1 grant',
      actual: `${grantsCount} grant`,
      status: pass ? 'PASS' : 'FAIL',
    });

    expect(grantsCount).toBe(1);
    expect(ledgersCount).toBe(1);
  });

  // =====================================================================================
  // Vector 5: Different event id, same payment reference x100 -> exactly 1 grant
  // =====================================================================================
  it('Vector 5: Different event id, same payment reference x100 -> exactly 1 grant', async () => {
    const userId = await createTestUser('employer');
    const orderId = `order_v5_${Date.now()}`;
    const paymentId = `pay_v5_${Date.now()}`;

    const paymentDbId = await insertTestOrder(userId, orderId, 59000, 100);

    fakeGateway.seedOrder({
      id: orderId,
      amountPaise: 59000,
      receipt: 'rcpt_v5',
      notes: {},
    });
    fakeGateway.seedPayment({
      id: paymentId,
      orderId,
      amountPaise: 59000,
      currency: 'INR',
      status: 'captured',
      method: 'card',
    });

    const payloadObj = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            amount: 59000,
            currency: 'INR',
            status: 'captured',
            method: 'card',
          },
        },
      },
    };
    const rawBody = JSON.stringify(payloadObj);
    const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');

    // 100 parallel webhooks with distinct event IDs
    const promises = Array.from({ length: 100 }, (_, i) =>
      app.inject({
        method: 'POST',
        url: '/webhooks/razorpay',
        headers: {
          'x-razorpay-event-id': `evt_v5_diff_${Date.now()}_${i}`,
          'x-razorpay-signature': signature,
          'content-type': 'application/json',
        },
        payload: rawBody,
      }),
    );

    const responses = await Promise.all(promises);
    expect(responses.every((r) => r.statusCode === 200)).toBe(true);

    const grantsRes = await adminClient.query(
      'SELECT COUNT(*)::int as count FROM private_payments.payment_grants WHERE payment_id = $1',
      [paymentDbId],
    );
    const ledgersRes = await adminClient.query(
      'SELECT COUNT(*)::int as count FROM public.credit_ledgers WHERE payment_id = $1',
      [paymentDbId],
    );

    const grantsCount = grantsRes.rows[0].count;
    const ledgersCount = ledgersRes.rows[0].count;

    const pass = grantsCount === 1 && ledgersCount === 1;

    vectorResults.push({
      vectorId: 5,
      name: 'Different event id, same payment reference x100 -> exactly 1 grant',
      expected: '1 grant',
      actual: `${grantsCount} grant`,
      status: pass ? 'PASS' : 'FAIL',
    });

    expect(grantsCount).toBe(1);
    expect(ledgersCount).toBe(1);
  });

  // =====================================================================================
  // Vector 6: Webhook payload amount != gateway amount -> gateway amount checked / anomaly
  // =====================================================================================
  it('Vector 6: Webhook payload amount != gateway amount -> authoritative gateway amount checked', async () => {
    const userId = await createTestUser('employer');
    const orderId = `order_v6_${Date.now()}`;
    const paymentId = `pay_v6_${Date.now()}`;

    // Order created for 59000 paise (₹590)
    const paymentDbId = await insertTestOrder(userId, orderId, 59000, 100);

    // Gateway authoritatively records 59000 paise
    fakeGateway.seedOrder({
      id: orderId,
      amountPaise: 59000,
      receipt: 'rcpt_v6',
      notes: {},
    });
    fakeGateway.seedPayment({
      id: paymentId,
      orderId,
      amountPaise: 59000,
      currency: 'INR',
      status: 'captured',
      method: 'netbanking',
    });

    // Fraudulent webhook payload claiming 99,999,900 paise (mint ₹1,000,000 fraud attempt)
    const payloadObj = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            amount: 99999900,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    };
    const rawBody = JSON.stringify(payloadObj);
    const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'x-razorpay-event-id': `evt_v6_${Date.now()}`,
        'x-razorpay-signature': signature,
        'content-type': 'application/json',
      },
      payload: rawBody,
    });

    expect(res.statusCode).toBe(200);

    // Verify: The gateway amount (59000 paise) was used, and only the genuine 100 credits granted
    const ledgersRes = await adminClient.query(
      'SELECT amount FROM public.credit_ledgers WHERE payment_id = $1',
      [paymentDbId],
    );

    const grantedCredits = ledgersRes.rows[0]?.amount;
    const pass = grantedCredits === 100;

    vectorResults.push({
      vectorId: 6,
      name: 'Webhook payload amount mismatch defeated by authoritative gateway fetch',
      expected: '100 cred',
      actual: `${grantedCredits} cred`,
      status: pass ? 'PASS' : 'FAIL',
    });

    expect(grantedCredits).toBe(100);
  });

  // =====================================================================================
  // Vector 7: ₹590 wallet payment -> sponsorship -> rejected / no grant
  // =====================================================================================
  it('Vector 7: Recharge order attempting to claim sponsorship -> rejected with zero grants', async () => {
    const intermediaryId = await createTestUser('intermediary');
    const walletOrderId = `order_v7_wallet_${Date.now()}`;
    const paymentId = `pay_v7_${Date.now()}`;

    // Create an institution
    const instRes = await adminClient.query(
      `INSERT INTO public.institution_profiles (user_id, institution_name, affiliation, city)
       VALUES ($1, 'V7 Engineering College', 'AICTE', 'Pune') RETURNING id`,
      [intermediaryId],
    );
    const institutionId = instRes.rows[0].id;

    // Create a wallet order for ₹590 (59000 paise)
    await insertTestOrder(intermediaryId, walletOrderId, 59000, 100, 'wallet');

    fakeGateway.seedOrder({
      id: walletOrderId,
      amountPaise: 59000,
      receipt: 'rcpt_v7',
      notes: {},
    });
    fakeGateway.seedPayment({
      id: paymentId,
      orderId: walletOrderId,
      amountPaise: 59000,
      currency: 'INR',
      status: 'captured',
      method: 'card',
    });

    // Settle this wallet order
    const outcome = await paymentService.settleFromGateway(
      walletOrderId,
      paymentId,
      'webhook',
      `evt_v7_${Date.now()}`,
    );

    // Order is purpose 'wallet', so it settled as wallet credits, NEVER sponsorship!
    const sponRes = await adminClient.query(
      'SELECT COUNT(*)::int as count FROM public.institution_sponsorships WHERE institution_id = $1',
      [institutionId],
    );

    const sponsorshipsCreated = sponRes.rows[0].count;
    const pass = sponsorshipsCreated === 0 && outcome.status === 'settled';

    vectorResults.push({
      vectorId: 7,
      name: '₹590 wallet payment attempting to claim sponsorship -> 0 sponsorship grants',
      expected: '0 spon',
      actual: `${sponsorshipsCreated} spon`,
      status: pass ? 'PASS' : 'FAIL',
    });

    expect(sponsorshipsCreated).toBe(0);
  });

  // =====================================================================================
  // Vector 8: Reuse a captured payment (any reference) -> no second grant
  // =====================================================================================
  it('Vector 8: Reuse captured payment reference -> duplicate_capture, zero second grant', async () => {
    const userId = await createTestUser('employer');
    const orderA = `order_v8_a_${Date.now()}`;
    const orderB = `order_v8_b_${Date.now()}`;
    const paymentId = `pay_v8_shared_${Date.now()}`;

    const paymentDbIdA = await insertTestOrder(userId, orderA, 59000, 100);
    await insertTestOrder(userId, orderB, 59000, 100);

    fakeGateway.seedOrder({
      id: orderA,
      amountPaise: 59000,
      receipt: 'rcpt_v8_a',
      notes: {},
    });
    fakeGateway.seedPayment({
      id: paymentId,
      orderId: orderA,
      amountPaise: 59000,
      currency: 'INR',
      status: 'captured',
      method: 'card',
    });

    // Settle Order A
    const settleA = await paymentService.settleFromGateway(orderA, paymentId, 'webhook');
    expect(settleA.status).toBe('settled');

    // Attempt to settle Order B with the SAME paymentId (order mismatch / duplicate)
    let secondSettleBlocked = false;
    try {
      const settleB = await paymentService.settleFromGateway(orderB, paymentId, 'webhook');
      if (settleB.status === 'duplicate_capture' || settleB.status === 'pending') {
        secondSettleBlocked = true;
      }
    } catch (err: unknown) {
      const error = err as { message?: string; status?: number };
      if (error.message?.includes('ORDER_MISMATCH') || error.message?.includes('does not match') || error.status === 400) {
        secondSettleBlocked = true;
      }
    }

    // Verify DB: exactly 1 payment grant in total for this payment
    const grantsRes = await adminClient.query(
      'SELECT COUNT(*)::int as count FROM private_payments.payment_grants WHERE payment_id = $1',
      [paymentDbIdA],
    );

    const grantsCount = grantsRes.rows[0].count;
    const isZeroSecondGrant = grantsCount === 1 && secondSettleBlocked;

    vectorResults.push({
      vectorId: 8,
      name: 'Reuse captured payment on another order -> rejected with 0 second grant',
      expected: '1 grant',
      actual: `${grantsCount} grant`,
      status: isZeroSecondGrant ? 'PASS' : 'FAIL',
    });

    expect(isZeroSecondGrant).toBe(true);
  });

  // =====================================================================================
  // Vector 9: Other user's order on /verify -> 404
  // =====================================================================================
  it('Vector 9: Calling /verify with another user\'s order ID returns 404', async () => {
    const userVictim = await createTestUser('employer');
    const userAttacker = await createTestUser('employer');
    const orderId = `order_v9_${Date.now()}`;
    const paymentId = `pay_v9_${Date.now()}`;

    await insertTestOrder(userVictim, orderId, 59000, 100);

    const validCheckoutSig = crypto.createHmac('sha256', KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    // Attacker calls /wallet/recharge/verify with Victim's orderId
    const res = await app.inject({
      method: 'POST',
      url: '/wallet/recharge/verify',
      headers: {
        'x-user-id': userAttacker,
        'x-user-role': 'employer',
      },
      payload: {
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validCheckoutSig,
      },
    });

    const pass = res.statusCode === 404;

    vectorResults.push({
      vectorId: 9,
      name: 'Other user\'s order on /wallet/recharge/verify rejected with 404',
      expected: '404',
      actual: String(res.statusCode),
      status: pass ? 'PASS' : 'FAIL',
    });

    expect(res.statusCode).toBe(404);
  });

  // =====================================================================================
  // Vector 10: Self-set institution_id / sponsorship_id as client -> FORBIDDEN_COLUMN
  // =====================================================================================
  it('Vector 10: Client direct update of institution_id or sponsorship_id raises FORBIDDEN_COLUMN', async () => {
    const userId = await createTestUser('job_seeker');

    const profRes = await adminClient.query(
      `INSERT INTO public.job_seeker_profiles (user_id, full_name, city, created_at)
       VALUES ($1, 'Student Candidate', 'New Delhi', NOW()) RETURNING id`,
      [userId],
    );
    const profileId = profRes.rows[0].id;
    const dummyId = crypto.randomUUID();

    let triggerRaised = false;
    let actualMsg = '';

    await adminClient.query('BEGIN');
    await adminClient.query('SET LOCAL ROLE authenticated');
    try {
      await adminClient.query(
        'UPDATE public.job_seeker_profiles SET sponsorship_id = $1 WHERE id = $2',
        [dummyId, profileId],
      );
    } catch (err: unknown) {
      const error = err as { message?: string };
      triggerRaised = true;
      actualMsg = error.message || '';
    } finally {
      await adminClient.query('ROLLBACK');
    }

    const pass = triggerRaised && (actualMsg.includes('FORBIDDEN_COLUMN') || actualMsg.includes('permission denied'));

    vectorResults.push({
      vectorId: 10,
      name: 'Client direct update of institution_id / sponsorship_id raises FORBIDDEN_COLUMN',
      expected: 'FORBIDDEN',
      actual: pass ? 'FORBIDDEN' : actualMsg.slice(0, 8),
      status: pass ? 'PASS' : 'FAIL',
    });

    expect(pass).toBe(true);
  });

  // =====================================================================================
  // Vector 11: Free-text college name -> no coverage
  // =====================================================================================
  it('Vector 11: Free-text college name does not confer sponsorship coverage', async () => {
    const studentUserId = await createTestUser('job_seeker');

    await adminClient.query(
      `INSERT INTO public.job_seeker_profiles (user_id, full_name, city, institution, created_at)
       VALUES ($1, 'FreeText Candidate', 'New Delhi', 'IIT Bombay', NOW())`,
      [studentUserId],
    );

    // Initial starter balance: 10
    const startBalRes = await adminClient.query(
      'SELECT public.rpc_get_balance($1) as bal',
      [studentUserId],
    );
    expect(Number(startBalRes.rows[0].bal)).toBe(10);

    const dummyJobId = crypto.randomUUID();

    // Call rpc_charge_application: without valid active sponsorship, student is charged 1 credit
    const chargeRes = await adminClient.query(
      'SELECT public.rpc_charge_application($1, $2) as result',
      [studentUserId, dummyJobId],
    );

    const chargeResult = chargeRes.rows[0].result;
    // charged = true (or 1), sponsored = false
    const pass = (chargeResult.charged === true || chargeResult.charged === 1) && chargeResult.sponsored === false;

    // Balance after charge: 9
    const endBalRes = await adminClient.query(
      'SELECT public.rpc_get_balance($1) as bal',
      [studentUserId],
    );
    const endBal = Number(endBalRes.rows[0].bal);

    vectorResults.push({
      vectorId: 11,
      name: 'Free-text college name receives 0 sponsorship coverage (standard 1 credit deducted)',
      expected: 'Charged 1',
      actual: `Charged ${chargeResult.charged ? 1 : 0}`,
      status: pass && endBal === 9 ? 'PASS' : 'FAIL',
    });

    expect(chargeResult.sponsored).toBe(false);
    expect(endBal).toBe(9);
  });

  // =====================================================================================
  // Vector 12: 50 concurrent settles of one order -> exactly 1 credit grant
  // =====================================================================================
  it('Vector 12: 50 concurrent settles of one order -> exactly 1 credit grant', async () => {
    const userId = await createTestUser('employer');
    const orderId = `order_v12_${Date.now()}`;
    const paymentId = `pay_v12_${Date.now()}`;

    const paymentDbId = await insertTestOrder(userId, orderId, 59000, 100);

    fakeGateway.seedOrder({
      id: orderId,
      amountPaise: 59000,
      receipt: 'rcpt_v12',
      notes: {},
    });
    fakeGateway.seedPayment({
      id: paymentId,
      orderId,
      amountPaise: 59000,
      currency: 'INR',
      status: 'captured',
      method: 'upi',
    });

    // 50 concurrent settle calls with distinct event IDs
    const now = Date.now();
    const settleCalls = Array.from({ length: 50 }, (_, i) =>
      paymentService.settleFromGateway(orderId, paymentId, 'webhook', `evt_v12_${now}_${i}`),
    );

    const outcomes = await Promise.all(settleCalls);
    const settledCount = outcomes.filter((o) => o.status === 'settled').length;
    const alreadySettledCount = outcomes.filter((o) => o.status === 'already_settled').length;

    // Verify DB ledger entries
    const ledgerRes = await adminClient.query(
      'SELECT COUNT(*)::int as count FROM public.credit_ledgers WHERE payment_id = $1',
      [paymentDbId],
    );
    const ledgerCount = ledgerRes.rows[0].count;

    const pass = settledCount === 1 && alreadySettledCount === 49 && ledgerCount === 1;

    vectorResults.push({
      vectorId: 12,
      name: '50 concurrent settles of one order -> exactly 1 credit grant (49 already_settled)',
      expected: '1 grant',
      actual: `${ledgerCount} grant`,
      status: pass ? 'PASS' : 'FAIL',
    });

    expect(settledCount).toBe(1);
    expect(alreadySettledCount).toBe(49);
    expect(ledgerCount).toBe(1);
  });

  // =====================================================================================
  // Vector 13: 50 concurrent applications at balance 1 -> 1 success, balance >= 0
  // =====================================================================================
  it('Vector 13: 50 concurrent applications at balance 1 -> exactly 1 success, balance >= 0', async () => {
    // User created in invited status -> NO starter credits triggered
    const userId = await createTestUser('job_seeker', 'invited');

    // Insert exactly 1 credit
    await adminClient.query(
      "INSERT INTO public.credit_ledgers (user_id, amount, reason, source) VALUES ($1, 1, 'test_unit_1', 'system')",
      [userId],
    );

    // Initial balance check
    const b1Res = await adminClient.query('SELECT public.rpc_get_balance($1) as bal', [userId]);
    expect(Number(b1Res.rows[0].bal)).toBe(1);

    // Connect 50 distinct clients to test real concurrent overdraft serialization
    const clientPool: pg.Client[] = [];
    for (let i = 0; i < 50; i++) {
      const c = new pg.Client({ connectionString: DATABASE_URL });
      await c.connect();
      clientPool.push(c);
    }

    try {
      const jobIds = Array.from({ length: 50 }, () => crypto.randomUUID());
      const deductionResults = await Promise.allSettled(
        clientPool.map((c, idx) =>
          c.query('SELECT public.rpc_charge_application($1, $2) as result', [userId, jobIds[idx]]),
        ),
      );

      const successfulDeductions = deductionResults.filter(
        (r) => r.status === 'fulfilled' && (r.value.rows[0].result?.charged === true || r.value.rows[0].result?.charged === 1),
      ).length;

      const finalBalRes = await adminClient.query('SELECT public.rpc_get_balance($1) as bal', [userId]);
      const finalBal = Number(finalBalRes.rows[0].bal);

      const pass = successfulDeductions === 1 && finalBal === 0;

      vectorResults.push({
        vectorId: 13,
        name: '50 concurrent application charges at balance 1 -> exactly 1 success, balance >= 0',
        expected: '1 success',
        actual: `${successfulDeductions} success`,
        status: pass ? 'PASS' : 'FAIL',
      });

      expect(successfulDeductions).toBe(1);
      expect(finalBal).toBe(0);
    } finally {
      for (const c of clientPool) {
        await c.end().catch(() => {});
      }
    }
  });

  // =====================================================================================
  // Vector 14: Forged role / bypass token headers (?role=platform_admin, jwt_session_*) -> 401/403
  // =====================================================================================
  it('Vector 14: Forged role query params, bypass headers, and legacy tokens rejected with 401/403', async () => {
    // Attempt A: query param spoof ?role=platform_admin
    const resA = await app.inject({
      method: 'POST',
      url: '/wallet/recharge/create-order?role=platform_admin',
      payload: { packId: 'pack_growth', termsVersion: 'v1.0' },
    });

    // Attempt B: legacy jwt_session cookie
    const resB = await app.inject({
      method: 'POST',
      url: '/wallet/recharge/create-order',
      headers: {
        cookie: 'jwt_session_token=fake_forged_session_token; role=platform_admin',
      },
      payload: { packId: 'pack_growth', termsVersion: 'v1.0' },
    });

    // Attempt C: forged unauthenticated call to sponsorship create-order with fake admin header
    const resC = await app.inject({
      method: 'POST',
      url: '/institution/sponsorship/create-order',
      headers: {
        'x-user-role': 'admin', // without user id or token
      },
      payload: {
        institutionId: '00000000-0000-0000-0000-000000000001',
        declaredStudentCount: 50,
        termsVersion: 'v1.0',
      },
    });

    const isBlockedA = resA.statusCode === 401 || resA.statusCode === 403;
    const isBlockedB = resB.statusCode === 401 || resB.statusCode === 403;
    const isBlockedC = resC.statusCode === 401 || resC.statusCode === 403;

    const allBlocked = isBlockedA && isBlockedB && isBlockedC;

    vectorResults.push({
      vectorId: 14,
      name: 'Forged role (?role=platform_admin, legacy cookie, unauthenticated role) -> 401/403',
      expected: '401/403',
      actual: allBlocked ? '401/403' : 'BYPASSED',
      status: allBlocked ? 'PASS' : 'FAIL',
    });

    expect(allBlocked).toBe(true);
  });
});
