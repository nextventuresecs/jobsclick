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

interface SettleOverrides {
  orderId?: string;
  paymentId?: string;
  amountPaise?: number;
  currency?: string;
  method?: string;
  eventId?: string | null;
  source?: string;
}

const db = new pg.Client({ connectionString: DATABASE_URL });
let poolClients: pg.Client[] = [];

beforeAll(async () => {
  await db.connect();
  await db.query(`
    create schema if not exists test_fault;
    create or replace function test_fault.boom() returns trigger language plpgsql as $$
    begin
      raise exception 'FAULT';
    end;
    $$;
  `);
});

afterAll(async () => {
  for (const c of poolClients) {
    await c.end().catch(() => {});
  }
  await db.query('drop schema if exists test_fault cascade;').catch(() => {});
  await db.end();
});

afterEach(async () => {
  await db.query('ROLLBACK').catch(() => {});
  for (const c of poolClients) {
    await c.end().catch(() => {});
  }
  poolClients = [];
});

async function order(overrides: {
  amountPaise?: number;
  credits?: number;
  purpose?: string;
  status?: string;
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
  const purpose = overrides.purpose ?? 'wallet';
  const status = overrides.status ?? 'created';

  const payRes = await db.query(
    `INSERT INTO public.payments (
       user_id, gateway_order_id, amount_paise, amount_inr, currency, purpose, credits_to_grant, status
     ) VALUES ($1, $2, $3, $4, 'INR', $5, $6, $7) RETURNING id`,
    [userId, orderId, amountPaise, amountPaise / 100, purpose, credits, status]
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

async function settle(c: pg.Client, o: Fixture, over: SettleOverrides = {}) {
  const res = await c.query(
    'select public.rpc_settle_payment($1, $2, $3, $4, $5, $6, $7) as r',
    [
      over.orderId ?? o.orderId,
      over.paymentId ?? o.paymentId,
      over.amountPaise ?? o.amountPaise,
      over.currency ?? 'INR',
      over.method ?? 'upi',
      over.eventId ?? null,
      over.source ?? 'test',
    ]
  );
  return res.rows[0].r;
}

async function balance(userId: string): Promise<number> {
  const res = await db.query('select public.rpc_get_balance($1) as b', [userId]);
  return Number(res.rows[0].b);
}

async function count(table: string, paymentId: string): Promise<number> {
  const res = await db.query(`select count(*) as c from ${table} where payment_id = $1`, [paymentId]);
  return Number(res.rows[0].c);
}

async function auditActions(entityId: string): Promise<string[]> {
  const res = await db.query(
    `select action from public.audit_logs
     where entity_id::text = $1 or (meta->>'entity_id') = $1 or (metadata->>'entity_id') = $1
     order by created_at asc`,
    [entityId]
  );
  return res.rows.map((r) => r.action);
}

async function outbox(paymentId: string): Promise<number> {
  const res = await db.query('select count(*) as c from private_payments.outbox where payment_id = $1', [paymentId]);
  return Number(res.rows[0].c);
}

async function payment(f: Fixture) {
  const res = await db.query('select * from public.payments where id = $1', [f.paymentRowId]);
  return res.rows[0];
}

async function eventExists(eventId: string): Promise<boolean> {
  const res = await db.query('select 1 from private_payments.webhook_events where event_id = $1', [eventId]);
  return res.rows.length > 0;
}

async function connect(n: number): Promise<pg.Client[]> {
  const clients: pg.Client[] = [];
  for (let i = 0; i < n; i++) {
    const c = new pg.Client({ connectionString: DATABASE_URL });
    await c.connect();
    clients.push(c);
    poolClients.push(c);
  }
  return clients;
}

describe('payment-settlement', () => {
  it('settles once: credits granted, grant row, audit rows, outbox row', async () => {
    const f = await order();
    const r = await settle(db, f);
    expect(r.status).toBe('settled');
    expect(await balance(f.userId)).toBe(50);
    expect(await count('private_payments.payment_grants', f.paymentRowId)).toBe(1);
    expect(await auditActions(f.paymentRowId)).toEqual(
      expect.arrayContaining(['PAYMENT_CAPTURED', 'CREDIT_WALLET_GRANTED'])
    );
    expect(await outbox(f.paymentRowId)).toBe(1);
  });

  it('is idempotent: second settle => already_settled, balance unchanged', async () => {
    const f = await order();
    const first = await settle(db, f);
    expect(first.status).toBe('settled');

    const second = await settle(db, f);
    expect(second.status).toBe('already_settled');
    expect(second.payment_id).toBe(f.paymentRowId);
    expect(await balance(f.userId)).toBe(50);
  });

  it('replayed event id => duplicate_event, no second grant', async () => {
    const f = await order();
    const eventId = `evt_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const first = await settle(db, f, { eventId });
    expect(first.status).toBe('settled');

    const second = await settle(db, f, { eventId });
    expect(second.status).toBe('duplicate_event');
    expect(await balance(f.userId)).toBe(50);
  });

  it('amount mismatch (1 paise) => amount_mismatch, status stays created, no credits, anomaly row', async () => {
    const f = await order({ amountPaise: 59000 });
    const r = await settle(db, f, { amountPaise: 59001 });
    expect(r.status).toBe('amount_mismatch');
    expect((await payment(f)).status).toBe('created');
    expect(await balance(f.userId)).toBe(0);

    const { rows: anomalies } = await db.query(
      "select * from private_payments.payment_anomalies where gateway_order_id = $1 and kind = 'AMOUNT_MISMATCH'",
      [f.orderId]
    );
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].details).toMatchObject({
      expected: 59000,
      got: 59001,
    });
  });

  it('currency != INR => amount_mismatch', async () => {
    const f = await order();
    const r = await settle(db, f, { currency: 'USD' });
    expect(r.status).toBe('amount_mismatch');
    expect((await payment(f)).status).toBe('created');
    expect(await balance(f.userId)).toBe(0);
  });

  it('unknown order => unknown_order + anomaly, no raise', async () => {
    const fakeOrderId = `order_unknown_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const f = await order();
    const r = await settle(db, f, { orderId: fakeOrderId });
    expect(r.status).toBe('unknown_order');

    const { rows: anomalies } = await db.query(
      "select * from private_payments.payment_anomalies where gateway_order_id = $1 and kind = 'UNKNOWN_ORDER'",
      [fakeOrderId]
    );
    expect(anomalies).toHaveLength(1);
  });

  it('second DIFFERENT payment id on an already-paid order => duplicate_capture + anomaly (customer paid twice → refund)', async () => {
    const f = await order();
    const firstPayId = `pay_1_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const secondPayId = `pay_2_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const r1 = await settle(db, f, { paymentId: firstPayId });
    expect(r1.status).toBe('settled');

    const r2 = await settle(db, f, { paymentId: secondPayId });
    expect(r2.status).toBe('duplicate_capture');
    expect(r2.payment_id).toBe(f.paymentRowId);

    const { rows: anomalies } = await db.query(
      "select * from private_payments.payment_anomalies where gateway_order_id = $1 and kind = 'DUPLICATE_CAPTURE'",
      [f.orderId]
    );
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].gateway_payment_id).toBe(secondPayId);
  });

  it('late payment on a locally-expired order still settles', async () => {
    const f = await order({ status: 'expired' });
    const r = await settle(db, f);
    expect(r.status).toBe('settled');
    expect((await payment(f)).status).toBe('captured');
    expect(await balance(f.userId)).toBe(50);
  });

  it('rolls back EVERYTHING when ledger insert fails; clean retry settles once', async () => {
    const f = await order();
    await db.query('BEGIN');
    await db.query(`create trigger fault before insert on public.credit_ledgers
                    for each row when (new.user_id = '${f.userId}') execute function test_fault.boom()`);
    await db.query('SAVEPOINT s');
    await expect(settle(db, f, { eventId: 'evt_1' })).rejects.toThrow('FAULT');
    await db.query('ROLLBACK TO SAVEPOINT s');
    expect((await payment(f)).status).toBe('created');
    expect(await balance(f.userId)).toBe(0);
    expect(await auditActions(f.paymentRowId)).toEqual([]);
    expect(await eventExists('evt_1')).toBe(false); // event row rolled back too → retry is processed
    await db.query('drop trigger fault on public.credit_ledgers');
    expect((await settle(db, f, { eventId: 'evt_1' })).status).toBe('settled');
    expect(await balance(f.userId)).toBe(50);
    await db.query('ROLLBACK');
  });

  it('50 concurrent settles on separate connections => exactly 1 settled, balance == credits once', async () => {
    const f = await order();
    const clients = await connect(50);
    const res = await Promise.all(clients.map((c) => settle(c, f)));
    expect(res.filter((r) => r.status === 'settled')).toHaveLength(1);
    expect(res.filter((r) => r.status === 'already_settled')).toHaveLength(49);
    expect(await balance(f.userId)).toBe(50);
  });
});
