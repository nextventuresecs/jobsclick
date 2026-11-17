import { randomInt, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe.runIf(process.env['RUN_LOCAL_SUPABASE'] === '1')('AUTH-01 shipped M1/M2 migration replay', () => {
  const db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
  beforeAll(async () => { await db.connect(); });
  afterAll(async () => { await db.end(); });
  it('replays M1/M2 before fixtures using native Supabase roles', async () => {
    expect((await db.query("select to_regclass('private_auth.auth_user_links')::text as links,to_regclass('private_auth.email_reservations')::text as reservations")).rows)
      .toEqual([{ links: 'private_auth.auth_user_links', reservations: 'private_auth.email_reservations' }]);
    expect((await db.query("select is_nullable from information_schema.columns where table_schema='public' and table_name='users' and column_name='phone'")).rows).toEqual([{ is_nullable: 'YES' }]);
    expect((await db.query("select rolsuper from pg_roles where rolname=current_user")).rows).toEqual([{ rolsuper: false }]);
  });
  it('serializes two independent provider claims on one invite through the shipped RPC', async () => {
    const userId=randomUUID(), phoneAuth=randomUUID(), emailAuth=randomUUID();
    const phone='8'+randomInt(100000000,999999999),email='replay-'+randomUUID()+'@example.invalid';
    await db.query("insert into public.users(id,phone,email,role,status,source) values($1,$2,$3,'job_seeker','invited','disposable-migration-replay')",[userId,phone,email]);
    await db.query("insert into auth.users(id,phone,phone_confirmed_at,raw_app_meta_data) values($1,$2,now(),$3)",[phoneAuth,'91'+phone,{provider:'phone',providers:['phone']}]);
    await db.query("insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,$2,now(),$3)",[emailAuth,email,{provider:'email',providers:['email']}]);
    const clients=[new pg.Client({connectionString:process.env['DATABASE_URL']}),new pg.Client({connectionString:process.env['DATABASE_URL']})];
    try {
      const results=await Promise.all(clients.map(async(client,index)=>{await client.connect();return client.query('select public.rpc_claim_invited_account($1,$2) as result',[[phoneAuth,emailAuth][index],randomUUID()]);}));
      expect(results.map(result=>result.rows[0].result.outcome).sort()).toEqual(['rejected','success']);
      expect(results.find(result=>result.rows[0].result.outcome==='rejected')!.rows[0].result).toEqual({outcome:'rejected',code:'AUTH_IDENTITY_CONFLICT'});
      expect((await db.query('select count(*)::int as count from private_auth.auth_user_links where user_id=$1',[userId])).rows).toEqual([{count:1}]);
    } finally {await Promise.all(clients.map(client=>client.end()));}
  });
});
