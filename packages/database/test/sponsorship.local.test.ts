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
  await db.query('ROLLBACK').catch(() => {});
  for (const c of poolClients) {
    await c.end().catch(() => {});
  }
  poolClients = [];
});

async function getClient(): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: DATABASE_URL });
  await c.connect();
  poolClients.push(c);
  return c;
}

interface InstitutionFixture {
  userId: string;
  institutionId: string;
}

async function createInstitution(ownerId?: string): Promise<InstitutionFixture> {
  let userId = ownerId;
  if (!userId) {
    const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
    const uRes = await db.query(
      "INSERT INTO public.users (phone, role, status) VALUES ($1, 'intermediary', 'active') RETURNING id",
      [phone],
    );
    userId = uRes.rows[0].id;
  }
  const instRes = await db.query(
    `INSERT INTO public.institution_profiles (user_id, institution_name, affiliation, city)
     VALUES ($1, 'Apex Engineering College', 'AICTE', 'New Delhi') RETURNING id`,
    [userId],
  );
  return {
    userId,
    institutionId: instRes.rows[0].id,
  };
}

interface SeekerFixture {
  userId: string;
  profileId: string;
}

async function createStudent(institutionId?: string, createdAt?: Date): Promise<SeekerFixture> {
  const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const uRes = await db.query(
    "INSERT INTO public.users (phone, role, status) VALUES ($1, 'job_seeker', 'active') RETURNING id",
    [phone],
  );
  const userId = uRes.rows[0].id;
  const pRes = await db.query(
    `INSERT INTO public.job_seeker_profiles (user_id, full_name, city, institution_id, created_at)
     VALUES ($1, 'Student Candidate', 'New Delhi', $2, $3) RETURNING id`,
    [userId, institutionId ?? null, createdAt ? createdAt.toISOString() : new Date().toISOString()],
  );
  return {
    userId,
    profileId: pRes.rows[0].id,
  };
}

async function createJob(): Promise<string> {
  const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const uRes = await db.query(
    "INSERT INTO public.users (phone, role, status) VALUES ($1, 'employer', 'active') RETURNING id",
    [phone],
  );
  const empId = uRes.rows[0].id;
  const jRes = await db.query(
    `INSERT INTO public.jobs (employer_id, title, description, city, category)
     VALUES ($1, 'Trainee Technician', 'Entry level technician', 'Delhi', 'manufacturing')
     RETURNING id`,
    [empId],
  );
  return jRes.rows[0].id;
}

interface SponsorshipOrderFixture {
  userId: string;
  institutionId: string;
  orderId: string;
  paymentId: string;
  amountPaise: number;
  paymentRowId: string;
  snapshot: Record<string, unknown>;
}

