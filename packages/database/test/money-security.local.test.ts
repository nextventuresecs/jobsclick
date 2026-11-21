import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const DATABASE_URL =
  process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('pooler.supabase.com')
    ? process.env.DATABASE_URL
    : 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const SUPABASE_URL =
  process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('supabase.co')
    ? process.env.SUPABASE_URL
    : 'http://127.0.0.1:54321';

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_URL?.includes('supabase.co')
    ? process.env.SUPABASE_ANON_KEY
    : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const db = new pg.Client({ connectionString: DATABASE_URL });
beforeAll(async () => {
  await db.connect();
});
afterAll(async () => {
  await db.end();
});

describe('money surface is service_role-only', () => {
  it('no SECURITY DEFINER function in public/private_payments is executable by anon/authenticated/PUBLIC', async () => {
    const { rows } = await db.query(`
      select p.oid::regprocedure::text as fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public','private_payments') and p.prosecdef
        and (has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                     where a.grantee = 0 and a.privilege_type = 'EXECUTE'))`);
    expect(rows).toEqual([]);
  });

  it('every public rpc_* wrapper is SECURITY INVOKER with search_path pinned', async () => {
    const { rows } = await db.query(`
      select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname like 'rpc\\_%'
        and (p.prosecdef or p.proconfig is null or not (p.proconfig::text like '%search_path=%'))`);
    expect(rows).toEqual([]);
  });

  it.each([
    'payments',
    'credit_ledgers',
    'audit_logs',
    'institution_sponsorships',
    'payment_refunds',
    'invoices',
    'credit_action_costs',
    'platform_settings',
  ])('anon/authenticated have no privileges on public.%s', async (t) => {
    const { rows } = await db.query(
      `select has_table_privilege('anon', $1, 'SELECT') a, has_table_privilege('authenticated', $1, 'SELECT') b,
              has_table_privilege('authenticated', $1, 'INSERT') c`,
      [`public.${t}`],
    );
    expect(rows[0]).toEqual({ a: false, b: false, c: false });
  });

  it('live anon-key call to a money wrapper is rejected with permission denied', async () => {
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error } = await anon.rpc('rpc_settle_payment', {
      p_gateway_order_id: 'x',
      p_gateway_payment_id: 'y',
      p_amount_paise: 1,
      p_currency: 'INR',
      p_method: 'upi',
      p_event_id: null,
      p_source: 'attack',
    });
    expect(error?.code).toBe('42501');
  });

  it('credit_ledgers UPDATE and DELETE are blocked by reject_mutation (Hard Invariant #7)', async () => {
    const { rows } = await db.query('SELECT id FROM public.credit_ledgers LIMIT 1');
    if (rows.length > 0) {
      const id = rows[0].id;
      await db.query('BEGIN');
      try {
        await expect(
          db.query('UPDATE public.credit_ledgers SET amount = amount + 1 WHERE id = $1', [id]),
        ).rejects.toThrow('IMMUTABLE_RECORD');
      } finally {
        await db.query('ROLLBACK');
      }

      await db.query('BEGIN');
      try {
        await expect(
          db.query('DELETE FROM public.credit_ledgers WHERE id = $1', [id]),
        ).rejects.toThrow('IMMUTABLE_RECORD');
      } finally {
        await db.query('ROLLBACK');
      }
    }
  });

  it('client roles cannot write institution_id / sponsorship_id on seeker profiles', async () => {
    const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
    const uRes = await db.query(
      "INSERT INTO public.users (phone, role, status) VALUES ($1, 'job_seeker', 'active') RETURNING id",
      [phone],
    );
    const userId = uRes.rows[0].id;
    const pRes = await db.query(
      `INSERT INTO public.job_seeker_profiles (user_id, full_name, city)
       VALUES ($1, 'Test Seeker', 'Delhi') RETURNING id`,
      [userId],
    );
    const profileId = pRes.rows[0].id;
    const dummyId = '00000000-0000-0000-0000-000000000001';

    // authenticated role update
    await db.query('BEGIN');
    await db.query('SET LOCAL ROLE authenticated');
    await expect(
      db.query('UPDATE public.job_seeker_profiles SET sponsorship_id = $1 WHERE id = $2', [
        dummyId,
        profileId,
      ]),
    ).rejects.toThrow(/FORBIDDEN_COLUMN|permission denied/);
    await db.query('ROLLBACK');

    await db.query('BEGIN');
    await db.query('SET LOCAL ROLE authenticated');
    await expect(
      db.query('UPDATE public.job_seeker_profiles SET institution_id = $1 WHERE id = $2', [
        dummyId,
        profileId,
      ]),
    ).rejects.toThrow(/FORBIDDEN_COLUMN|permission denied/);
    await db.query('ROLLBACK');

    // anon role update
    await db.query('BEGIN');
    await db.query('SET LOCAL ROLE anon');
    await expect(
      db.query('UPDATE public.job_seeker_profiles SET sponsorship_id = $1 WHERE id = $2', [
        dummyId,
        profileId,
      ]),
    ).rejects.toThrow(/FORBIDDEN_COLUMN|permission denied/);
    await db.query('ROLLBACK');
  });
});
