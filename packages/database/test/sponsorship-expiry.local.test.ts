import { randomInt, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('F0-d WAL-05 actual application RPC sponsorship expiry', () => {
  const db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
  beforeAll(async () => { await db.connect(); });
  afterAll(async () => { await db.end(); });
  it.each(['expired', 'active', 'other-institution', 'missing-grant'])('checks the UUID-linked current grant for %s sponsorship', async state => {
    await db.query('BEGIN');
    try {
      const owner = randomUUID(), seeker = randomUUID(), institution = randomUUID(), other = randomUUID();
      for (const [id, role] of [[owner, 'intermediary'], [seeker, 'job_seeker']]) {
        await db.query("insert into public.users(id,phone,role,status,source) values($1,$2,$3,'active','f0-disposable')", [id, '8' + randomInt(100000000, 999999999), role]);
      }
      await db.query("insert into public.institution_profiles(id,user_id,institution_name,source,is_sponsorship_active,sponsorship_expires_at) values($1,$2,'Expiry Fixture','f0-disposable',true,now()+interval '1 day'),($3,$2,'Expiry Fixture','f0-disposable',true,now()+interval '1 day')", [institution, owner, other]);
      await db.query("insert into public.job_seeker_profiles(id,user_id,full_name,seeker_type,source,institution_id,is_sponsored) values($1,$2,'Expiry Fixture','student','f0-disposable',$3,true)", [randomUUID(), seeker, institution]);
      if (state !== 'missing-grant') await db.query("insert into public.institution_sponsorships(institution_id,status,started_at,expires_at) values($1,'active',now()-interval '2 days',now()+($2 || ' days')::interval)", [state === 'other-institution' ? other : institution, state === 'expired' ? '-1' : '1']);
      // The real users trigger already grants ten starter credits; do not grant them twice.
      expect(Number((await db.query('select sum(amount) as balance from public.credit_ledgers where user_id=$1', [seeker])).rows[0].balance)).toBe(10);
      await db.query('SET LOCAL ROLE service_role');
      const result = (await db.query("select public.deduct_application_credit_with_ledger($1,$2,'fixture',1) as result", [seeker, randomUUID()])).rows[0].result;
      expect(result.is_sponsored).toBe(state === 'active');
      if (state !== 'active') expect(result.remaining_balance).toBe(9);
    } finally { await db.query('ROLLBACK'); }
  });
});
