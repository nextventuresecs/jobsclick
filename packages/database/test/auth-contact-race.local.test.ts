import { AUTH_M1_MIGRATION } from './auth-migration-artifacts.js';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe.runIf(process.env['RUN_LOCAL_SUPABASE'] === '1')('AUTH-01 concurrent email reservation', () => {
  const schema = `auth_email_race_${randomUUID().replaceAll('-', '')}`;
  const config = { connectionString: process.env['DATABASE_URL'] };
  const control = new pg.Client(config);
  let safe = false;
  beforeAll(async () => {
    const target = new URL(config.connectionString || '');
    if (process.env['NODE_ENV'] !== 'test' || target.hostname !== '127.0.0.1' || target.port !== process.env['JOBSCLICK_TEST_DB_PORT']) throw new Error('LOCAL_TEST_ONLY');
    safe = true;
    await control.connect();
    await control.query(`create schema ${schema}; create table ${schema}.users (like public.users including all)`);
    await control.query(`alter table ${schema}.users drop constraint if exists users_contact_required_v21, drop constraint if exists users_email_canonical_v21, drop constraint if exists users_pending_email_canonical_v21;`);
    await control.query(readFileSync(AUTH_M1_MIGRATION, 'utf8').replaceAll('public.users', `${schema}.users`).replaceAll('private_auth', schema));
  });
  afterAll(async () => {
    try { if (safe) await control.query(`drop schema if exists ${schema} cascade`); }
    finally { await control.end(); }
  });

  it('prevents confirmed/pending split ownership even under repeatable-read snapshots', async () => {
    const clients = [new pg.Client(config), new pg.Client(config)];
    try {
      await Promise.all(clients.map(async client => {
        await client.connect();
        await client.query('begin isolation level repeatable read');
        await client.query(`select count(*) from ${schema}.users`);
      }));
      const results = await Promise.allSettled(clients.map(async (client, index) => {
        try {
          const column = index === 0 ? 'email' : 'pending_email';
          await client.query(`insert into ${schema}.users(id,phone,${column},role,status) values ($1,$2,'race@example.invalid','employer','invited')`, [randomUUID(), `900000002${index}`]);
          await client.query('commit');
        } catch (error) { await client.query('rollback'); throw error; }
      }));
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find(result => result.status === 'rejected');
      expect(rejected?.status).toBe('rejected');
      if (rejected?.status === 'rejected') expect(['23505', '40001']).toContain(rejected.reason.code);
      expect((await control.query(`select count(*)::int as count from ${schema}.email_reservations`)).rows).toEqual([{ count: 1 }]);
      expect((await control.query(`select count(*)::int as count from ${schema}.users`)).rows).toEqual([{ count: 1 }]);
    } finally { await Promise.all(clients.map(client => client.end())); }
  });
});
