import { randomInt, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('WAL-05 native sponsorship payment transaction', () => {
  const db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
  beforeAll(async () => { await db.connect(); });
  afterAll(async () => { await db.end(); });
  async function fixture() {
    const owner = randomUUID(), student = randomUUID(), institution = randomUUID(), payment = randomUUID();
    for (const [id, role] of [[owner, 'intermediary'], [student, 'job_seeker']]) await db.query("insert into public.users(id,phone,role,status,source) values($1,$2,$3,'active','payment-transaction-fixture')", [id, '8' + randomInt(100000000, 999999999), role]);
    await db.query("insert into public.institution_profiles(id,user_id,institution_name,source) values($1,$2,'Fixture College','payment-transaction-fixture')", [institution, owner]);
    await db.query("insert into public.job_seeker_profiles(id,user_id,full_name,institution_id,is_sponsored,source) values($1,$2,'Fixture Student',$3,false,'payment-transaction-fixture')", [randomUUID(), student, institution]);
    const gateway = 'pay_' + randomUUID(), order = 'order_' + randomUUID();
    await db.query("insert into public.payments(id,user_id,gateway_order_id,gateway_payment_id,amount_inr,currency,status,metadata) values($1,$2,$3,$4,177,'INR','captured',$5)", [payment, owner, order, gateway, { purpose: 'sponsorship', institutionId: institution }]);
    return { owner, student, institution, payment, gateway, order, key: randomUUID() };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function activate(f: Fixture, reference = f.gateway, key = f.key, client = db) {
    await client.query('set role service_role');
    try { return (await client.query('select public.rpc_activate_sponsorship($1,$2,$3,$4,$5,$6) as result', [f.institution, f.owner, reference, key, null, false])).rows[0].result; } finally { await client.query('reset role'); }
  }
  async function unchanged(f: Fixture) {
    expect((await db.query('select is_sponsored from public.job_seeker_profiles where user_id=$1', [f.student])).rows).toEqual([{ is_sponsored: false }]);
    expect((await db.query('select count(*)::int as count from public.institution_sponsorships where institution_id=$1', [f.institution])).rows).toEqual([{ count: 0 }]);
    expect((await db.query('select count(*)::int as count from private_payments.payment_grants where payment_id=$1', [f.payment])).rows).toEqual([{ count: 0 }]);
    expect((await db.query("select count(*)::int as count from public.audit_logs where actor_id=$1 and action='INSTITUTION_SPONSORSHIP_ACTIVATED'", [f.owner])).rows).toEqual([{ count: 0 }]);
  }
  it('consumes the canonical payment once, returns exact retries, and rejects alternate-reference/new-key reuse', async () => {
    const f = await fixture(), first = await activate(f);
    expect(first).toMatchObject({ success: true, alreadyActive: false, sponsoredStudentsCount: 1 });
    expect(await activate(f, f.order)).toMatchObject({ sponsorshipId: first.sponsorshipId, alreadyActive: true });
    await expect(activate(f, f.payment, randomUUID())).rejects.toMatchObject({ message: 'SPONSORSHIP_PAYMENT_ALREADY_USED' });
    expect((await db.query('select count(*)::int as count from private_payments.payment_grants where payment_id=$1', [f.payment])).rows).toEqual([{ count: 1 }]);
  });
  it('serializes independent connections racing different requests for one payment', async () => {
    const f = await fixture(), second = new pg.Client({ connectionString: process.env['DATABASE_URL'] }); await second.connect();
    try {
      const result = await Promise.allSettled([activate(f), activate(f, f.payment, randomUUID(), second)]);
      expect(result.filter(value => value.status === 'fulfilled')).toHaveLength(1);
      expect(result.filter(value => value.status === 'rejected')).toHaveLength(1);
      expect((await db.query('select count(*)::int as count from public.institution_sponsorships where institution_id=$1', [f.institution])).rows).toEqual([{ count: 1 }]);
    } finally { await second.end(); }
  });
  it.each(['grant', 'audit'])('rolls back all writes on a %s failure and permits retry', async point => {
    const f = await fixture(), name = 'fault_' + randomUUID().replaceAll('-', '');
    await db.query(`create function test_support.${name}() returns trigger language plpgsql as $$begin raise exception 'fixture transaction fault'; end$$`);
    const table = point === 'grant' ? 'institution_sponsorships' : 'audit_logs';
    const condition = point === 'grant' ? `new.institution_id='${f.institution}'::uuid` : `new.actor_id='${f.owner}'::uuid and new.action='INSTITUTION_SPONSORSHIP_ACTIVATED'`;
    await db.query(`create trigger ${name} before insert on public.${table} for each row when (${condition}) execute function test_support.${name}()`);
    try { await expect(activate(f)).rejects.toMatchObject({ message: 'fixture transaction fault' }); await unchanged(f); }
    finally { await db.query(`drop trigger ${name} on public.${table}; drop function test_support.${name}()`); }
    expect(await activate(f)).toMatchObject({ success: true, alreadyActive: false });
  });
  it('rolls back an actually terminated backend before commit and permits the same payment to retry', async () => {
    const f = await fixture(), peer = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    peer.on('error', () => {}); await peer.connect();
    const pid = Number((await peer.query('select pg_backend_pid() as pid')).rows[0].pid);
    const lock = randomInt(1, 1000000000), name = 'crash_' + randomUUID().replaceAll('-', '');
    await db.query('select pg_advisory_lock($1)', [lock]);
    await db.query(`create function test_support.${name}() returns trigger language plpgsql as $$begin perform pg_advisory_xact_lock(${lock}); return new; end$$`);
    await db.query(`create trigger ${name} after update on public.job_seeker_profiles for each row when (new.user_id='${f.student}'::uuid) execute function test_support.${name}()`);
    try {
      const pending = activate(f, f.gateway, f.key, peer).then(() => false, () => true);
      let blocked = false;
      for (let attempt = 0; attempt < 80 && !blocked; attempt++) {
        blocked = Boolean((await db.query("select exists(select 1 from pg_stat_activity where pid=$1 and wait_event='advisory') as blocked", [pid])).rows[0].blocked);
        if (!blocked) await new Promise(resolve => setTimeout(resolve, 25));
      }
      expect(blocked).toBe(true); await unchanged(f);
      expect((await db.query('select pg_terminate_backend($1) as killed', [pid])).rows).toEqual([{ killed: true }]);
      expect(await pending).toBe(true); await unchanged(f);
    } finally {
      await db.query('select pg_advisory_unlock($1)', [lock]);
      await db.query(`drop trigger ${name} on public.job_seeker_profiles; drop function test_support.${name}()`);
      await peer.end();
    }
    expect(await activate(f)).toMatchObject({ success: true, alreadyActive: false });
  });
  it.each(['1', 'NaN'])('rejects invalid or insufficient captured money %s at the database boundary', async amount => {
    const f = await fixture(); await db.query('update public.payments set amount_inr=$2 where id=$1', [f.payment, amount]);
    await expect(activate(f)).rejects.toMatchObject({ message: 'SPONSORSHIP_PAYMENT_INSUFFICIENT' }); await unchanged(f);
  });
  it.each(['wallet', 'different-target', 'unbound'])('rejects a %s payment rather than double-granting another purpose', async kind => {
    const f = await fixture();
    await db.query('update public.payments set metadata=$2,credits_added=$3 where id=$1', [f.payment, kind === 'unbound' ? {} : { purpose: kind === 'wallet' ? 'wallet' : 'sponsorship', institutionId: randomUUID() }, kind === 'wallet' ? 50 : 0]);
    await expect(activate(f)).rejects.toMatchObject({ message: 'SPONSORSHIP_PAYMENT_PURPOSE_INVALID' }); await unchanged(f);
  });
  it('rejects cross-owner requests and disabled actors even on idempotent retries', async () => {
    const f = await fixture(); await activate(f);
    await db.query("update public.users set status='disabled' where id=$1", [f.owner]);
    await expect(activate(f)).rejects.toMatchObject({ message: 'SPONSORSHIP_ACTOR_DENIED' });
    await expect(activate({ ...f, owner: randomUUID() })).rejects.toMatchObject({ message: 'SPONSORSHIP_ACTOR_DENIED' });
  });
  it('denies client execution and direct service-role mutation of grant receipts', async () => {
    for (const role of ['anon', 'authenticated']) {
      expect((await db.query("select has_function_privilege($1,'public.rpc_activate_sponsorship(uuid,uuid,text,text,integer,boolean)','execute') as allowed", [role])).rows).toEqual([{ allowed: false }]);
    }
    expect((await db.query("select has_table_privilege('service_role','private_payments.payment_grants','insert') as allowed")).rows).toEqual([{ allowed: false }]);
  });
});
