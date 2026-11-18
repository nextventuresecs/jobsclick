import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const columns = JSON.parse(readFileSync(new URL('./fixtures/public-view-columns.json', import.meta.url), 'utf8')) as Record<string, string[]>;
const views = ['public_jobs', 'public_business_profiles', 'public_institution_profiles'] as const;
describe('AUTH-05 F0-f Option A private public projections', () => {
  const db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
  beforeAll(async () => { await db.connect(); }); afterAll(async () => { await db.end(); });
  it.each(views)('denies direct anon/authenticated SQL and Data API reads on %s', async view => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ role: 'authenticated', sub: randomUUID(), aud: 'authenticated', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+900 })).toString('base64url');
    const signed = header + '.' + body + '.' + createHmac('sha256', process.env['SUPABASE_JWT_SECRET']!).update(header + '.' + body).digest('base64url');
    for (const role of ['anon', 'authenticated']) {
      expect((await db.query('select has_table_privilege($1,$2,$3) as allowed', [role, 'public.' + view, 'select'])).rows).toEqual([{ allowed: false }]);
      await db.query('set role ' + role);
      try { await expect(db.query('select * from public.' + view + ' limit 1')).rejects.toMatchObject({ code: '42501' }); }
      finally { await db.query('reset role'); }
      const response = await fetch(process.env['SUPABASE_URL'] + '/rest/v1/' + view + '?select=*', { headers: { apikey: process.env['SUPABASE_ANON_KEY']!, Authorization: 'Bearer ' + (role === 'anon' ? process.env['SUPABASE_ANON_KEY']! : signed) } });
      expect(response.status).toBe(role === 'anon' ? 401 : 403);
      expect(await response.json()).toMatchObject({ code: '42501' });
    }
  });
  it.each(views)('uses invoker security and the reviewed exact column allowlist on %s', async view => {
    expect((await db.query("select coalesce(reloptions,'{}') @> array['security_invoker=true'] as invoker from pg_class where oid=$1::regclass", ['public.' + view])).rows).toEqual([{ invoker: true }]);
    const actual = (await db.query('select column_name from information_schema.columns where table_schema=$1 and table_name=$2 order by ordinal_position', ['public', view])).rows.map(row => row.column_name);
    expect(actual).toEqual(columns[view]);
    expect((await db.query("select has_table_privilege('service_role',$1,'select') as allowed", ['public.' + view])).rows).toEqual([{ allowed: true }]);
  });
  it.each(['active-published', 'invited', 'disabled', 'erased', 'unpublished'])('publishes only eligible owners: %s', async state => {
    const employer = randomUUID(), coordinator = randomUUID(), company = randomUUID(), institution = randomUUID(), job = randomUUID();
    const status = state === 'invited' ? 'invited' : state === 'disabled' ? 'disabled' : 'active';
    for (const [id, role] of [[employer, 'employer'], [coordinator, 'intermediary']]) await db.query("insert into public.users(id,phone,role,status,source) values($1,$2,$3,$4,'public-view-fixture')", [id, '8' + randomInt(100000000,999999999), role, status]);
    await db.query("insert into public.business_profiles(id,user_id,company_name,ownership_type,company_size,sector,city,district,is_published,source) values($1,$2,'Projection Fixture','Private Limited','Small','technology','Pune','Pune',$3,'public-view-fixture')", [company,employer,state !== 'unpublished']);
    await db.query("insert into public.institution_profiles(id,user_id,institution_name,is_published,source) values($1,$2,'Projection Institute',$3,'public-view-fixture')", [institution,coordinator,state !== 'unpublished']);
    await db.query("insert into public.jobs(id,employer_id,title,description,category,city,openings,is_active,source) values($1,$2,'Projection Job','Fixture','technology','Pune',1,true,'public-view-fixture')", [job,employer]);
    if (state === 'erased') for (const owner of [employer, coordinator]) await db.query('select public.anonymise_user($1)', [owner]);
    await db.query('set role service_role');
    try {
      for (const [view,id] of [['public_jobs',job],['public_business_profiles',company],['public_institution_profiles',institution]]) {
        const result = await db.query('select * from public.' + view + ' where id=$1', [id]);
        expect(result.rows).toHaveLength(state === 'active-published' ? 1 : 0);
        if(result.rows[0]) expect(Object.keys(result.rows[0])).toEqual(columns[view!]);
      }
    } finally { await db.query('reset role'); }
  });
  it('native advisor exits nonzero for an injected ERROR and zero after removal', async () => {
    const workdir = path.dirname(process.env['JOBSCLICK_TEST_MANIFEST']!);
    const probe = 'advisor_probe_' + randomUUID().replaceAll('-', '');
    const keys = new Set(['PATH','PATHEXT','SYSTEMROOT','WINDIR','COMSPEC','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP']);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => keys.has(key.toUpperCase())));
    const scan = () => spawnSync(process.execPath, ['node_modules/supabase/dist/supabase.js','db','advisors','--type','all','--fail-on','error','--output-format','json','--agent','no','--workdir',workdir], { cwd: process.cwd(), env: { ...env, DO_NOT_TRACK: '1' }, encoding: 'utf8', windowsHide: true, maxBuffer: 4*1024*1024 });
    await db.query('create view public.' + probe + ' as select 1 as id');
    await db.query('grant select on public.' + probe + ' to anon');
    try {
      const failed = scan(); expect(failed.status).not.toBe(0);
      const report = JSON.parse(failed.stdout.slice(failed.stdout.indexOf('{'), failed.stdout.lastIndexOf('}')+1)) as { results: { level: string; metadata: { name: string } }[] };
      expect(report.results.some(item => item.level === 'ERROR' && item.metadata.name === probe)).toBe(true);
    } finally { await db.query('drop view public.' + probe); }
    const clean = scan(); expect(clean.status).toBe(0);
  });

});
