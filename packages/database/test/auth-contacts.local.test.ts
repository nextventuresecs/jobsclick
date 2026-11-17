import { AUTH_M1_MIGRATION, AUTH_M1_ROLLBACK } from './auth-migration-artifacts.js';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

describe.runIf(process.env['RUN_LOCAL_SUPABASE'] === '1')('AUTH-01 contact schema transition', () => {
  const schema = `auth_contacts_${randomUUID().replaceAll('-', '')}`;
  const pool = new pg.Pool({ connectionString: process.env['DATABASE_URL'], max: 1 });
  let safe = false;
  let transaction: pg.PoolClient | undefined;
  const db = { query: (text: string, values?: unknown[]) => (transaction ?? pool).query(text, values) };
  beforeAll(async () => {
    const target = new URL(process.env['DATABASE_URL'] || '');
    if (process.env['NODE_ENV'] !== 'test' || target.hostname !== '127.0.0.1' || target.port !== process.env['JOBSCLICK_TEST_DB_PORT']) throw new Error('LOCAL_TEST_ONLY');
    safe = true;
    await db.query(`create schema ${schema}; create table ${schema}.users (like public.users including all)`);
    await db.query(`alter table ${schema}.users drop constraint if exists users_contact_required_v21, drop constraint if exists users_email_canonical_v21, drop constraint if exists users_pending_email_canonical_v21;`);
    await db.query(readFileSync(AUTH_M1_MIGRATION, 'utf8').replaceAll('public.users', `${schema}.users`).replaceAll('private_auth', schema));
  });
  beforeEach(async () => { if (safe) { transaction = await pool.connect(); await transaction.query('begin'); } });
  afterEach(async () => { if (transaction) { await transaction.query('rollback'); transaction.release(); transaction = undefined; } });
  afterAll(async () => {
    try { if (safe) await db.query(`drop schema if exists ${schema} cascade`); }
    finally { await pool.end(); }
  });

  it('accepts an email-only invited record while preserving its supplied UUID', async () => {
    const id = randomUUID();
    const result = await db.query(`insert into ${schema}.users(id,email,role,status) values ($1,$2,'employer','invited') returning id,phone`, [id, 'invite@example.invalid']);
    expect(result.rows).toEqual([{ id, phone: null }]);
  });

  it('rejects a record with neither contact', async () => {
    await expect(db.query(`insert into ${schema}.users(role,status) values ('employer','invited')`)).rejects.toMatchObject({ code: '23514' });
  });

  it.each(['Person@example.invalid', ' person@example.invalid', '', 'invalid', 'person@example.invalid\n'])('rejects noncanonical/invalid stored email %#', async email => {
    await expect(db.query(`insert into ${schema}.users(email,role,status) values ($1,'employer','invited')`, [email])).rejects.toMatchObject({ code: '23514' });
  });

  it('does not reserve another account\'s confirmed email as a pending email', async () => {
    await db.query(`insert into ${schema}.users(phone,email,role,status) values ('9000000001','reserved@example.invalid','employer','invited')`);
    await expect(db.query(`insert into ${schema}.users(phone,pending_email,role,status) values ('9000000002','reserved@example.invalid','employer','invited')`)).rejects.toMatchObject({ code: '23505' });
  });

  it('allows pending-email confirmation by its owner, then releases contacts during legacy erasure', async () => {
    const id = randomUUID();
    await db.query(`insert into ${schema}.users(id,phone,pending_email,role,status) values ($1,'9000000010','confirm@example.invalid','employer','invited')`, [id]);
    await db.query(`update ${schema}.users set email=pending_email,pending_email=null where id=$1`, [id]);
    await db.query(`update ${schema}.users set phone='DEL_0123456789',email=null,pending_email=null,email_verified_at=null,status='disabled' where id=$1`, [id]);
    expect((await db.query(`select status,phone from ${schema}.users where id=$1`, [id])).rows).toEqual([{ status: 'disabled', phone: 'DEL_0123456789' }]);
    await expect(db.query(`insert into ${schema}.users(email,role,status) values ('confirm@example.invalid','employer','invited')`)).resolves.toMatchObject({ rowCount: 1 });
  });

  it('refuses a rollback with phone-less data without losing that data', async () => {
    const id = randomUUID();
    await db.query(`insert into ${schema}.users(id,email,role,status) values ($1,'rollback@example.invalid','employer','invited')`, [id]);
    const down = readFileSync(AUTH_M1_ROLLBACK, 'utf8').replaceAll('public.users', `${schema}.users`).replaceAll('private_auth', schema).replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '');
    await db.query('savepoint down_attempt');
    await expect(db.query(down)).rejects.toThrow('AUTH_CONTACT_ROLLBACK_REQUIRES_FORWARD_RECOVERY');
    await db.query('rollback to down_attempt');
    expect((await db.query(`select id,phone from ${schema}.users where id=$1`, [id])).rows).toEqual([{ id, phone: null }]);
  });

  it('restores the previous NOT NULL contract when rollback preconditions hold', async () => {
    const down = readFileSync(AUTH_M1_ROLLBACK, 'utf8').replaceAll('public.users', `${schema}.users`).replaceAll('private_auth', schema).replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '');
    await db.query(down);
    await expect(db.query(`insert into ${schema}.users(email,role,status) values ('after-down@example.invalid','employer','invited')`)).rejects.toMatchObject({ code: '23502' });
  });

  it('executes the pgTAP database contract with a transaction-local extension', async () => {
    await db.query("select pg_advisory_xact_lock(hashtextextended('auth-tests:pgtap-extension',0))");
    await db.query('create extension pgtap with schema extensions');
    await db.query('set local search_path=extensions,public');
    const statements = readFileSync('packages/database/test/sql/auth_contacts_v21.pgtap.sql', 'utf8').replaceAll('public.users', `${schema}.users`).replaceAll("'public'", `'${schema}'`);
    const results = await db.query(statements);
    const lines = (Array.isArray(results) ? results : [results]).flatMap(result => result.rows.flatMap(row => Object.values(row)));
    expect(lines.filter(line => typeof line === 'string' && /^(not ok|# Looks like)/.test(line))).toEqual([]);
    expect(lines).toContain('1..6');
  });

  it('lets the service insert trigger maintain reservations without direct reservation access', async () => {
    await db.query(`grant usage on schema ${schema} to service_role; grant insert on ${schema}.users to service_role`);
    await db.query('set local role service_role');
    await expect(db.query(`insert into ${schema}.users(email,role,status) values ('backend@example.invalid','employer','invited')`)).resolves.toMatchObject({ rowCount: 1 });
    await expect(db.query(`select email from ${schema}.email_reservations`)).rejects.toMatchObject({ code: '42501' });
  });
});
