import { AUTH_M1_MIGRATION, AUTH_M2_MIGRATION, AUTH_M2_ROLLBACK } from './auth-migration-artifacts.js';
import { randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe.runIf(process.env['RUN_LOCAL_SUPABASE'] === '1')('AUTH-01 v2.1 atomic invite claims', () => {
  const schema = `auth_claim_v21_${randomUUID().replaceAll('-', '')}`;
  const config = { connectionString: process.env['DATABASE_URL'] };
  const database = new pg.Client(config);
  const providerIds: string[] = [];
  let safe = false;
  const render = (sql: string) => sql.replaceAll('public.users', `${schema}.users`).replaceAll('public.audit_logs', `${schema}.audit_logs`).replaceAll('public.rpc_claim_invited_account', `${schema}.rpc_claim_invited_account`).replaceAll('private_auth', schema);
  async function fixture() {
    const id = randomUUID();
    const authId = randomUUID();
    const phone = `8${randomInt(100000000, 999999999)}`;
    providerIds.push(authId);
    await database.query(`insert into ${schema}.users(id,phone,role,status,source) values($1,$2,'employer','invited','synthetic-v21')`, [id, phone]);
    await database.query('insert into auth.users(id,phone,phone_confirmed_at,raw_app_meta_data) values($1,$2,now(),$3)', [authId, `91${phone}`, { provider: 'phone', providers: ['phone'] }]);
    return { id, authId, phone };
  }
  beforeAll(async () => {
    const target = new URL(config.connectionString || '');
    if (process.env['NODE_ENV'] !== 'test' || target.hostname !== '127.0.0.1' || target.port !== process.env['JOBSCLICK_TEST_DB_PORT']) throw new Error('LOCAL_TEST_ONLY');
    safe = true;
    await database.connect();
    // FK teardown locks auth.users; isolate fixture DDL across suites, not claim clients.
    await database.query("select pg_advisory_lock(hashtextextended('auth-tests:auth-fk-ddl',0))");
    await database.query(`create schema ${schema}; create table ${schema}.users(like public.users including all); create table ${schema}.audit_logs(like public.audit_logs including all); alter table ${schema}.audit_logs enable row level security`);
    await database.query(`alter table ${schema}.users drop constraint if exists users_contact_required_v21, drop constraint if exists users_email_canonical_v21, drop constraint if exists users_pending_email_canonical_v21;`);
    await database.query(render(readFileSync(AUTH_M1_MIGRATION, 'utf8')));
    await database.query(render(readFileSync(AUTH_M2_MIGRATION, 'utf8')));
  });
  afterAll(async () => {
    try {
      if (safe) {
        await database.query(`drop schema if exists ${schema} cascade`);
        await database.query('delete from auth.users where id=any($1::uuid[])', [providerIds]);
      }
    } finally { await database.end(); }
  });

  it('does not lock an Auth-managed row while claiming its invited application record', async () => {
    const record = await fixture();
    const blocker = new pg.Client(config);
    const claimer = new pg.Client(config);
    try {
      await blocker.connect();
      await claimer.connect();
      await blocker.query('begin');
      await blocker.query('select id from auth.users where id=$1 for no key update', [record.authId]);
      await claimer.query("set statement_timeout='1500ms'");
      const result = await claimer.query(`select ${schema}.rpc_claim_invited_account($1,$2) as result`, [record.authId, randomUUID()]);
      expect(result.rows[0].result.user_id).toBe(record.id);
    } finally {
      await blocker.query('rollback');
      await Promise.all([blocker.end(), claimer.end()]);
    }
  });

  it('audits both the first claim and idempotent retry without recording contacts or credentials', async () => {
    const record = await fixture();
    const requests = [randomUUID(), randomUUID()];
    for (const request of requests) await database.query(`select ${schema}.rpc_claim_invited_account($1,$2)`, [record.authId, request]);
    const { rows } = await database.query(`select actor_id,meta from ${schema}.audit_logs where meta->>'request_id'=any($1::text[]) order by created_at,id`, [requests]);
    expect(rows).toHaveLength(2);
    expect(rows.map(row => row.meta.outcome).sort()).toEqual(['retry', 'success']);
    for (const row of rows) {
      expect(row.actor_id).toBe(record.id);
      expect(Object.keys(row.meta).sort()).toEqual(['claim_method', 'outcome', 'reason', 'request_id']);
      expect(JSON.stringify(row.meta)).not.toContain(record.phone);
    }
  });

  it.each(['unverified', 'banned', 'deleted', 'anonymous'])('commits a rejection audit for a %s provider identity without acquiring its invite', async state => {
    const record = await fixture();
    const change = {
      unverified: 'phone_confirmed_at=null', banned: "banned_until=now()+interval '1 hour'",
      deleted: 'deleted_at=now()', anonymous: 'is_anonymous=true',
    }[state];
    await database.query(`update auth.users set ${change} where id=$1`, [record.authId]);
    const request = randomUUID();
    const result = await database.query(`select ${schema}.rpc_claim_invited_account($1,$2) as result`, [record.authId, request]);
    expect(result.rows[0].result).toEqual({ outcome: 'rejected', code: state === 'unverified' ? 'AUTH_VERIFIED_CONTACT_REQUIRED' : 'AUTH_PROVIDER_USER_INVALID' });
    const audit = await database.query(`select actor_id,meta->>'outcome' as outcome from ${schema}.audit_logs where meta->>'request_id'=$1`, [request]);
    expect(audit.rows).toEqual([{ actor_id: null, outcome: 'rejected' }]);
    expect((await database.query(`select count(*)::int as count from ${schema}.auth_user_links where user_id=$1`, [record.id])).rows).toEqual([{ count: 0 }]);
  });

  it.each(['active', 'disabled', 'admin', 'msme_admin', 'intermediary'])('audits the rejected %s account without using the matched victim as actor', async state => {
    const record = await fixture();
    const column = ['active', 'disabled'].includes(state) ? 'status' : 'role';
    await database.query(`update ${schema}.users set ${column}=$1 where id=$2`, [state, record.id]);
    const request = randomUUID();
    const result = await database.query(`select ${schema}.rpc_claim_invited_account($1,$2) as result`, [record.authId, request]);
    expect(result.rows[0].result).toEqual({ outcome: 'rejected', code: 'AUTH_INVITE_NOT_CLAIMABLE' });
    expect((await database.query(`select actor_id from ${schema}.audit_logs where meta->>'request_id'=$1`, [request])).rows).toEqual([{ actor_id: null }]);
  });

  it('does not accept a retry after the linked account is disabled', async () => {
    const record = await fixture();
    await database.query(`select ${schema}.rpc_claim_invited_account($1,$2)`, [record.authId, randomUUID()]);
    await database.query(`update ${schema}.users set status='disabled' where id=$1`, [record.id]);
    const result = await database.query(`select ${schema}.rpc_claim_invited_account($1,$2) as result`, [record.authId, randomUUID()]);
    expect(result.rows[0].result).toEqual({ outcome: 'rejected', code: 'AUTH_ACCOUNT_DISABLED' });
  });

  it('rolls back the new mapping if its success audit cannot be committed', async () => {
    const record = await fixture();
    await database.query('begin');
    try {
      await database.query(`create function ${schema}.reject_audit() returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC_AUDIT_FAILURE'; end;$$;
        create trigger reject_audit before insert on ${schema}.audit_logs for each row execute function ${schema}.reject_audit()`);
      await expect(database.query(`select ${schema}.rpc_claim_invited_account($1,$2)`, [record.authId, randomUUID()])).rejects.toThrow('SYNTHETIC_AUDIT_FAILURE');
    } finally { await database.query('rollback'); }
    expect((await database.query(`select count(*)::int as count from ${schema}.auth_user_links where user_id=$1`, [record.id])).rows).toEqual([{ count: 0 }]);
    expect((await database.query(`select ${schema}.rpc_claim_invited_account($1,$2) as result`, [record.authId, randomUUID()])).rows[0].result.outcome).toBe('success');
  });

  it('serializes same-provider claims and records one success plus one retry', async () => {
    const record = await fixture();
    const clients = [new pg.Client(config), new pg.Client(config)];
    try {
      const results = await Promise.all(clients.map(async client => {
        await client.connect();
        return client.query(`select ${schema}.rpc_claim_invited_account($1,$2) as result`, [record.authId, randomUUID()]);
      }));
      expect(results.map(result => result.rows[0].result.outcome).sort()).toEqual(['retry', 'success']);
      expect((await database.query(`select count(*)::int as count from ${schema}.auth_user_links where user_id=$1`, [record.id])).rows).toEqual([{ count: 1 }]);
    } finally { await Promise.all(clients.map(client => client.end())); }
  });

  it('revalidates the invited contact after waiting for an application row update', async () => {
    const record = await fixture();
    const blocker = new pg.Client(config);
    const claimer = new pg.Client(config);
    let pending: Promise<pg.QueryResult | Error> | undefined;
    try {
      await blocker.connect(); await claimer.connect();
      await blocker.query('begin');
      await blocker.query(`update ${schema}.users set phone=$1 where id=$2`, [`7${randomInt(100000000, 999999999)}`, record.id]);
      const pid = (await claimer.query('select pg_backend_pid() as pid')).rows[0].pid;
      await claimer.query("set statement_timeout='5s'");
      pending = claimer.query(`select ${schema}.rpc_claim_invited_account($1,$2) as result`, [record.authId, randomUUID()]).catch((error: Error) => error);
      let blocked = false;
      const deadline = Date.now() + 2000;
      while (!blocked && Date.now() < deadline) {
        blocked = (await database.query('select cardinality(pg_blocking_pids($1))>0 as blocked', [pid])).rows[0].blocked;
        if (!blocked) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
      await blocker.query('commit');
      const result = await pending;
      if (result instanceof Error) throw result;
      expect(result.rows[0].result).toEqual({ outcome: 'rejected', code: 'AUTH_INVITE_NOT_CLAIMABLE' });
    } finally {
      await blocker.query('rollback');
      if (pending) await pending;
      await Promise.all([blocker.end(), claimer.end()]);
    }
  });

  it.each([
    ['first', 'banned'], ['retry', 'banned'], ['first', 'unverified'], ['retry', 'unverified'],
    ['first', 'changed-contact'], ['retry', 'changed-contact'],
    ['first', 'changed-provider'], ['retry', 'changed-provider'],
  ])('revalidates provider proof after the application lock on %s claim: %s', async (attempt, state) => {
    const record = await fixture();
    if (attempt === 'retry') await database.query(`select ${schema}.rpc_claim_invited_account($1,$2)`, [record.authId, randomUUID()]);
    const blocker = new pg.Client(config);
    const claimer = new pg.Client(config);
    let pending: Promise<pg.QueryResult | Error> | undefined;
    const requestId = randomUUID();
    try {
      await blocker.connect(); await claimer.connect();
      await blocker.query('begin');
      await blocker.query(`select id from ${schema}.users where id=$1 for update`, [record.id]);
      const pid = (await claimer.query('select pg_backend_pid() as pid')).rows[0].pid;
      await claimer.query("set statement_timeout='5s'");
      pending = claimer.query(`select ${schema}.rpc_claim_invited_account($1,$2) as result`, [record.authId, requestId]).catch((error: Error) => error);
      let blocked = false;
      const deadline = Date.now() + 2000;
      while (!blocked && Date.now() < deadline) {
        blocked = (await database.query('select cardinality(pg_blocking_pids($1))>0 as blocked', [pid])).rows[0].blocked;
        if (!blocked) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
      if (state === 'banned') await database.query("update auth.users set banned_until=now()+interval '1 hour' where id=$1", [record.authId]);
      else if (state === 'unverified') await database.query('update auth.users set phone_confirmed_at=null where id=$1', [record.authId]);
      else if (state === 'changed-provider') await database.query('update auth.users set raw_app_meta_data=$1 where id=$2', [{ provider: 'saml:unapproved' }, record.authId]);
      else await database.query('update auth.users set phone=$1 where id=$2', [`917${randomInt(100000000, 999999999)}`, record.authId]);
      await blocker.query('commit');
      const result = await pending;
      if (result instanceof Error) throw result;
      expect(result.rows[0].result).toEqual({ outcome: 'rejected', code: state === 'unverified' ? 'AUTH_VERIFIED_CONTACT_REQUIRED' : 'AUTH_PROVIDER_USER_INVALID' });
      expect((await database.query(`select meta->>'outcome' as outcome from ${schema}.audit_logs where meta->>'request_id'=$1`, [requestId])).rows).toEqual([{ outcome: 'rejected' }]);
      expect((await database.query(`select count(*)::int as count from ${schema}.auth_user_links where user_id=$1`, [record.id])).rows[0].count).toBe(attempt === 'retry' ? 1 : 0);
    } finally {
      await blocker.query('rollback');
      if (pending) await pending;
      await Promise.all([blocker.end(), claimer.end()]);
    }
  });

  it('refuses snapshot isolation that prevents post-lock provider revalidation', async () => {
    const record = await fixture();
    await database.query('begin isolation level repeatable read');
    try {
      await expect(database.query(`select ${schema}.rpc_claim_invited_account($1,$2)`, [record.authId, randomUUID()]))
        .rejects.toThrow('AUTH_CLAIM_READ_COMMITTED_REQUIRED');
    } finally { await database.query('rollback'); }
  });

  it.each(['anon', 'authenticated'])('denies direct RPC, private claim and audit-helper access to %s', async role => {
    await database.query('begin');
    try {
      for (const fn of [`${schema}.rpc_claim_invited_account($1,$2)`, `${schema}.claim_invited_account($1,$2)`, `${schema}.finish_invite_claim_v21($2,$1,'AUTH_INVITE_CLAIMED','phone')`]) {
        await database.query('savepoint role_attempt');
        await database.query(`set local role ${role}`);
        await expect(database.query(`select ${fn}`, [randomUUID(), randomUUID()])).rejects.toMatchObject({ code: '42501' });
        await database.query('rollback to role_attempt');
      }
    } finally { await database.query('rollback'); }
  });

  it('allows service RPC but not direct audit fabrication', async () => {
    const record = await fixture();
    await database.query('begin');
    try {
      await database.query('set local role service_role');
      expect((await database.query(`select ${schema}.rpc_claim_invited_account($1,$2) as result`, [record.authId, randomUUID()])).rows[0].result.user_id).toBe(record.id);
      await expect(database.query(`select ${schema}.finish_invite_claim_v21($1,$2,'AUTH_INVITE_CLAIMED','phone')`, [randomUUID(), record.id])).rejects.toMatchObject({ code: '42501' });
    } finally { await database.query('rollback'); }
  });

  it('reserves an email-only invite without activation or a fabricated phone', async () => {
    const record = await fixture();
    const email = `email-${record.id}@example.invalid`;
    await database.query(`update ${schema}.users set phone=null,email=$1 where id=$2`, [email, record.id]);
    await database.query('update auth.users set phone=null,phone_confirmed_at=null,email=$1,email_confirmed_at=now() where id=$2', [email, record.authId]);
    const result = await database.query(`select ${schema}.rpc_claim_invited_account($1,$2) as result`, [record.authId, randomUUID()]);
    expect(result.rows[0].result.user_id).toBe(record.id);
    expect((await database.query(`select phone,status,source from ${schema}.users where id=$1`, [record.id])).rows).toEqual([{ phone: null, status: 'invited', source: 'synthetic-v21' }]);
  });

  it('rejects a second independent provider instead of merging it into an already claimed account', async () => {
    const record = await fixture();
    const email = `other-${record.id}@example.invalid`;
    await database.query(`update ${schema}.users set email=$1 where id=$2`, [email, record.id]);
    await database.query(`select ${schema}.rpc_claim_invited_account($1,$2)`, [record.authId, randomUUID()]);
    const otherId = randomUUID(); providerIds.push(otherId);
    await database.query('insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,$2,now(),$3)', [otherId, email, { provider: 'email', providers: ['email'] }]);
    const result = await database.query(`select ${schema}.rpc_claim_invited_account($1,$2) as result`, [otherId, randomUUID()]);
    expect(result.rows[0].result).toEqual({ outcome: 'rejected', code: 'AUTH_IDENTITY_CONFLICT' });
  });

  it('retains mapping and audit evidence when a destructive rollback is refused', async () => {
    const record = await fixture();
    await database.query(`select ${schema}.rpc_claim_invited_account($1,$2)`, [record.authId, randomUUID()]);
    await database.query('begin');
    try {
      const down = render(readFileSync(AUTH_M2_ROLLBACK, 'utf8')).replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '');
      await expect(database.query(down)).rejects.toThrow('AUTH_IDENTITY_ROLLBACK_REQUIRES_FORWARD_RECOVERY');
    } finally { await database.query('rollback'); }
    expect((await database.query(`select user_id from ${schema}.auth_user_links where auth_user_id=$1`, [record.authId])).rows).toEqual([{ user_id: record.id }]);
  });

  it('passes six pgTAP role/input assertions without persisting the extension', async () => {
    await database.query('begin');
    try {
      await database.query("select pg_advisory_xact_lock(hashtextextended('auth-tests:pgtap-extension',0))");
      await database.query('create extension pgtap with schema extensions');
      await database.query('set local search_path=extensions,public');
      const results = await database.query(render(readFileSync('packages/database/test/sql/auth_claims_v21.pgtap.sql', 'utf8')));
      const lines = (Array.isArray(results) ? results : [results]).flatMap(result => result.rows.flatMap(row => Object.values(row)));
      expect(lines.filter(line => typeof line === 'string' && /^(not ok|# Looks like)/.test(line))).toEqual([]);
      expect(lines).toContain('1..6');
    } finally { await database.query('rollback'); }
  });

  it('rolls back empty mapping infrastructure without dropping M1 reservations or audit evidence', async () => {
    await database.query('begin');
    try {
      await database.query(`delete from ${schema}.auth_user_links`);
      const before = (await database.query(`select count(*)::int as count from ${schema}.audit_logs`)).rows[0].count;
      const down = render(readFileSync(AUTH_M2_ROLLBACK, 'utf8')).replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '');
      await database.query(down);
      expect((await database.query('select to_regclass($1) as links,to_regclass($2) as reservations', [`${schema}.auth_user_links`, `${schema}.email_reservations`])).rows[0]).toMatchObject({ links: null, reservations: `${schema}.email_reservations` });
      expect((await database.query(`select count(*)::int as count from ${schema}.audit_logs`)).rows[0].count).toBe(before);
    } finally { await database.query('rollback'); }
  });
  it('rejects a provider outside the allowlist despite verified contacts and spoofed user metadata', async () => {
    const record = await fixture();
    await database.query('update auth.users set raw_app_meta_data=$1,raw_user_meta_data=$2 where id=$3', [{ provider: 'saml:unapproved', providers: ['phone'] }, { provider: 'phone', phone_verified: true }, record.authId]);
    const requestId = randomUUID();
    const result = await database.query(`select ${schema}.rpc_claim_invited_account($1,$2) as result`, [record.authId, requestId]);
    expect(result.rows[0].result).toEqual({ outcome: 'rejected', code: 'AUTH_PROVIDER_USER_INVALID' });
    expect((await database.query(`select count(*)::int as count from ${schema}.auth_user_links where auth_user_id=$1`, [record.authId])).rows).toEqual([{ count: 0 }]);
  });

  it.each(['anon', 'authenticated'])('denies v2.1 link SELECT to %s', async role => {
    await database.query('begin');
    try {
      await database.query('set local role ' + role);
      await expect(database.query('select * from ' + schema + '.auth_user_links')).rejects.toMatchObject({ code: '42501' });
    } finally { await database.query('rollback'); }
  });
  it('allows service_role only SELECT on the v2.1 link table', async () => {
    const record = await fixture();
    await database.query('select ' + schema + '.rpc_claim_invited_account($1,$2)', [record.authId, randomUUID()]);
    for (const operation of ['insert', 'update', 'delete']) {
      await database.query('begin');
      try {
        await database.query('set local role service_role');
        expect((await database.query('select user_id from ' + schema + '.auth_user_links where auth_user_id=$1', [record.authId])).rows).toEqual([{ user_id: record.id }]);
        const sql = operation === 'insert' ? 'insert into ' + schema + '.auth_user_links(auth_user_id,user_id,claim_method) values($1,$2,\'phone\')'
          : operation === 'update' ? 'update ' + schema + '.auth_user_links set user_id=$2 where auth_user_id=$1'
          : 'delete from ' + schema + '.auth_user_links where auth_user_id=$1 and user_id=$2';
        await expect(database.query(sql, [record.authId, record.id])).rejects.toMatchObject({ code: '42501' });
      } finally { await database.query('rollback'); }
    }
  });
  it('rejects an unverified email-only identity', async () => {
    const record = await fixture();
    await database.query('update auth.users set phone=null,phone_confirmed_at=null,email=$1,email_confirmed_at=null where id=$2', ['unverified-' + record.id + '@example.invalid', record.authId]);
    const result = await database.query('select ' + schema + '.rpc_claim_invited_account($1,$2) as result', [record.authId, randomUUID()]);
    expect(result.rows[0].result).toEqual({ outcome: 'rejected', code: 'AUTH_VERIFIED_CONTACT_REQUIRED' });
  });
  it('rejects a verified non-Indian phone that shares the invite local digits', async () => {
    const record = await fixture();
    await database.query('update auth.users set phone=$1 where id=$2', ['1' + record.phone, record.authId]);
    const result = await database.query('select ' + schema + '.rpc_claim_invited_account($1,$2) as result', [record.authId, randomUUID()]);
    expect(result.rows[0].result).toEqual({ outcome: 'rejected', code: 'AUTH_VERIFIED_CONTACT_REQUIRED' });
  });
  it.each(['employer', 'job_seeker'])('claims an invited %s once and retries idempotently', async role => {
    const record = await fixture();
    await database.query('update ' + schema + '.users set role=$1 where id=$2', [role, record.id]);
    const first = await database.query('select ' + schema + '.rpc_claim_invited_account($1,$2) as result', [record.authId, randomUUID()]);
    const retry = await database.query('select ' + schema + '.rpc_claim_invited_account($1,$2) as result', [record.authId, randomUUID()]);
    expect(first.rows[0].result).toEqual({ outcome: 'success', code: 'AUTH_INVITE_CLAIMED', user_id: record.id });
    expect(retry.rows[0].result).toEqual({ outcome: 'retry', code: 'AUTH_INVITE_ALREADY_LINKED', user_id: record.id });
    expect((await database.query('select count(*)::int as count from ' + schema + '.auth_user_links where user_id=$1', [record.id])).rows).toEqual([{ count: 1 }]);
  });
  it('rejects two candidates when verified phone and email identify different invitees', async () => {
    const first = await fixture(), second = await fixture();
    const email = 'split-' + randomUUID() + '@example.invalid';
    await database.query('update ' + schema + '.users set email=$1 where id=$2', [email, second.id]);
    await database.query('update auth.users set email=$1,email_confirmed_at=now() where id=$2', [email, first.authId]);
    const result = await database.query('select ' + schema + '.rpc_claim_invited_account($1,$2) as result', [first.authId, randomUUID()]);
    expect(result.rows[0].result).toEqual({ outcome: 'rejected', code: 'AUTH_IDENTITY_CONFLICT' });
    expect((await database.query('select count(*)::int as count from ' + schema + '.auth_user_links where user_id=any($1::uuid[])', [[first.id, second.id]])).rows).toEqual([{ count: 0 }]);
  });
  it('commits a fresh rejected attempt after an outer rollback and rejects unapproved audit reasons', async () => {
    const record = await fixture(); const requestId = randomUUID();
    await database.query('update auth.users set phone_confirmed_at=null where id=$1', [record.authId]);
    await database.query('begin');
    try { await database.query('select ' + schema + '.rpc_claim_invited_account($1,$2)', [record.authId, requestId]); }
    finally { await database.query('rollback'); }
    expect((await database.query('select count(*)::int as count from ' + schema + '.audit_logs where meta->>\'request_id\'=$1', [requestId])).rows).toEqual([{ count: 0 }]);
    await database.query('select ' + schema + '.rpc_claim_invited_account($1,$2)', [record.authId, requestId]);
    const audits = await database.query('select actor_id,meta from ' + schema + '.audit_logs where meta->>\'request_id\'=$1', [requestId]);
    expect(audits.rows).toEqual([{ actor_id: null, meta: { request_id: requestId, outcome: 'rejected', reason: 'AUTH_VERIFIED_CONTACT_REQUIRED', claim_method: 'unknown' } }]);
    await expect(database.query('select ' + schema + '.finish_invite_claim_v21($1,NULL,\'FREE_TEXT_NOT_ALLOWED\',\'unknown\')', [randomUUID()])).rejects.toMatchObject({ code: '22023' });
  });
  it('normalises provider email capitals and surrounding spaces before matching', async () => {
    const record = await fixture(); const email = 'normalised-' + record.id + '@example.invalid';
    await database.query('update ' + schema + '.users set email=$1 where id=$2', [email, record.id]);
    await database.query('update auth.users set phone=null,phone_confirmed_at=null,email=$1,email_confirmed_at=now() where id=$2', ['  ' + email.toUpperCase() + '  ', record.authId]);
    const result = await database.query('select ' + schema + '.rpc_claim_invited_account($1,$2) as result', [record.authId, randomUUID()]);
    expect(result.rows[0].result).toEqual({ outcome: 'success', code: 'AUTH_INVITE_CLAIMED', user_id: record.id });
  });
  it('never matches an erased application contact', async () => {
    const record = await fixture();
    await database.query('update ' + schema + '.users set phone=$1,email=null,pending_email=null,status=\'disabled\' where id=$2', ['DEL_' + record.id.replaceAll('-', '').slice(0, 10), record.id]);
    const result = await database.query('select ' + schema + '.rpc_claim_invited_account($1,$2) as result', [record.authId, randomUUID()]);
    expect(result.rows[0].result).toEqual({ outcome: 'rejected', code: 'AUTH_INVITE_NOT_CLAIMABLE' });
    expect((await database.query('select count(*)::int as count from ' + schema + '.auth_user_links where user_id=$1', [record.id])).rows).toEqual([{ count: 0 }]);
  });

});
