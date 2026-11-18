import { randomInt, randomUUID } from 'node:crypto';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
const db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
const backend = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!,
);
// Native application triggers run normally; all fixture users, ledger and Auth rows roll back together.
beforeAll(async () => {
  await db.connect();
  await db.query('begin');
});
afterAll(async () => {
  try {
    await db.query('rollback');
  } finally {
    await db.end();
  }
});
describe('AUTH-01/03 native known-number lookup', () => {
  it('allows invited or linked active users only, never arbitrary active/unlisted/disabled contacts', async () => {
    for (const state of ['invited', 'active', 'disabled', 'linked']) {
      const id = randomUUID(),
        phone = '8' + randomInt(100000000, 999999999);
      await db.query(
        "insert into public.users(id,phone,role,status,source) values($1,$2,'job_seeker',$3,'known-phone-test')",
        [id, phone, state === 'linked' ? 'active' : state],
      );
      if (state === 'linked') {
        const authId = randomUUID();
        await db.query(
          "insert into auth.users(id,instance_id,aud,role,phone,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,is_anonymous,created_at,updated_at) values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,now(),jsonb_build_object('provider','phone','providers',jsonb_build_array('phone')),'{}',false,now(),now())",
          [authId, '91' + phone],
        );
        await db.query(
          "insert into private_auth.auth_user_links(auth_user_id,user_id,claim_method) values($1,$2,'phone')",
          [authId, id],
        );
      }
      await db.query('set local role service_role');
      const result = await db.query('select public.rpc_sms_phone_is_known($1) as known', [phone]);
      await db.query('reset role');
      expect(result.rows).toEqual([{ known: ['invited', 'linked'].includes(state) }]);
    }
    expect((await backend.rpc('rpc_sms_phone_is_known', { p_phone: '7999999999' })).data).toBe(
      false,
    );
  });
  it('rejects direct anon access and noncanonical phone lookup', async () => {
    const anon = createClient(process.env['SUPABASE_URL']!, process.env['SUPABASE_ANON_KEY']!);
    expect((await anon.rpc('rpc_sms_phone_is_known', { p_phone: '8765432109' })).error?.code).toBe(
      '42501',
    );
    expect((await backend.rpc('rpc_sms_phone_is_known', { p_phone: '+918765432109' })).data).toBe(
      false,
    );
  });
});