async function createSponsorshipOrder(params: {
  userId?: string;
  institutionId: string;
  studentCap?: number;
  ratePaise?: number;
  tier?: string;
  amountPaise?: number;
  termDays?: number;
}): Promise<SponsorshipOrderFixture> {
  let userId = params.userId;
  if (!userId) {
    const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
    const uRes = await db.query(
      "INSERT INTO public.users (phone, role, status) VALUES ($1, 'intermediary', 'active') RETURNING id",
      [phone],
    );
    userId = uRes.rows[0].id;
  }
  const orderId = `order_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const paymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const cap = params.studentCap ?? 2;
  const ratePaise = params.ratePaise ?? 15000;
  const subtotalPaise = cap * ratePaise;
  const gstPaise = Math.round((subtotalPaise * 18) / 100);
  const totalPaise = subtotalPaise + gstPaise;
  const amountPaise = params.amountPaise ?? totalPaise;

  const snapshot = {
    institutionId: params.institutionId,
    tier: params.tier ?? 'Small',
    ratePaise,
    studentCap: cap,
    subtotalPaise,
    gstPaise,
    totalPaise,
    termDays: params.termDays ?? 365,
    pricingVersion: '2026.1',
  };

  const payRes = await db.query(
    `INSERT INTO public.payments (
       user_id, gateway_order_id, amount_paise, amount_inr, currency, purpose,
       credits_to_grant, status, order_snapshot
     ) VALUES ($1, $2, $3, $4, 'INR', 'sponsorship', 0, 'created', $5) RETURNING id`,
    [userId, orderId, amountPaise, amountPaise / 100, JSON.stringify(snapshot)],
  );

  return {
    userId,
    institutionId: params.institutionId,
    orderId,
    paymentId,
    amountPaise,
    paymentRowId: payRes.rows[0].id,
    snapshot,
  };
}

describe('Sponsorship Settlement and Seat Capping (WAL-05, INT-05)', () => {
  it('settling a sponsorship order creates one grant with cap/tier/term from the snapshot and claims linked students oldest-first up to cap', async () => {
    const inst = await createInstitution();
    // 3 students linked to institution created on different days
    const s1 = await createStudent(inst.institutionId, new Date(Date.now() - 3 * 86400000));
    const s2 = await createStudent(inst.institutionId, new Date(Date.now() - 2 * 86400000));
    const s3 = await createStudent(inst.institutionId, new Date(Date.now() - 1 * 86400000));

    // Order with studentCap = 2
    const order = await createSponsorshipOrder({
      userId: inst.userId,
      institutionId: inst.institutionId,
      studentCap: 2,
    });

    const res = await db.query(
      'SELECT public.rpc_settle_payment($1, $2, $3, $4, $5, $6, $7) as r',
      [order.orderId, order.paymentId, order.amountPaise, 'INR', 'upi', null, 'webhook'],
    );
    expect(res.rows[0].r).toEqual({
      status: 'settled',
      payment_id: order.paymentRowId,
      purpose: 'sponsorship',
    });

    // Check institution_sponsorships row
    const grantRes = await db.query(
      'SELECT * FROM public.institution_sponsorships WHERE payment_id = $1',
      [order.paymentRowId],
    );
    expect(grantRes.rows).toHaveLength(1);
    const grant = grantRes.rows[0];
    expect(grant.institution_id).toBe(inst.institutionId);
    expect(grant.status).toBe('active');
    expect(grant.student_cap).toBe(2);
    expect(grant.seats_used).toBe(2);
    expect(grant.tier).toBe('Small');
    expect(grant.rate_paise).toBe(15000);

    // Check payment_grants row
    const pgRes = await db.query(
      'SELECT * FROM private_payments.payment_grants WHERE payment_id = $1',
      [order.paymentRowId],
    );
    expect(pgRes.rows).toHaveLength(1);
    expect(pgRes.rows[0].grant_type).toBe('sponsorship');
    expect(pgRes.rows[0].grant_ref).toBe(grant.id);

    // Oldest 2 students claimed (s1, s2), 3rd student unlinked (s3)
    const p1 = await db.query('SELECT sponsorship_id FROM public.job_seeker_profiles WHERE id = $1', [s1.profileId]);
    const p2 = await db.query('SELECT sponsorship_id FROM public.job_seeker_profiles WHERE id = $1', [s2.profileId]);
    const p3 = await db.query('SELECT sponsorship_id FROM public.job_seeker_profiles WHERE id = $1', [s3.profileId]);
    expect(p1.rows[0].sponsorship_id).toBe(grant.id);
    expect(p2.rows[0].sponsorship_id).toBe(grant.id);
    expect(p3.rows[0].sponsorship_id).toBeNull();

    // Audit logs recorded
    const auditRes = await db.query(
      "SELECT action, entity_type, entity_id FROM public.audit_logs WHERE entity_id = $1 OR entity_id = $2 ORDER BY created_at",
      [grant.id, order.paymentRowId],
    );
    const actions = auditRes.rows.map((r) => r.action);
    expect(actions).toContain('INSTITUTION_SPONSORSHIP_ACTIVATED');
    expect(actions).toContain('PAYMENT_CAPTURED');
  });

  it('amount_mismatch (1 paise vs snapshot total) => no grant, no seat claimed, payment stays created', async () => {
    const inst = await createInstitution();
    const s1 = await createStudent(inst.institutionId);
    const order = await createSponsorshipOrder({
      userId: inst.userId,
      institutionId: inst.institutionId,
      studentCap: 2,
    });

    // Mismatched amount: 1 paise more
    const res = await db.query(
      'SELECT public.rpc_settle_payment($1, $2, $3, $4, $5, $6, $7) as r',
      [order.orderId, order.paymentId, order.amountPaise + 1, 'INR', 'upi', null, 'webhook'],
    );
    expect(res.rows[0].r.status).toBe('amount_mismatch');

    // Payment stays created
    const payRes = await db.query('SELECT status FROM public.payments WHERE id = $1', [order.paymentRowId]);
    expect(payRes.rows[0].status).toBe('created');

    // No grant created
    const grantRes = await db.query('SELECT * FROM public.institution_sponsorships WHERE payment_id = $1', [order.paymentRowId]);
    expect(grantRes.rows).toHaveLength(0);

    // No seat claimed
    const p1 = await db.query('SELECT sponsorship_id FROM public.job_seeker_profiles WHERE id = $1', [s1.profileId]);
    expect(p1.rows[0].sponsorship_id).toBeNull();

    // Anomaly logged
    const anomRes = await db.query(
      "SELECT * FROM private_payments.payment_anomalies WHERE gateway_order_id = $1 AND kind = 'AMOUNT_MISMATCH'",
      [order.orderId],
    );
    expect(anomRes.rows).toHaveLength(1);
  });

  it('a wallet-purpose payment can never become a grant (payment_grants PK + purpose check)', async () => {
    // Settle a regular wallet payment
    const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
    const uRes = await db.query("INSERT INTO public.users (phone, role, status) VALUES ($1, 'employer', 'active') RETURNING id", [phone]);
    const userId = uRes.rows[0].id;
    const orderId = `order_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const payId = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const payRes = await db.query(
      `INSERT INTO public.payments (user_id, gateway_order_id, amount_paise, amount_inr, currency, purpose, credits_to_grant, status)
       VALUES ($1, $2, 59000, 590.00, 'INR', 'wallet', 50, 'created') RETURNING id`,
      [userId, orderId],
    );
    const paymentRowId = payRes.rows[0].id;

    await db.query(
      'SELECT public.rpc_settle_payment($1, $2, $3, $4, $5, $6, $7)',
      [orderId, payId, 59000, 'INR', 'upi', null, 'webhook'],
    );

    // Calling create_sponsorship_grant on a wallet payment must fail
    await expect(
      db.query(
        'SELECT private_payments.create_sponsorship_grant(p) FROM public.payments p WHERE id = $1',
        [paymentRowId],
      ),
    ).rejects.toThrow();

    // Still only the wallet grant exists
    const grantsRes = await db.query(
      'SELECT * FROM private_payments.payment_grants WHERE payment_id = $1',
      [paymentRowId],
    );
    expect(grantsRes.rows).toHaveLength(1);
    expect(grantsRes.rows[0].grant_type).toBe('wallet_credit');
  });

  it('settle again / replay => already_settled / duplicate_event; still exactly 1 grant', async () => {
    const inst = await createInstitution();
    const order = await createSponsorshipOrder({
      userId: inst.userId,
      institutionId: inst.institutionId,
      studentCap: 2,
    });

    const eventId = `evt_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    // First settle
    const res1 = await db.query(
      'SELECT public.rpc_settle_payment($1, $2, $3, $4, $5, $6, $7) as r',
      [order.orderId, order.paymentId, order.amountPaise, 'INR', 'upi', eventId, 'webhook'],
    );
    expect(res1.rows[0].r.status).toBe('settled');

    // Replay with same eventId => duplicate_event
    const res2 = await db.query(
      'SELECT public.rpc_settle_payment($1, $2, $3, $4, $5, $6, $7) as r',
      [order.orderId, order.paymentId, order.amountPaise, 'INR', 'upi', eventId, 'webhook'],
    );
    expect(res2.rows[0].r.status).toBe('duplicate_event');

    // Replay without eventId => already_settled
    const res3 = await db.query(
      'SELECT public.rpc_settle_payment($1, $2, $3, $4, $5, $6, $7) as r',
      [order.orderId, order.paymentId, order.amountPaise, 'INR', 'upi', null, 'webhook'],
    );
    expect(res3.rows[0].r.status).toBe('already_settled');

    // Exactly 1 grant
    const grantRes = await db.query('SELECT * FROM public.institution_sponsorships WHERE payment_id = $1', [order.paymentRowId]);
    expect(grantRes.rows).toHaveLength(1);
    const pgRes = await db.query('SELECT * FROM private_payments.payment_grants WHERE payment_id = $1', [order.paymentRowId]);
    expect(pgRes.rows).toHaveLength(1);
  });

  it('order whose snapshot institution is NOT owned by payment.user_id => SPONSORSHIP_PRECONDITION_FAILED anomaly, status stays created, no grant', async () => {
    const instA = await createInstitution();
    // Payment created by user B, but snapshot points to institution A
    const phoneB = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
    const uB = await db.query("INSERT INTO public.users (phone, role, status) VALUES ($1, 'intermediary', 'active') RETURNING id", [phoneB]);
    const attackerUserId = uB.rows[0].id;

    const order = await createSponsorshipOrder({
      userId: attackerUserId,
      institutionId: instA.institutionId, // Not owned by attackerUserId!
      studentCap: 2,
    });

    const res = await db.query(
      'SELECT public.rpc_settle_payment($1, $2, $3, $4, $5, $6, $7) as r',
      [order.orderId, order.paymentId, order.amountPaise, 'INR', 'upi', null, 'webhook'],
    );
    expect(res.rows[0].r.status).toBe('precondition_failed');

    // Status stays created
    const payRes = await db.query('SELECT status FROM public.payments WHERE id = $1', [order.paymentRowId]);
    expect(payRes.rows[0].status).toBe('created');

    // No grant
    const grantRes = await db.query('SELECT * FROM public.institution_sponsorships WHERE payment_id = $1', [order.paymentRowId]);
    expect(grantRes.rows).toHaveLength(0);

    // Anomaly logged
    const anomRes = await db.query(
      "SELECT * FROM private_payments.payment_anomalies WHERE gateway_order_id = $1 AND kind = 'SPONSORSHIP_PRECONDITION_FAILED'",
      [order.orderId],
    );
    expect(anomRes.rows).toHaveLength(1);
  });

  it('seat cap: cap=2, 5 students linked => rpc_claim_sponsorship_seats claims exactly 2; charging: 2 pay 0, 3 pay 1 credit', async () => {
    const inst = await createInstitution();
    const students = await Promise.all([
      createStudent(inst.institutionId),
      createStudent(inst.institutionId),
      createStudent(inst.institutionId),
      createStudent(inst.institutionId),
      createStudent(inst.institutionId),
    ]);

    // Create grant with cap=2 directly
    const order = await createSponsorshipOrder({
      userId: inst.userId,
      institutionId: inst.institutionId,
      studentCap: 2,
    });

    // Settle to activate grant
    await db.query(
      'SELECT public.rpc_settle_payment($1, $2, $3, $4, $5, $6, $7)',
      [order.orderId, order.paymentId, order.amountPaise, 'INR', 'upi', null, 'webhook'],
    );

    // Unset any sponsorship on the 5 students first to test rpc_claim_sponsorship_seats specifically
    await db.query('UPDATE public.job_seeker_profiles SET sponsorship_id = NULL WHERE institution_id = $1', [inst.institutionId]);
    await db.query('UPDATE public.institution_sponsorships SET seats_used = 0 WHERE institution_id = $1', [inst.institutionId]);

    const profileIds = students.map((s) => s.profileId);
    const claimRes = await db.query(
      'SELECT public.rpc_claim_sponsorship_seats($1, $2) as claimed',
      [inst.institutionId, profileIds],
    );
    expect(claimRes.rows[0].claimed).toBe(2);

    // Seats used is 2
    const gRes = await db.query('SELECT seats_used, student_cap FROM public.institution_sponsorships WHERE institution_id = $1', [inst.institutionId]);
    expect(gRes.rows[0].seats_used).toBe(2);

    // Give each student 5 starter credits
    for (const s of students) {
      await db.query(
        "INSERT INTO public.credit_ledgers (user_id, amount, reason, source) VALUES ($1, 5, 'starter_credit', 'system')",
        [s.userId],
      );
    }

    const jobId = await createJob();
    let sponsoredCount = 0;
    let chargedCount = 0;

    for (const s of students) {
      const balBefore = await db.query('SELECT coalesce(sum(amount), 0)::bigint as b FROM public.credit_ledgers WHERE user_id = $1', [s.userId]);
      const initial = Number(balBefore.rows[0].b);
      const chargeRes = await db.query(
        'SELECT public.rpc_charge_application($1, $2) as r',
        [s.userId, jobId],
      );
      const r = chargeRes.rows[0].r;
      if (r.sponsored === true && r.charged === false) {
        sponsoredCount++;
        expect(Number(r.balance)).toBe(initial);
      } else if (r.sponsored === false && r.charged === true) {
        chargedCount++;
        expect(Number(r.balance)).toBe(initial - 1);
      }
    }

    expect(sponsoredCount).toBe(2);
    expect(chargedCount).toBe(3);
  });

  it('claim is concurrency-safe: 20 parallel claims never push seats_used above cap', async () => {
    const inst = await createInstitution();
    // 25 students linked
    const students = await Promise.all(
      Array.from({ length: 25 }, () => createStudent(inst.institutionId)),
    );

    const order = await createSponsorshipOrder({
      userId: inst.userId,
      institutionId: inst.institutionId,
      studentCap: 5,
    });

    await db.query(
      'SELECT public.rpc_settle_payment($1, $2, $3, $4, $5, $6, $7)',
      [order.orderId, order.paymentId, order.amountPaise, 'INR', 'upi', null, 'webhook'],
    );

    // Reset students to unlinked to test concurrency of rpc_claim_sponsorship_seats
    await db.query('UPDATE public.job_seeker_profiles SET sponsorship_id = NULL WHERE institution_id = $1', [inst.institutionId]);
    await db.query('UPDATE public.institution_sponsorships SET seats_used = 0 WHERE institution_id = $1', [inst.institutionId]);

    // 20 concurrent claims
    const clients = await Promise.all(Array.from({ length: 20 }, () => getClient()));
    await Promise.all(
      clients.map((c) =>
        c.query('SELECT public.rpc_claim_sponsorship_seats($1, $2)', [
          inst.institutionId,
          students.map((s) => s.profileId),
        ]),
      ),
    );

    const grantRes = await db.query(
      'SELECT seats_used, student_cap FROM public.institution_sponsorships WHERE institution_id = $1',
      [inst.institutionId],
    );
    expect(grantRes.rows[0].seats_used).toBe(5);

    const claimedStudents = await db.query(
      'SELECT count(*) FROM public.job_seeker_profiles WHERE institution_id = $1 AND sponsorship_id IS NOT NULL',
      [inst.institutionId],
    );
    expect(parseInt(claimedStudents.rows[0].count, 10)).toBe(5);
  });

  it('expired grant: expires_at in the past => charge deducts 1 credit; grant flipped to expired on next settle/sweep', async () => {
    const inst = await createInstitution();
    const student = await createStudent(inst.institutionId);

    // Order 1 (will expire)
    const order1 = await createSponsorshipOrder({
      userId: inst.userId,
      institutionId: inst.institutionId,
      studentCap: 2,
    });
    await db.query(
      'SELECT public.rpc_settle_payment($1, $2, $3, $4, $5, $6, $7)',
      [order1.orderId, order1.paymentId, order1.amountPaise, 'INR', 'upi', null, 'webhook'],
    );

    // Manually push grant expires_at into the past
    await db.query(
      "UPDATE public.institution_sponsorships SET expires_at = now() - interval '1 day' WHERE payment_id = $1",
      [order1.paymentRowId],
    );

    // Give student 5 credits
    await db.query(
      "INSERT INTO public.credit_ledgers (user_id, amount, reason, source) VALUES ($1, 5, 'starter_credit', 'system')",
      [student.userId],
    );

    const balBefore = await db.query('SELECT coalesce(sum(amount), 0)::bigint as b FROM public.credit_ledgers WHERE user_id = $1', [student.userId]);
    const initial = Number(balBefore.rows[0].b);
    const jobId = await createJob();
    const chargeRes = await db.query(
      'SELECT public.rpc_charge_application($1, $2) as r',
      [student.userId, jobId],
    );
    // Charge deducts 1 credit because grant is expired
    expect(chargeRes.rows[0].r.charged).toBe(true);
    expect(chargeRes.rows[0].r.sponsored).toBe(false);
    expect(Number(chargeRes.rows[0].r.balance)).toBe(initial - 1);

    // Settle a new order for the same institution -> expires previous grant and creates new active
    const order2 = await createSponsorshipOrder({
      userId: inst.userId,
      institutionId: inst.institutionId,
      studentCap: 5,
    });
    const settle2 = await db.query(
      'SELECT public.rpc_settle_payment($1, $2, $3, $4, $5, $6, $7) as r',
      [order2.orderId, order2.paymentId, order2.amountPaise, 'INR', 'upi', null, 'webhook'],
    );
    expect(settle2.rows[0].r.status).toBe('settled');

    // Old grant is now status = 'expired'
    const oldGrant = await db.query(
      'SELECT status FROM public.institution_sponsorships WHERE payment_id = $1',
      [order1.paymentRowId],
    );
    expect(oldGrant.rows[0].status).toBe('expired');

    // New grant is status = 'active'
    const newGrant = await db.query(
      'SELECT status, student_cap FROM public.institution_sponsorships WHERE payment_id = $1',
      [order2.paymentRowId],
    );
    expect(newGrant.rows[0].status).toBe('active');
    expect(newGrant.rows[0].student_cap).toBe(5);
  });

  it('only one active grant per institution (partial unique index); API-level 409 covered in T4', async () => {
    const inst = await createInstitution();
    const order = await createSponsorshipOrder({
      userId: inst.userId,
      institutionId: inst.institutionId,
      studentCap: 2,
    });
    await db.query(
      'SELECT public.rpc_settle_payment($1, $2, $3, $4, $5, $6, $7)',
      [order.orderId, order.paymentId, order.amountPaise, 'INR', 'upi', null, 'webhook'],
    );

    // Attempting raw INSERT of another active grant raises unique violation
    await expect(
      db.query(
        `INSERT INTO public.institution_sponsorships (institution_id, status, started_at, expires_at, tier, rate_paise, student_cap, seats_used)
         VALUES ($1, 'active', now(), now() + interval '365 days', 'Small', 15000, 2, 0)`,
        [inst.institutionId],
      ),
    ).rejects.toThrow(/duplicate key value violates unique constraint "one_active_grant_per_institution"/);
  });

  it('as role authenticated/anon: INSERT/UPDATE of job_seeker_profiles.institution_id or sponsorship_id raises FORBIDDEN_COLUMN', async () => {
    const student = await createStudent();
    const dummyId = randomUUID();

    // Authenticated role
    await db.query('BEGIN');
    await db.query('SET LOCAL ROLE authenticated');
    await expect(
      db.query('UPDATE public.job_seeker_profiles SET sponsorship_id = $1 WHERE id = $2', [dummyId, student.profileId]),
    ).rejects.toThrow(/FORBIDDEN_COLUMN|permission denied/);
    await db.query('ROLLBACK');

    await db.query('BEGIN');
    await db.query('SET LOCAL ROLE authenticated');
    await expect(
      db.query('UPDATE public.job_seeker_profiles SET institution_id = $1 WHERE id = $2', [dummyId, student.profileId]),
    ).rejects.toThrow(/FORBIDDEN_COLUMN|permission denied/);
    await db.query('ROLLBACK');

    // Anon role
    await db.query('BEGIN');
    await db.query('SET LOCAL ROLE anon');
    await expect(
      db.query('UPDATE public.job_seeker_profiles SET sponsorship_id = $1 WHERE id = $2', [dummyId, student.profileId]),
    ).rejects.toThrow(/FORBIDDEN_COLUMN|permission denied/);
    await db.query('ROLLBACK');
  });

  it('free-text institution name no longer grants anything (is_sponsored boolean is not read by any RPC)', async () => {
    const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
    const uRes = await db.query(
      "INSERT INTO public.users (phone, role, status) VALUES ($1, 'job_seeker', 'active') RETURNING id",
      [phone],
    );
    const userId = uRes.rows[0].id;
    // Set is_sponsored = true and free-text institution = 'Delhi Technical University'
    await db.query(
      `INSERT INTO public.job_seeker_profiles (user_id, full_name, city, is_sponsored, institution, sponsorship_id)
       VALUES ($1, 'Legacy Seeker', 'Delhi', true, 'Delhi Technical University', NULL)`,
      [userId],
    );

    // Give 5 credits
    await db.query(
      "INSERT INTO public.credit_ledgers (user_id, amount, reason, source) VALUES ($1, 5, 'starter_credit', 'system')",
      [userId],
    );

    const balBefore = await db.query('SELECT coalesce(sum(amount), 0)::bigint as b FROM public.credit_ledgers WHERE user_id = $1', [userId]);
    const initial = Number(balBefore.rows[0].b);
    const jobId = await createJob();
    const chargeRes = await db.query(
      'SELECT public.rpc_charge_application($1, $2) as r',
      [userId, jobId],
    );
    // Must be charged 1 credit; is_sponsored is completely ignored
    expect(chargeRes.rows[0].r.charged).toBe(true);
    expect(chargeRes.rows[0].r.sponsored).toBe(false);
    expect(Number(chargeRes.rows[0].r.balance)).toBe(initial - 1);
  });
});
