import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';

const DATABASE_URL =
  process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('pooler.supabase.com')
    ? process.env.DATABASE_URL
    : 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

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

async function createUser(status: 'invited' | 'active' = 'invited'): Promise<string> {
  const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const { rows } = await db.query(
    "INSERT INTO public.users (phone, role, status) VALUES ($1, 'job_seeker', $2) RETURNING id",
    [phone, status]
  );
  return rows[0].id;
}

async function balance(userId: string): Promise<number> {
  const { rows } = await db.query('select public.rpc_get_balance($1) as b', [userId]);
  return Number(rows[0].b);
}

async function charge(c: pg.Client, applicantId: string, jobId: string) {
  const { rows } = await c.query(
    'select public.rpc_charge_application($1, $2) as r',
    [applicantId, jobId]
  );
  return rows[0].r as { charged: boolean; sponsored: boolean; balance: number };
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

describe('credit-charge', () => {
  it('50 concurrent applications at balance=1 => exactly one succeeds, others INSUFFICIENT_CREDITS, balance never < 0', async () => {
    const applicantId = await createUser();
    // Grant exactly 1 credit
    await db.query(
      "INSERT INTO public.credit_ledgers (user_id, amount, reason, source) VALUES ($1, 1, 'test_recharge', 'test')",
      [applicantId]
    );
    expect(await balance(applicantId)).toBe(1);

    const clients = await connect(50);
    // 50 distinct job IDs so idempotency per (user, job) is not triggered; tests overdraft serialization
    const jobIds = Array.from({ length: 50 }, () => randomUUID());

    const results = await Promise.allSettled(
      clients.map((c, idx) => charge(c, applicantId, jobIds[idx]))
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(49);

    const successResult = (fulfilled[0] as PromiseFulfilledResult<{ charged: boolean; sponsored: boolean; balance: number }>).value;
    expect(successResult).toEqual({
      charged: true,
      sponsored: false,
      balance: 0,
    });

    for (const rej of rejected) {
      const err = (rej as PromiseRejectedResult).reason as Error;
      expect(err.message).toContain('INSUFFICIENT_CREDITS');
    }

    // Hard Invariant #7: dynamic balance is 0, never negative
    expect(await balance(applicantId)).toBe(0);
  });

  it('same (user, job) twice => one charge (idempotent), second returns charged:false', async () => {
    const applicantId = await createUser();
    await db.query(
      "INSERT INTO public.credit_ledgers (user_id, amount, reason, source) VALUES ($1, 10, 'test_recharge', 'test')",
      [applicantId]
    );

    const jobId = randomUUID();
    const first = await charge(db, applicantId, jobId);
    expect(first).toEqual({
      charged: true,
      sponsored: false,
      balance: 9,
    });
    expect(await balance(applicantId)).toBe(9);

    const second = await charge(db, applicantId, jobId);
    expect(second).toEqual({
      charged: false,
      sponsored: false,
      balance: 9,
    });
    expect(await balance(applicantId)).toBe(9);

    const { rows: ledgerRows } = await db.query(
      'SELECT count(*) as c FROM public.credit_ledgers WHERE user_id = $1 AND ref_id = $2',
      [applicantId, jobId]
    );
    expect(Number(ledgerRows[0].c)).toBe(1);
  });

  it('sponsored student (active unexpired grant) pays 0 and a zero-amount ledger row is written', async () => {
    const applicantId = await createUser();

    // Create an institution user and profile
    const instPhone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
    const { rows: instUserRows } = await db.query(
      "INSERT INTO public.users (phone, role, status) VALUES ($1, 'employer', 'active') RETURNING id",
      [instPhone]
    );
    const instUserId = instUserRows[0].id;

    const { rows: instProfileRows } = await db.query(
      `INSERT INTO public.institution_profiles (
         user_id, institution_name
       ) VALUES ($1, 'Test Institute') RETURNING id`,
      [instUserId]
    );
    const instProfileId = instProfileRows[0].id;

    // Create active sponsorship
    const { rows: spRows } = await db.query(
      `INSERT INTO public.institution_sponsorships (
         institution_id, tier, rate_per_student, status, started_at, expires_at, created_by
       ) VALUES ($1, 'gold', 100, 'active', now() - interval '1 day', now() + interval '30 days', $2)
       RETURNING id`,
      [instProfileId, instUserId]
    );
    const sponsorshipId = spRows[0].id;

    // Create profile linking applicant to active sponsorship
    await db.query(
      `INSERT INTO public.job_seeker_profiles (
         user_id, full_name, seeker_type, skills, preferred_categories, preferred_locations, languages,
         sponsorship_id
       ) VALUES ($1, 'Sponsored Student', 'fresher', '{}', '{}', '{}', '{}', $2)`,
      [applicantId, sponsorshipId]
    );

    const jobId = randomUUID();
    const res = await charge(db, applicantId, jobId);
    expect(res).toEqual({
      charged: false,
      sponsored: true,
      balance: 0,
    });

    const { rows: ledgerRows } = await db.query(
      'SELECT amount, reason, ref_id FROM public.credit_ledgers WHERE user_id = $1 AND ref_id = $2',
      [applicantId, jobId]
    );
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0]).toEqual({
      amount: 0,
      reason: 'application_sponsored',
      ref_id: jobId,
    });
    expect(await balance(applicantId)).toBe(0);
  });

  it('starter credit granted once even if called 20x concurrently', async () => {
    const applicantId = await createUser();
    const clients = await connect(20);

    await Promise.all(
      clients.map((c) =>
        c.query(
          `INSERT INTO public.credit_ledgers (user_id, amount, reason, source)
           VALUES ($1, 10, 'starter_credit', 'system')
           ON CONFLICT (user_id) WHERE reason = 'starter_credit' DO NOTHING`,
          [applicantId]
        )
      )
    );

    const { rows: countRows } = await db.query(
      "SELECT count(*) as c FROM public.credit_ledgers WHERE user_id = $1 AND reason = 'starter_credit'",
      [applicantId]
    );
    expect(Number(countRows[0].c)).toBe(1);
    expect(await balance(applicantId)).toBe(10);
  });

  it('rpc_get_balance == SUM(ledger) (Invariant #7); no stored balance column read', async () => {
    const applicantId = await createUser();
    expect(await balance(applicantId)).toBe(0);

    await db.query(
      `INSERT INTO public.credit_ledgers (user_id, amount, reason, source) VALUES
       ($1, 50, 'wallet_recharge', 'razorpay'),
       ($1, -5, 'application', 'system'),
       ($1, 20, 'wallet_recharge', 'razorpay'),
       ($1, -1, 'application', 'system')`,
      [applicantId]
    );

    const { rows: sumRows } = await db.query(
      'SELECT coalesce(sum(amount), 0) as s FROM public.credit_ledgers WHERE user_id = $1',
      [applicantId]
    );
    const directSum = Number(sumRows[0].s);

    const rpcBal = await balance(applicantId);
    expect(rpcBal).toBe(64);
    expect(rpcBal).toBe(directSum);

    // Verify users table has no 'balance' column
    const { rows: colRows } = await db.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' and table_name = 'users' and column_name = 'balance'"
    );
    expect(colRows).toHaveLength(0);
  });
});
