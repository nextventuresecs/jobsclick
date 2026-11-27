import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@indian-job-portal/database';
import { ReconcileService } from '../src/payments/reconcile.processor.js';
import { ExpireOrdersService } from '../src/payments/expire-orders.processor.js';
import { InvoiceOutboxService } from '../src/payments/invoice-outbox.processor.js';
import { FakeRazorpayGateway } from '../src/payments/gateway.js';
import { WorkerEmailService } from '../src/email/email.service.js';
import { scheduleRepeatableJobs } from '../src/main.js';

const DATABASE_URL =
  process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('pooler.supabase.com')
    ? process.env.DATABASE_URL
    : 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const db = new pg.Client({ connectionString: DATABASE_URL });
let poolClients: pg.Client[] = [];

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'postgres';
const supabase = createClient<Database>(supabaseUrl, supabaseKey);

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

async function createCreatedPayment(overrides: {
  amountPaise?: number;
  credits?: number;
  ageMinutes?: number;
} = {}) {
  const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const userRes = await db.query(
    "INSERT INTO public.users (phone, role, status) VALUES ($1, 'employer', 'active') RETURNING id",
    [phone]
  );
  const userId = userRes.rows[0].id;
  const orderId = `order_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const amountPaise = overrides.amountPaise ?? 59000;
  const credits = overrides.credits ?? 50;
  const ageMinutes = overrides.ageMinutes ?? 20;

  const createdAt = new Date(Date.now() - ageMinutes * 60 * 1000).toISOString();

  const payRes = await db.query(
    `INSERT INTO public.payments (
       user_id, gateway_order_id, amount_paise, amount_inr, currency,
       purpose, credits_to_grant, status, created_at, billing_state_code, order_snapshot
     ) VALUES ($1, $2, $3, $4, 'INR', 'wallet', $5, 'created', $6, '27', $7)
     RETURNING id`,
    [
      userId,
      orderId,
      amountPaise,
      amountPaise / 100,
      credits,
      createdAt,
      JSON.stringify({
        billingName: 'Test Employer',
        billingEmail: 'employer@test.com',
      }),
    ]
  );

  return {
    id: payRes.rows[0].id,
    userId,
    orderId,
    amountPaise,
    credits,
    createdAt,
  };
}

async function balance(userId: string): Promise<number> {
  const res = await db.query('SELECT public.rpc_get_balance($1) as b', [userId]);
  return Number(res.rows[0].b);
}

describe('Payments Worker: Reconciliation, Expire & Outbox (WAL-03, Task 5)', () => {
  it('Reconciliation: Fake gateway captured -> settled once with source=reconcile', async () => {
    const pay = await createCreatedPayment({ ageMinutes: 20, credits: 50 });
    const gatewayPaymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const fakeGateway = new FakeRazorpayGateway();
    fakeGateway.seedOrder({
      id: pay.orderId,
      amountPaise: pay.amountPaise,
      receipt: 'rcpt_test',
      notes: {},
    });
    fakeGateway.seedPayment({
      id: gatewayPaymentId,
      orderId: pay.orderId,
      status: 'captured',
      amountPaise: pay.amountPaise,
      currency: 'INR',
      method: 'upi',
    });

    const reconcileService = new ReconcileService(supabase, fakeGateway);

    // Initial state: created, balance 0
    expect(await balance(pay.userId)).toBe(0);

    // Run reconciliation
    const result = await reconcileService.reconcileCreatedPayments({ minAgeMinutes: 15, maxAgeHours: 48 });

    expect(result.checked).toBeGreaterThanOrEqual(1);
    expect(result.settled).toBeGreaterThanOrEqual(1);

    // Payment settled
    const payRow = await db.query('SELECT status, gateway_payment_id FROM public.payments WHERE id = $1', [pay.id]);
    expect(payRow.rows[0].status).toBe('captured');
    expect(payRow.rows[0].gateway_payment_id).toBe(gatewayPaymentId);

    // Credits granted
    expect(await balance(pay.userId)).toBe(50);
  });

  it('Re-run reconciliation -> no-op (no duplicate settlement)', async () => {
    const pay = await createCreatedPayment({ ageMinutes: 25, credits: 50 });
    const gatewayPaymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const fakeGateway = new FakeRazorpayGateway();
    fakeGateway.seedPayment({
      id: gatewayPaymentId,
      orderId: pay.orderId,
      status: 'captured',
      amountPaise: pay.amountPaise,
      currency: 'INR',
      method: 'upi',
    });

    const reconcileService = new ReconcileService(supabase, fakeGateway);

    // First run settles
    await reconcileService.reconcileCreatedPayments({ minAgeMinutes: 15, maxAgeHours: 48 });
    expect(await balance(pay.userId)).toBe(50);

    // Re-run
    const result2 = await reconcileService.reconcileCreatedPayments({ minAgeMinutes: 15, maxAgeHours: 48 });
    expect(result2.settled).toBe(0);

    // Balance remains exactly 50
    expect(await balance(pay.userId)).toBe(50);
  });

  it('Webhook + reconcile race condition -> exactly one grant', async () => {
    const pay = await createCreatedPayment({ ageMinutes: 20, credits: 100 });
    const gatewayPaymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const client1 = new pg.Client({ connectionString: DATABASE_URL });
    const client2 = new pg.Client({ connectionString: DATABASE_URL });
    await client1.connect();
    await client2.connect();
    poolClients.push(client1, client2);

    const eventId = `evt_${randomUUID().replace(/-/g, '')}`;

    // Simultaneously trigger settlement from two connections (simulating webhook vs reconcile race)
    const task1 = client1.query(
      'SELECT public.rpc_settle_payment($1, $2, $3, $4, $5, $6, $7) as r',
      [pay.orderId, gatewayPaymentId, pay.amountPaise, 'INR', 'upi', eventId, 'webhook']
    );

    const task2 = client2.query(
      'SELECT public.rpc_settle_payment($1, $2, $3, $4, $5, $6, $7) as r',
      [pay.orderId, gatewayPaymentId, pay.amountPaise, 'INR', 'upi', null, 'reconcile']
    );

    const [res1, res2] = await Promise.all([task1, task2]);

    const statuses = [res1.rows[0].r.status, res2.rows[0].r.status];
    expect(statuses).toContain('settled');
    expect(statuses.some((s) => s === 'already_settled' || s === 'duplicate_event')).toBe(true);

    // Exactly 1 credit grant row in credit_ledgers
    const ledgerRows = await db.query(
      'SELECT * FROM public.credit_ledgers WHERE payment_id = $1',
      [pay.id]
    );
    expect(ledgerRows.rows.length).toBe(1);
    expect(ledgerRows.rows[0].amount).toBe(100);

    // Balance is 100 once
    expect(await balance(pay.userId)).toBe(100);
  });

  it('Expire orders: order created > 48h with no captured payment is marked expired', async () => {
    // Order created 50 hours ago
    const pay = await createCreatedPayment({ ageMinutes: 50 * 60, credits: 50 });

    const fakeGateway = new FakeRazorpayGateway();
    // Gateway has no captured payment for this order

    const expireService = new ExpireOrdersService(supabase, fakeGateway);
    const expiredCount = await expireService.expireOldCreatedOrders(48);

    expect(expiredCount).toBeGreaterThanOrEqual(1);

    const payRow = await db.query('SELECT status FROM public.payments WHERE id = $1', [pay.id]);
    expect(payRow.rows[0].status).toBe('expired');

    // Audit log records ORDER_EXPIRED
    const auditRes = await db.query(
      "SELECT * FROM public.audit_logs WHERE action = 'ORDER_EXPIRED' AND entity_id = $1",
      [pay.id]
    );
    expect(auditRes.rows.length).toBe(1);
  });

  it('Invoice outbox processing: issues invoice, renders PDF, updates outbox done_at', async () => {
    const pay = await createCreatedPayment({ ageMinutes: 20, credits: 50 });
    const gatewayPaymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    // Settle payment (inserts into private_payments.outbox)
    await db.query(
      'SELECT public.rpc_settle_payment($1, $2, $3, $4, $5, $6, $7)',
      [pay.orderId, gatewayPaymentId, pay.amountPaise, 'INR', 'upi', null, 'test']
    );

    // Fetch outbox entry
    const outboxRes = await db.query(
      "SELECT * FROM private_payments.outbox WHERE payment_id = $1 AND kind = 'issue_invoice'",
      [pay.id]
    );
    expect(outboxRes.rows.length).toBe(1);
    const outboxEntry = outboxRes.rows[0];

    const emailService = new WorkerEmailService();
    const invoiceOutboxService = new InvoiceOutboxService(supabase, emailService);

    const success = await invoiceOutboxService.processOutboxEntry(outboxEntry);
    expect(success).toBe(true);

    // Verify invoice row was created in public.invoices
    const invRes = await db.query(
      "SELECT * FROM public.invoices WHERE payment_id = $1 AND kind = 'invoice'",
      [pay.id]
    );
    expect(invRes.rows.length).toBe(1);
    const invoice = invRes.rows[0];
    expect(invoice.number).toMatch(/^JC\/\d{4}\/\d{6}$/);
    expect(invoice.pdf_path).toBe(`invoices/${invoice.id}.pdf`);

    // Verify outbox entry is marked done
    const updatedOutbox = await db.query(
      'SELECT done_at FROM private_payments.outbox WHERE id = $1',
      [outboxEntry.id]
    );
    expect(updatedOutbox.rows[0].done_at).not.toBeNull();
  });

  it('scheduleRepeatableJobs: registers periodic reconcile, expire, and outbox jobs with correct intervals', async () => {
    const addCalls: Array<{ name: string; data: unknown; opts: unknown }> = [];
    const schedulerCalls: Array<{ id: string; repeat: unknown; template: unknown }> = [];

    const mockQueue = {
      add: async (name: string, data: unknown, opts: unknown) => {
        addCalls.push({ name, data, opts });
        return {};
      },
      upsertJobScheduler: async (id: string, repeat: unknown, template: unknown) => {
        schedulerCalls.push({ id, repeat, template });
        return {};
      },
    };

    const mockRegistry = {
      reconcileQueue: mockQueue,
      expireQueue: mockQueue,
      invoiceOutboxQueue: mockQueue,
    } as unknown as Parameters<typeof scheduleRepeatableJobs>[0];

    await scheduleRepeatableJobs(mockRegistry);

    // Verify add calls match reviewer requirements exactly
    expect(addCalls).toHaveLength(3);
    expect(addCalls[0]).toEqual({
      name: 'reconcile-periodic',
      data: {},
      opts: { repeat: { every: 10 * 60 * 1000 }, jobId: 'reconcile-periodic' },
    });
    expect(addCalls[1]).toEqual({
      name: 'expire-periodic',
      data: { olderThanHours: 48 },
      opts: { repeat: { every: 60 * 60 * 1000 }, jobId: 'expire-periodic' },
    });
    expect(addCalls[2]).toEqual({
      name: 'outbox-periodic',
      data: { batchLimit: 20 },
      opts: { repeat: { every: 60 * 1000 }, jobId: 'outbox-periodic' },
    });

    // Verify BullMQ v6 scheduler calls
    expect(schedulerCalls).toHaveLength(3);
    expect(schedulerCalls[0].repeat).toEqual({ every: 10 * 60 * 1000 });
    expect(schedulerCalls[1].repeat).toEqual({ every: 60 * 60 * 1000 });
    expect(schedulerCalls[2].repeat).toEqual({ every: 60 * 1000 });
  });
});
