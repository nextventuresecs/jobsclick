import { randomInt, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('WAL-03/05 native capture and grant settlement', () => {
  const db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
  beforeAll(async () => { await db.connect(); }); afterAll(async () => { await db.end(); });
  async function fixture(purpose: 'wallet' | 'sponsorship' = 'wallet') {
    const owner = randomUUID(), institution = randomUUID(), student = randomUUID(), payment = randomUUID();
    for (const [id, role] of [[owner, 'intermediary'], [student, 'job_seeker']]) await db.query("insert into public.users(id,phone,role,status,source) values($1,$2,$3,'active','settlement-fixture')", [id, '8' + randomInt(100000000, 999999999), role]);
    await db.query("insert into public.institution_profiles(id,user_id,institution_name,source) values($1,$2,'Fixture College','settlement-fixture')", [institution, owner]);
    await db.query("insert into public.job_seeker_profiles(id,user_id,full_name,institution_id,is_sponsored,source) values($1,$2,'Fixture Student',$3,false,'settlement-fixture')", [randomUUID(), student, institution]);
    const order = 'order_' + randomUUID(), gateway = 'pay_' + randomUUID(), key = randomUUID();
    await db.query("insert into public.payments(id,user_id,gateway_order_id,amount_inr,currency,status,credits_added,pack_id,metadata) values($1,$2,$3,177,'INR','created',$4,$5,$6)", [payment, owner, order, purpose === 'wallet' ? 50 : 0, purpose === 'wallet' ? 'pack_starter' : null, { purpose, institutionId: institution, activationKey: key }]);
    // Coordinators do not receive job-seeker starter credits; seed a known existing balance.
    await db.query("insert into public.credit_ledgers(user_id,amount,reason) values($1,10,'settlement-existing-balance-fixture')", [owner]);
    return { owner, student, institution, payment, order, gateway, key };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function settle(f: Fixture, client = db, paise = 17700) {
    await client.query('set role service_role');
    try { return (await client.query('select public.rpc_settle_payment($1,$2,$3,$4,$5,$6,$7) as result', [f.order, f.gateway, paise, 'INR', 'INV-fixture-' + f.payment, null, 'razorpay_webhook'])).rows[0].result; }
    finally { await client.query('reset role'); }
  }
  it('commits captured status, one ledger grant and audits once across concurrent verified callbacks', async () => {
    const f = await fixture(), peer = new pg.Client({ connectionString: process.env['DATABASE_URL'] }); await peer.connect();
    try {
      const results = await Promise.all([settle(f), settle(f, peer)]);
      expect(results.map(result => result.alreadyProcessed).sort()).toEqual([false, true]);
      expect((await db.query("select count(*)::int as count from public.credit_ledgers where user_id=$1 and amount=50", [f.owner])).rows).toEqual([{ count: 1 }]);
      expect((await db.query("select count(*)::int as count from public.audit_logs where actor_id=$1 and action='PAYMENT_CAPTURED'", [f.owner])).rows).toEqual([{ count: 1 }]);
    } finally { await peer.end(); }
  });
  it.each(['ledger', 'audit'])('leaves the order retryable when %s insertion fails after capture verification', async point => {
    const f = await fixture(), name = 'settlement_' + randomUUID().replaceAll('-', '');
    await db.query(`create function test_support.${name}() returns trigger language plpgsql as $$begin raise exception 'fixture settlement fault'; end$$`);
    const table = point === 'ledger' ? 'credit_ledgers' : 'audit_logs';
    const condition = point === 'ledger' ? `new.user_id='${f.owner}'::uuid and new.amount=50` : `new.actor_id='${f.owner}'::uuid and new.action='PAYMENT_CAPTURED'`;
    await db.query(`create trigger ${name} before insert on public.${table} for each row when (${condition}) execute function test_support.${name}()`);
    try {
      await expect(settle(f)).rejects.toMatchObject({ message: 'fixture settlement fault' });
      expect((await db.query('select status,gateway_payment_id from public.payments where id=$1', [f.payment])).rows).toEqual([{ status: 'created', gateway_payment_id: null }]);
      expect((await db.query('select count(*)::int as count from private_payments.payment_grants where payment_id=$1', [f.payment])).rows).toEqual([{ count: 0 }]);
      expect((await db.query('select sum(amount)::int as balance from public.credit_ledgers where user_id=$1', [f.owner])).rows).toEqual([{ balance: 10 }]);
    } finally { await db.query(`drop trigger ${name} on public.${table}; drop function test_support.${name}()`); }
    expect(await settle(f)).toMatchObject({ alreadyProcessed: false, payment: { status: 'captured' } });
  });
  it('settles a bound sponsorship in the same transaction without also granting wallet credits', async () => {
    const f = await fixture('sponsorship'), result = await settle(f);
    expect(result).toMatchObject({ alreadyProcessed: false, sponsorship: { success: true, alreadyActive: false } });
    expect((await db.query('select is_sponsored from public.job_seeker_profiles where user_id=$1', [f.student])).rows).toEqual([{ is_sponsored: true }]);
    expect((await db.query('select sum(amount)::int as balance from public.credit_ledgers where user_id=$1', [f.owner])).rows).toEqual([{ balance: 10 }]);
    expect(await settle(f)).toMatchObject({ alreadyProcessed: true, sponsorship: { sponsorshipId: result.sponsorship.sponsorshipId } });
    await expect(db.query('select public.rpc_activate_sponsorship($1,$2,$3,$4)', [f.institution, f.owner, f.gateway, randomUUID()])).rejects.toMatchObject({ message: 'SPONSORSHIP_PAYMENT_ALREADY_USED' });
  });
  it('rejects mismatched verified amount and captured legacy rows without inventing a missing credit grant', async () => {
    const f = await fixture(); await expect(settle(f, db, 100)).rejects.toMatchObject({ message: 'PAYMENT_VERIFIED_FACTS_MISMATCH' });
    await db.query("update public.payments set status='captured',gateway_payment_id=$2 where id=$1", [f.payment, f.gateway]);
    await expect(settle(f)).rejects.toMatchObject({ message: 'PAYMENT_LEGACY_RECONCILIATION_REQUIRED' });
  });
});
