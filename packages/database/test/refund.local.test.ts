import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';

const DATABASE_URL =
  process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('pooler.supabase.com')
    ? process.env.DATABASE_URL
    : 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

interface Fixture {
  userId: string;
  orderId: string;
  paymentId: string;
  amountPaise: number;
  credits: number;
  paymentRowId: string;
}

const db = new pg.Client({ connectionString: DATABASE_URL });
let poolClients: pg.Client[] = [];

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  for (const c of poolClients) {
    await c.end().catch(() => {});
  }
  await db.end();
});

afterEach(async () => {
  for (const c of poolClients) {
    await c.end().catch(() => {});
  }
  poolClients = [];
});

async function createPaidWalletOrder(overrides: {
  amountPaise?: number;
  credits?: number;
} = {}): Promise<Fixture> {
  const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const userRes = await db.query(
    "INSERT INTO public.users (phone, role, status) VALUES ($1, 'employer', 'active') RETURNING id",
    [phone]
  );
  const userId = userRes.rows[0].id;
  const orderId = `order_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const paymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const amountPaise = overrides.amountPaise ?? 59000;
  const credits = overrides.credits ?? 50;

  const payRes = await db.query(
    `INSERT INTO public.payments (
       user_id, gateway_order_id, amount_paise, amount_inr, currency, purpose, credits_to_grant, status
     ) VALUES ($1, $2, $3, $4, 'INR', 'wallet', $5, 'created') RETURNING id`,
    [userId, orderId, amountPaise, amountPaise / 100, credits]
  );

  // Settle payment
  await db.query(
    'SELECT public.rpc_settle_payment($1, $2, $3, $4, $5, $6, $7)',
    [orderId, paymentId, amountPaise, 'INR', 'upi', null, 'test']
  );

  return {
    userId,
    orderId,
    paymentId,
    amountPaise,
    credits,
    paymentRowId: payRes.rows[0].id,
  };
}

async function balance(userId: string): Promise<number> {
  const res = await db.query('SELECT public.rpc_get_balance($1) as b', [userId]);
  return Number(res.rows[0].b);
}

describe('Refunds & Reversals (WAL-06, Task 5)', () => {
  it('Full refund of unspent credits -> balance 0 and outbox credit note enqueued', async () => {
    const fix = await createPaidWalletOrder({ amountPaise: 59000, credits: 50 });
    expect(await balance(fix.userId)).toBe(50);

    const refundId = `rfnd_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const res = await db.query(
      'SELECT public.rpc_apply_refund($1, $2, $3, $4) as r',
      [fix.paymentId, refundId, 59000, null]
    );

    const r = res.rows[0].r;
    expect(r.status).toBe('applied');
    expect(r.credits_reversed).toBe(50);
    expect(r.unrecovered_credits).toBe(0);

    // Balance is now 0
    expect(await balance(fix.userId)).toBe(0);

    // Payment marked as refunded
    const payRes = await db.query('SELECT status, refunded_at FROM public.payments WHERE id = $1', [fix.paymentRowId]);
    expect(payRes.rows[0].status).toBe('refunded');
    expect(payRes.rows[0].refunded_at).not.toBeNull();

    // Outbox has credit_note row
    const outboxRes = await db.query(
      "SELECT * FROM private_payments.outbox WHERE payment_id = $1 AND kind = 'credit_note'",
      [fix.paymentRowId]
    );
    expect(outboxRes.rows.length).toBe(1);

    // Audit log has PAYMENT_REFUNDED
    const auditRes = await db.query(
      "SELECT * FROM public.audit_logs WHERE action = 'PAYMENT_REFUNDED' AND entity_id = $1",
      [fix.paymentRowId]
    );
    expect(auditRes.rows.length).toBe(1);
  });

  it('Refund after spending -> partial reversal + anomaly REFUND_UNRECOVERED', async () => {
    const fix = await createPaidWalletOrder({ amountPaise: 59000, credits: 50 });
    expect(await balance(fix.userId)).toBe(50);

    // Spend 40 credits
    const jobId = randomUUID();

    // Insert debit of 40 credits
    await db.query(
      `INSERT INTO public.credit_ledgers (user_id, amount, reason, ref_id, source)
       VALUES ($1, -40, 'application', $2, 'test')`,
      [fix.userId, jobId]
    );
    expect(await balance(fix.userId)).toBe(10);

    // Full refund requested (target reversal: 50)
    const refundId = `rfnd_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const res = await db.query(
      'SELECT public.rpc_apply_refund($1, $2, $3, $4) as r',
      [fix.paymentId, refundId, 59000, null]
    );

    const r = res.rows[0].r;
    expect(r.status).toBe('applied');
    expect(r.credits_reversed).toBe(10); // only 10 recoverable
    expect(r.unrecovered_credits).toBe(40);

    // Balance is 0 (never negative)
    expect(await balance(fix.userId)).toBe(0);

    // Anomaly REFUND_UNRECOVERED logged
    const anomalyRes = await db.query(
      "SELECT * FROM private_payments.payment_anomalies WHERE kind = 'REFUND_UNRECOVERED' AND gateway_payment_id = $1",
      [fix.paymentId]
    );
    expect(anomalyRes.rows.length).toBe(1);
    expect(anomalyRes.rows[0].details.unrecovered_credits).toBe(40);
  });

  it('Partial refund pro-rata: 50% refund claws back 50% credits; 2nd partial completes to 100%', async () => {
    const fix = await createPaidWalletOrder({ amountPaise: 100000, credits: 100 });
    expect(await balance(fix.userId)).toBe(100);

    // First partial refund of 50000 paise (50%)
    const refundId1 = `rfnd_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const res1 = await db.query(
      'SELECT public.rpc_apply_refund($1, $2, $3, $4) as r',
      [fix.paymentId, refundId1, 50000, null]
    );

    expect(res1.rows[0].r.status).toBe('applied');
    expect(res1.rows[0].r.credits_reversed).toBe(50);
    expect(await balance(fix.userId)).toBe(50);

    // Payment is partially_refunded
    const payRes1 = await db.query('SELECT status FROM public.payments WHERE id = $1', [fix.paymentRowId]);
    expect(payRes1.rows[0].status).toBe('partially_refunded');

    // Second partial refund of remaining 50000 paise
    const refundId2 = `rfnd_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const res2 = await db.query(
      'SELECT public.rpc_apply_refund($1, $2, $3, $4) as r',
      [fix.paymentId, refundId2, 50000, null]
    );

    expect(res2.rows[0].r.status).toBe('applied');
    expect(res2.rows[0].r.credits_reversed).toBe(50);
    expect(await balance(fix.userId)).toBe(0);

    // Payment is now fully refunded
    const payRes2 = await db.query('SELECT status FROM public.payments WHERE id = $1', [fix.paymentRowId]);
    expect(payRes2.rows[0].status).toBe('refunded');
  });

  it('Replay -> idempotent (returns already_applied and leaves balance intact)', async () => {
    const fix = await createPaidWalletOrder({ amountPaise: 59000, credits: 50 });
    const refundId = `rfnd_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const res1 = await db.query(
      'SELECT public.rpc_apply_refund($1, $2, $3, $4) as r',
      [fix.paymentId, refundId, 59000, null]
    );
    expect(res1.rows[0].r.status).toBe('applied');
    expect(await balance(fix.userId)).toBe(0);

    // Replay with identical gateway_refund_id
    const res2 = await db.query(
      'SELECT public.rpc_apply_refund($1, $2, $3, $4) as r',
      [fix.paymentId, refundId, 59000, null]
    );
    expect(res2.rows[0].r.status).toBe('already_applied');
    expect(res2.rows[0].r.refund_id).toBe(res1.rows[0].r.refund_id);
    expect(await balance(fix.userId)).toBe(0);
  });

  it('Sponsorship full refund -> grant revoked', async () => {
    const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
    const userRes = await db.query(
      "INSERT INTO public.users (phone, role, status) VALUES ($1, 'intermediary', 'active') RETURNING id",
      [phone]
    );
    const userId = userRes.rows[0].id;

    const instRes = await db.query(
      "INSERT INTO public.institution_profiles (user_id, institution_name, affiliation, city) VALUES ($1, 'IIT Bombay', 'AICTE', 'Mumbai') RETURNING id",
      [userId]
    );
    const instId = instRes.rows[0].id;

    const orderId = `order_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const paymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const amountPaise = 1500000;

    const payRes = await db.query(
      `INSERT INTO public.payments (
         user_id, gateway_order_id, amount_paise, amount_inr, currency, purpose, credits_to_grant,
         order_snapshot, status
       ) VALUES ($1, $2, $3, $4, 'INR', 'sponsorship', 0, $5, 'created') RETURNING id`,
      [
        userId,
        orderId,
        amountPaise,
        amountPaise / 100,
        JSON.stringify({
          institutionId: instId,
          tier: 'Small',
          ratePaise: 15000,
          studentCap: 100,
          termDays: 365,
        }),
      ]
    );
    const payRowId = payRes.rows[0].id;

    // Settle sponsorship
    await db.query(
      'SELECT public.rpc_settle_payment($1, $2, $3, $4, $5, $6, $7)',
      [orderId, paymentId, amountPaise, 'INR', 'netbanking', null, 'test']
    );

    // Verify active grant exists
    const grantRes1 = await db.query(
      'SELECT status FROM public.institution_sponsorships WHERE payment_id = $1',
      [payRowId]
    );
    expect(grantRes1.rows[0].status).toBe('active');

    // Apply full refund
    const refundId = `rfnd_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const refRes = await db.query(
      'SELECT public.rpc_apply_refund($1, $2, $3, $4) as r',
      [paymentId, refundId, amountPaise, null]
    );
    expect(refRes.rows[0].r.status).toBe('applied');

    // Verify grant is now revoked
    const grantRes2 = await db.query(
      'SELECT status FROM public.institution_sponsorships WHERE payment_id = $1',
      [payRowId]
    );
    expect(grantRes2.rows[0].status).toBe('revoked');

    // Audit log records INSTITUTION_SPONSORSHIP_REVOKED
    const auditRes = await db.query(
      "SELECT * FROM public.audit_logs WHERE action = 'INSTITUTION_SPONSORSHIP_REVOKED' AND entity_id = $1",
      [payRowId]
    );
    expect(auditRes.rows.length).toBe(1);
  });

  it('Concurrent refund + charge -> balance never negative', async () => {
    // Settle wallet with 5 credits
    const fix = await createPaidWalletOrder({ amountPaise: 5900, credits: 5 });
    expect(await balance(fix.userId)).toBe(5);

    // Prepare 10 concurrent charges of 1 credit each, and 1 refund of all 5 credits
    const refundId = `rfnd_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    // Create 11 connections
    const clients: pg.Client[] = [];
    for (let i = 0; i < 11; i++) {
      const c = new pg.Client({ connectionString: DATABASE_URL });
      await c.connect();
      clients.push(c);
      poolClients.push(c);
    }

    // Launch 10 charges + 1 refund simultaneously
    const tasks: Promise<unknown>[] = [];

    // Refund task on client 0
    tasks.push(
      clients[0].query('SELECT public.rpc_apply_refund($1, $2, $3, $4) as r', [
        fix.paymentId,
        refundId,
        5900,
        null,
      ])
    );

    // 10 charges on clients 1..10 with distinct job IDs
    for (let i = 1; i <= 10; i++) {
      const jobId = randomUUID();
      tasks.push(
        clients[i]
          .query('SELECT public.rpc_charge_application($1, $2) as r', [fix.userId, jobId])
          .catch((err) => ({ error: err.message }))
      );
    }

    await Promise.allSettled(tasks);

    // Hard Invariant: dynamic balance must NEVER be negative
    const finalBal = await balance(fix.userId);
    expect(finalBal).toBeGreaterThanOrEqual(0);
  });
});
