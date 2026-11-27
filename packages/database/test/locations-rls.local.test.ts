import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const DATABASE_URL =
  process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('pooler.supabase.com')
    ? process.env.DATABASE_URL
    : 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const db = new pg.Client({ connectionString: DATABASE_URL });

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.end();
});

describe('Location reference tables RLS & privileges (ADR 0002)', () => {
  it.each(['states', 'districts', 'pincodes'])(
    'public.%s has RLS enabled, no policies, and denies SELECT/INSERT/UPDATE/DELETE for anon and authenticated',
    async (tableName) => {
      const rlsRes = await db.query(
        `SELECT c.relrowsecurity
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = $1`,
        [tableName],
      );
      expect(rlsRes.rows[0]?.relrowsecurity).toBe(true);

      const policyRes = await db.query(
        `SELECT count(*)::int AS policy_count
         FROM pg_policies
         WHERE schemaname = 'public' AND tablename = $1`,
        [tableName],
      );
      expect(policyRes.rows[0]?.policy_count).toBe(0);

      const privRes = await db.query(
        `SELECT
           has_table_privilege('anon', $1, 'SELECT') AS anon_select,
           has_table_privilege('anon', $1, 'INSERT') AS anon_insert,
           has_table_privilege('anon', $1, 'UPDATE') AS anon_update,
           has_table_privilege('anon', $1, 'DELETE') AS anon_delete,
           has_table_privilege('authenticated', $1, 'SELECT') AS auth_select,
           has_table_privilege('authenticated', $1, 'INSERT') AS auth_insert,
           has_table_privilege('authenticated', $1, 'UPDATE') AS auth_update,
           has_table_privilege('authenticated', $1, 'DELETE') AS auth_delete,
           has_table_privilege('service_role', $1, 'SELECT') AS service_select,
           has_table_privilege('service_role', $1, 'INSERT') AS service_insert,
           has_table_privilege('service_role', $1, 'UPDATE') AS service_update,
           has_table_privilege('service_role', $1, 'DELETE') AS service_delete`,
        [`public.${tableName}`],
      );
      expect(privRes.rows[0]).toMatchObject({
        anon_select: false,
        anon_insert: false,
        anon_update: false,
        anon_delete: false,
        auth_select: false,
        auth_insert: false,
        auth_update: false,
        auth_delete: false,
        service_select: true,
        service_insert: true,
        service_update: true,
      });

      for (const role of ['anon', 'authenticated'] as const) {
        for (const sql of [
          `SELECT 1 FROM public.${tableName} LIMIT 1`,
          `DELETE FROM public.${tableName} WHERE false`,
        ]) {
          await db.query('BEGIN');
          try {
            await db.query(`SET LOCAL ROLE ${role}`);
            await expect(db.query(sql)).rejects.toThrow(/permission denied/i);
          } finally {
            await db.query('ROLLBACK');
          }
        }
      }
    },
  );
});
