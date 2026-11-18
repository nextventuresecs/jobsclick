import { randomInt, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Real local PostgreSQL only. The draft runs in a unique disposable schema;
// existing tables receive only this suite's synthetic fixtures. No hosted calls.
describe.runIf(process.env['RUN_LOCAL_SUPABASE'] === '1')('AUTH-01 provider identity claim', () => {
  const schema = `auth_claim_test_${randomUUID().replaceAll('-', '')}`;
  const applicationId = randomUUID();
  const providerId = randomUUID();
  const phone = `9${randomInt(100000000, 999999999)}`;
  const source = `auth-claim-${randomUUID()}`;
  const pool = new pg.Pool({ connectionString: process.env['DATABASE_URL'], max: 4 });
  const fixtureLock = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
  const draft = 'docs/db/drafts/auth-user-links.sql';
  let localTargetVerified = false;
  const providerIds = [providerId];
  const applicationIds = [applicationId];
  async function emailInvite() {
    const userId = randomUUID();
    const authId = randomUUID();
    const email = `claim-${userId}@example.invalid`;
    applicationIds.push(userId);
    providerIds.push(authId);
    await pool.query('insert into public.users (id,phone,email,role,status,source) values ($1,$2,$3,$4,$5,$6)',
      [userId, `8${randomInt(100000000, 999999999)}`, email, 'employer', 'invited', source]);
    await pool.query('insert into auth.users (id,email,email_confirmed_at) values ($1,$2,now())', [authId, email]);
    return { userId, authId, email };
  }

  beforeAll(async () => {
    const target = new URL(process.env['DATABASE_URL'] || '');
    if (process.env['NODE_ENV'] !== 'test' || target.hostname !== '127.0.0.1' || target.port !== process.env['JOBSCLICK_TEST_DB_PORT']) {
      throw new Error('AUTH_LOCAL_TEST_REQUIRES_LOCALHOST');
    }
    localTargetVerified = true;
    // Shared FK-fixture mutex; each concurrency test still uses independent connections.
    await fixtureLock.connect();
    await fixtureLock.query("select pg_advisory_lock(hashtextextended('auth-tests:auth-fk-ddl',0))");
    // Red phase: absent draft leaves the procedure absent, rather than failing
    // a module import before the missing behavior can be exercised.
    if (existsSync(draft)) await pool.query(readFileSync(draft, 'utf8').replaceAll('private_auth', schema));
    await pool.query('insert into public.users (id,phone,role,status,source) values ($1,$2,$3,$4,$5)',
      [applicationId, phone, 'job_seeker', 'invited', source]);
    await pool.query('insert into auth.users (id,phone,phone_confirmed_at) values ($1,$2,now())',
      [providerId, `91${phone}`]);
  });

  afterAll(async () => {
    if (!localTargetVerified) { await pool.end(); return; }
    try {
      // schema is generated locally from a constant prefix and UUID, never input.
      await pool.query(`drop schema if exists ${schema} cascade`);
      await pool.query('delete from auth.users where id=any($1::uuid[])', [providerIds]);
      await pool.query('delete from public.users where id=any($1::uuid[])', [applicationIds]);
    } finally { await Promise.all([pool.end(), fixtureLock.end()]); }
  });

  it('claims the invited UUID without activating it or changing role/source', async () => {
    const result = await pool.query(`select ${schema}.claim_invited_account($1) as user_id`, [providerId]);
    expect(result.rows).toEqual([{ user_id: applicationId }]);
    const user = await pool.query('select id,role,status,source from public.users where id=$1', [applicationId]);
    expect(user.rows).toEqual([{ id: applicationId, role: 'job_seeker', status: 'invited', source }]);
  });

  it('retries simultaneous first-login claims idempotently without duplicate mappings', async () => {
    await pool.query(`delete from ${schema}.auth_user_links where user_id=$1`, [applicationId]);
    const results = await Promise.all([
      pool.query(`select ${schema}.claim_invited_account($1) as user_id`, [providerId]),
      pool.query(`select ${schema}.claim_invited_account($1) as user_id`, [providerId]),
    ]);
    expect(results.map(result => result.rows)).toEqual([[{ user_id: applicationId }], [{ user_id: applicationId }]]);
    expect((await pool.query(`select count(*)::int as count from ${schema}.auth_user_links where user_id=$1`, [applicationId])).rows).toEqual([{ count: 1 }]);
  });

  it('claims by provider-confirmed email without treating an imported phone as verified', async () => {
    const { userId, authId } = await emailInvite();
    expect((await pool.query(`select ${schema}.claim_invited_account($1) as user_id`, [authId])).rows).toEqual([{ user_id: userId }]);
    expect((await pool.query('select status,email_verified_at from public.users where id=$1', [userId])).rows).toEqual([{ status: 'invited', email_verified_at: null }]);
  });

  it('rejects verified phone/email pointing to different accounts without linking either', async () => {
    const first = await emailInvite();
    const other = await emailInvite();
    const { rows } = await pool.query('select phone from public.users where id=$1', [other.userId]);
    await pool.query('update auth.users set phone=$1,phone_confirmed_at=now() where id=$2', [`91${rows[0].phone}`, first.authId]);
    await expect(pool.query(`select ${schema}.claim_invited_account($1)`, [first.authId])).rejects.toThrow('AUTH_IDENTITY_CONFLICT');
    expect((await pool.query(`select count(*)::int as count from ${schema}.auth_user_links where user_id=any($1::uuid[])`, [[first.userId, other.userId]])).rows).toEqual([{ count: 0 }]);
  });

  it('allows only one provider to reserve an invite during parallel phone/email claims', async () => {
    const invite = await emailInvite();
    const phoneAuthId = randomUUID();
    providerIds.push(phoneAuthId);
    const { rows } = await pool.query('select phone from public.users where id=$1', [invite.userId]);
    await pool.query('insert into auth.users (id,phone,phone_confirmed_at) values ($1,$2,now())', [phoneAuthId, `91${rows[0].phone}`]);
    const results = await Promise.allSettled([invite.authId, phoneAuthId].map(id => pool.query(`select ${schema}.claim_invited_account($1) as user_id`, [id])));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find(result => result.status === 'rejected');
    expect(failure?.status === 'rejected' && failure.reason.message).toBe('AUTH_IDENTITY_CONFLICT');
    expect((await pool.query(`select count(*)::int as count from ${schema}.auth_user_links where user_id=$1`, [invite.userId])).rows).toEqual([{ count: 1 }]);
  });

  it.each(['admin', 'msme_admin', 'intermediary'])('does not use bulk-invite claiming to acquire the %s role', async role => {
    const invite = await emailInvite();
    await pool.query('update public.users set role=$1 where id=$2', [role, invite.userId]);
    await expect(pool.query(`select ${schema}.claim_invited_account($1)`, [invite.authId])).rejects.toThrow('AUTH_INVITE_NOT_CLAIMABLE');
  });

  it('rejects an unconfirmed provider email even when it matches an invite', async () => {
    const invite = await emailInvite();
    await pool.query('update auth.users set email_confirmed_at=null where id=$1', [invite.authId]);
    await expect(pool.query(`select ${schema}.claim_invited_account($1)`, [invite.authId])).rejects.toThrow('AUTH_VERIFIED_CONTACT_REQUIRED');
  });

  it.each(['active', 'disabled'])('does not claim an unlinked %s account by matching email', async status => {
    const invite = await emailInvite();
    await pool.query('update public.users set status=$1 where id=$2', [status, invite.userId]);
    await expect(pool.query(`select ${schema}.claim_invited_account($1)`, [invite.authId])).rejects.toThrow('AUTH_INVITE_NOT_CLAIMABLE');
  });

  it('does not return a previously linked account after it is disabled', async () => {
    const invite = await emailInvite();
    await pool.query(`select ${schema}.claim_invited_account($1)`, [invite.authId]);
    await pool.query("update public.users set status='disabled' where id=$1", [invite.userId]);
    await expect(pool.query(`select ${schema}.claim_invited_account($1)`, [invite.authId])).rejects.toThrow('AUTH_INVITE_NOT_CLAIMABLE');
  });

  it('keeps the established mapping when a separate onboarding flow activates the account', async () => {
    const invite = await emailInvite();
    await pool.query(`select ${schema}.claim_invited_account($1)`, [invite.authId]);
    await pool.query("update public.users set status='active' where id=$1", [invite.userId]);
    expect((await pool.query(`select ${schema}.claim_invited_account($1) as user_id`, [invite.authId])).rows).toEqual([{ user_id: invite.userId }]);
  });

  it.each(['anon', 'authenticated'])('denies direct procedure and mapping access to %s', async role => {
    const client = await pool.connect();
    try {
      for (const sql of [`select ${schema}.claim_invited_account($1)`, `select user_id from ${schema}.auth_user_links where auth_user_id=$1`]) {
        await client.query('begin');
        await client.query(`set local role ${role}`);
        await expect(client.query(sql, [providerId])).rejects.toMatchObject({ code: '42501' });
        await client.query('rollback');
      }
    } finally { await client.query('rollback'); client.release(); }
  });

  it('allows backend execution without granting service_role writes or access to provider records', async () => {
    const invite = await emailInvite();
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('set local role service_role');
      expect((await client.query(`select ${schema}.claim_invited_account($1) as user_id`, [invite.authId])).rows).toEqual([{ user_id: invite.userId }]);
      expect((await client.query("select has_table_privilege(current_user,'auth.users','select') as provider_read, has_table_privilege(current_user,$1,'insert') as mapping_write", [`${schema}.auth_user_links`])).rows).toEqual([{ provider_read: false, mapping_write: false }]);
    } finally { await client.query('rollback'); client.release(); }
  });

  it('recovers after a transaction rolls back without deleting the provider identity', async () => {
    const invite = await emailInvite();
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`select ${schema}.claim_invited_account($1)`, [invite.authId]);
      await expect(client.query('select 1/0')).rejects.toMatchObject({ code: '22012' });
    } finally { await client.query('rollback'); client.release(); }
    expect((await pool.query(`select count(*)::int as count from ${schema}.auth_user_links where user_id=$1`, [invite.userId])).rows).toEqual([{ count: 0 }]);
    expect((await pool.query(`select ${schema}.claim_invited_account($1) as user_id`, [invite.authId])).rows).toEqual([{ user_id: invite.userId }]);
  });
});
