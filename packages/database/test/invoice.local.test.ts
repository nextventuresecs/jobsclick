import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';

const DATABASE_URL =
  process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('pooler.supabase.com')
    ? process.env.DATABASE_URL
    : 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

interface PaymentFixture {
  id: string;
  userId: string;
  amountPaise: number;
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

async function createSettledPayment(overrides: {
  amountPaise?: number;
  billingStateCode?: string;
  billingGstin?: string;
} = {}): Promise<PaymentFixture> {
  const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const userRes = await db.query(
    "INSERT INTO public.users (phone, role, status) VALUES ($1, 'employer', 'active') RETURNING id",
    [phone]
  );
  const userId = userRes.rows[0].id;
  const orderId = `order_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const paymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const amountPaise = overrides.amountPaise ?? 59000;
  const billingStateCode = overrides.billingStateCode ?? '27';

  const payRes = await db.query(
    `INSERT INTO public.payments (
       user_id, gateway_order_id, gateway_payment_id, amount_paise, amount_inr, currency,
       purpose, credits_to_grant, billing_state_code, status, settled_at,
       order_snapshot
     ) VALUES ($1, $2, $3, $4, $5, 'INR', 'wallet', 50, $6, 'captured', now(), $7)
     RETURNING id`,
    [
      userId,
      orderId,
      paymentId,
      amountPaise,
      amountPaise / 100,
      billingStateCode,
      JSON.stringify({
        billingName: 'Acme Enterprises',
        billingGstin: overrides.billingGstin || null,
        billingStateCode,
        billingAddress: '123 Business Park, City',
        billingEmail: 'billing@acme.example.com',
      }),
    ]
  );

  return {
    id: payRes.rows[0].id,
    userId,
    amountPaise,
  };
}

describe('Invoices & Tax Calculation (WAL-03, Task 5)', () => {
  it('GSTIN checksum validation: valid vs invalid vs placeholder', async () => {
    // Valid GSTIN: 27AAPFU0939F1ZV
    const res1 = await db.query("SELECT private_payments.validate_gstin('27AAPFU0939F1ZV') as v");
    expect(res1.rows[0].v).toBe(true);

    // Invalid checksum (wrong check digit 'X')
    const res2 = await db.query("SELECT private_payments.validate_gstin('27AAPFU0939F1ZX') as v");
    expect(res2.rows[0].v).toBe(false);

    // Hardcoded placeholder: 23AAAAA0000A1Z5 must be rejected
    const res3 = await db.query("SELECT private_payments.validate_gstin('23AAAAA0000A1Z5') as v");
    expect(res3.rows[0].v).toBe(false);

    // Invalid format
    const res4 = await db.query("SELECT private_payments.validate_gstin('NOT_A_GSTIN') as v");
    expect(res4.rows[0].v).toBe(false);
  });

  it('Intra-state tax split (buyer 27 == supplier 27): 9% CGST + 9% SGST, 0 IGST; sums match total exactly', async () => {
    const pay = await createSettledPayment({ amountPaise: 59000, billingStateCode: '27' });

    const res = await db.query(
      "SELECT public.rpc_issue_invoice($1, 'invoice') as inv",
      [pay.id]
    );

    const inv = res.rows[0].inv;
    expect(inv.payment_id).toBe(pay.id);
    expect(inv.kind).toBe('invoice');
    expect(inv.number).toMatch(/^JC\/\d{4}\/\d{6}$/);

    // ₹590 total: Taxable = 50000, CGST = 4500, SGST = 4500, IGST = 0
    expect(Number(inv.total_paise)).toBe(59000);
    expect(Number(inv.taxable_paise)).toBe(50000);
    expect(Number(inv.cgst_paise)).toBe(4500);
    expect(Number(inv.sgst_paise)).toBe(4500);
    expect(Number(inv.igst_paise)).toBe(0);

    // Exact sum assertion
    const sum = Number(inv.taxable_paise) + Number(inv.cgst_paise) + Number(inv.sgst_paise) + Number(inv.igst_paise);
    expect(sum).toBe(Number(inv.total_paise));
  });

  it('Inter-state tax split (buyer 29 != supplier 27): 0 CGST + 0 SGST, 18% IGST; sums match total exactly', async () => {
    // Karnataka buyer (29) purchasing from Maharashtra supplier (27)
    const pay = await createSettledPayment({ amountPaise: 212400, billingStateCode: '29' });

    const res = await db.query(
      "SELECT public.rpc_issue_invoice($1, 'invoice') as inv",
      [pay.id]
    );

    const inv = res.rows[0].inv;
    expect(Number(inv.total_paise)).toBe(212400);

    // 212400 / 1.18 = 180000 taxable, 32400 IGST
    expect(Number(inv.taxable_paise)).toBe(180000);
    expect(Number(inv.cgst_paise)).toBe(0);
    expect(Number(inv.sgst_paise)).toBe(0);
    expect(Number(inv.igst_paise)).toBe(32400);

    const sum = Number(inv.taxable_paise) + Number(inv.cgst_paise) + Number(inv.sgst_paise) + Number(inv.igst_paise);
    expect(sum).toBe(Number(inv.total_paise));
  });

  it('Taxable + taxes sum to total exactly even with odd / fractional rounding', async () => {
    // Arbitrary odd paise amount: 10001 paise (₹100.01)
    const pay = await createSettledPayment({ amountPaise: 10001, billingStateCode: '27' });

    const res = await db.query(
      "SELECT public.rpc_issue_invoice($1, 'invoice') as inv",
      [pay.id]
    );

    const inv = res.rows[0].inv;
    const sum = Number(inv.taxable_paise) + Number(inv.cgst_paise) + Number(inv.sgst_paise) + Number(inv.igst_paise);
    expect(sum).toBe(10001);
  });

  it('Second issue for same payment & kind returns identical invoice row (idempotent)', async () => {
    const pay = await createSettledPayment({ amountPaise: 59000 });

    const res1 = await db.query("SELECT public.rpc_issue_invoice($1, 'invoice') as inv", [pay.id]);
    const inv1 = res1.rows[0].inv;

    const res2 = await db.query("SELECT public.rpc_issue_invoice($1, 'invoice') as inv", [pay.id]);
    const inv2 = res2.rows[0].inv;

    expect(inv1.id).toBe(inv2.id);
    expect(inv1.number).toBe(inv2.number);
    expect(inv1.issued_at).toBe(inv2.issued_at);

    // Verify only 1 invoice row exists in public.invoices
    const countRes = await db.query(
      "SELECT count(*) as c FROM public.invoices WHERE payment_id = $1 AND kind = 'invoice'",
      [pay.id]
    );
    expect(Number(countRes.rows[0].c)).toBe(1);
  });

  it('Sequential gapless numbers under 20 concurrent issues (no duplicate or gap)', async () => {
    // Create 20 separate settled payments
    const payments: PaymentFixture[] = [];
    for (let i = 0; i < 20; i++) {
      payments.push(await createSettledPayment({ amountPaise: 59000 }));
    }

    // Connect 20 clients
    const clients: pg.Client[] = [];
    for (let i = 0; i < 20; i++) {
      const c = new pg.Client({ connectionString: DATABASE_URL });
      await c.connect();
      clients.push(c);
      poolClients.push(c);
    }

    // Issue invoices concurrently
    const promises = payments.map((p, idx) =>
      clients[idx].query("SELECT public.rpc_issue_invoice($1, 'invoice') as inv", [p.id])
    );

    const results = await Promise.all(promises);
    const invoices = results.map((r) => r.rows[0].inv);

    expect(invoices).toHaveLength(20);

    // Extract sequence numbers from invoice format 'JC/YYZZ/NNNNNN'
    const seqNumbers = invoices.map((inv) => {
      const parts = inv.number.split('/');
      return parseInt(parts[2], 10);
    });

    // Check uniqueness (no duplicates)
    const uniqueSet = new Set(seqNumbers);
    expect(uniqueSet.size).toBe(20);

    // Check gapless: sorted sequence must have step of exactly 1
    seqNumbers.sort((a, b) => a - b);
    for (let i = 1; i < seqNumbers.length; i++) {
      expect(seqNumbers[i]).toBe(seqNumbers[i - 1] + 1);
    }
  });

  it('Rejection on invalid platform GSTIN', async () => {
    // Temporarily set invalid GSTIN in platform_settings
    await db.query(`
      UPDATE public.platform_settings
      SET value = jsonb_set(value, '{gstin}', '"23AAAAA0000A1Z5"')
      WHERE key = 'invoice_settings'
    `);

    const pay = await createSettledPayment({ amountPaise: 59000 });

    await expect(
      db.query("SELECT public.rpc_issue_invoice($1, 'invoice')", [pay.id])
    ).rejects.toThrow(/INVALID_PLATFORM_GSTIN/);

    // Restore valid GSTIN
    await db.query(`
      UPDATE public.platform_settings
      SET value = jsonb_set(value, '{gstin}', '"27AAPFU0939F1ZV"')
      WHERE key = 'invoice_settings'
    `);
  });
});
