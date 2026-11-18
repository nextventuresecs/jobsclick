import { mapApiJobToJobItem } from '../../web/src/lib/job-mapper.js';
import { randomInt, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Database } from '@indian-job-portal/database';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { ProfileRepository } from '../src/database/repositories/profile.repository.js';
import { PublicDiscoveryRepository } from '../src/database/repositories/public-discovery.repository.js';
import { UserRepository } from '../src/database/repositories/user.repository.js';
import { JobRepository } from '../src/database/repositories/job.repository.js';
import { TEST_AUTH_GUARD } from '../src/auth/guards/jwt-auth.guard.js';
import { JwtService } from '../src/auth/jwt.service.js';

describe('AUTH-05 F0-f native public API projection boundary', () => {
  const db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
  const marker = 'publication-' + randomUUID();
  let app: NestFastifyApplication;
  async function fixture(state = 'published') {
    const employer=randomUUID(), coordinator=randomUUID(), company=randomUUID(), institution=randomUUID(), job=randomUUID();
    const status=state==='invited'?'invited':state==='disabled'?'disabled':'active';
    for(const [id,role] of [[employer,'employer'],[coordinator,'intermediary']]) await db.query("insert into public.users(id,phone,role,status,source) values($1,$2,$3,$4,'public-api-fixture')",[id,'8'+randomInt(100000000,999999999),role,status]);
    await db.query("insert into public.business_profiles(id,user_id,company_name,ownership_type,company_size,sector,city,district,is_published,phone,email,source) values($1,$2,$3,'Private Limited','Small','Technology','Pune','Pune',$4,'9812345678','private-owner@example.invalid','never-public-source')",[company,employer,marker+' company',state!=='unpublished']);
    await db.query("insert into public.institution_profiles(id,user_id,institution_name,is_published,contact_phone,contact_email,source) values($1,$2,$3,$4,'9812345678','private-coordinator@example.invalid','never-public-source')",[institution,coordinator,marker+' institute',state!=='unpublished']);
    await db.query("insert into public.jobs(id,employer_id,title,description,category,city,openings,is_active,source) values($1,$2,$3,'Public projection native fixture','technology','Pune',1,true,'never-public-source')",[job,employer,marker+' job']);
    if(state==='erased') for(const owner of [employer,coordinator]) await db.query('select public.anonymise_user($1)',[owner]);
    return {employer,coordinator,company,institution,job};
  }
  beforeAll(async () => {
    await db.connect();
    const client=createClient<Database>(process.env['SUPABASE_URL']!,process.env['SUPABASE_SERVICE_ROLE_KEY']!);
    const previous=process.env['NODE_ENV'];process.env['NODE_ENV']='production';
    let profiles:ProfileRepository,jobs:JobRepository;
    try {profiles=new ProfileRepository(client);jobs=new JobRepository(client);}
    finally {process.env['NODE_ENV']=previous;}
    const module=await Test.createTestingModule({imports:[AppModule]})
      .overrideProvider(PublicDiscoveryRepository).useValue(new PublicDiscoveryRepository(client,new UserRepository(client),false))
      .overrideProvider(ProfileRepository).useValue(profiles!)
      .overrideProvider(JobRepository).useValue(jobs!)
      // Remove global test-auth substitution: public/guard metadata must really work.
      .overrideProvider(TEST_AUTH_GUARD).useValue(null).compile();
    app=module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async()=>{await app?.close();await db.end();});
  it('serves published company/institution directories through actual unauthenticated API routes',async()=>{
    const f=await fixture();
    for(const [kind,id] of [['business',f.company],['institution',f.institution]]){
      const response=await app.inject({method:'GET',url:'/profiles/'+kind+'?query='+marker});
      expect(response.statusCode).toBe(200);expect(response.headers['cache-control']).toContain('no-store');
      const rows=response.json() as {id:string}[];expect(rows.some(row=>row.id===id)).toBe(true);
      expect(response.body).not.toContain('private-owner');expect(response.body).not.toContain('private-coordinator');
      expect(response.body).not.toContain('9812345678');expect(response.body).not.toContain('never-public-source');
    }
  });
  it('uses explicit non-PII public detail projections without owner/contact/internal fields',async()=>{
    const f=await fixture();
    for(const path of ['/profiles/business/'+f.company,'/profiles/institution/'+f.institution,'/jobs/'+f.job]){
      const response=await app.inject({method:'GET',url:path});expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toContain('no-store');
      const data=response.json() as Record<string,unknown>;
      for(const key of ['phone','email','contactPhone','contactEmail','principalName','contactPerson','userId','source','createdBy','updatedBy'])expect(data).not.toHaveProperty(key);
      expect(response.body).not.toContain('never-public-source');
    }
  });
  it.each(['invited','disabled','erased','unpublished'])('hides %s owners on public details and CMS',async state=>{
    const f=await fixture(state);
    for(const path of ['/profiles/business/'+f.company,'/profiles/institution/'+f.institution,'/profiles/institution/'+f.institution+'/cms','/jobs/'+f.job]){
      expect((await app.inject({method:'GET',url:path})).statusCode).toBe(404);
    }
  });
  it('keeps job search on public projections rather than a private table/RPC fallback',async()=>{
    const f=await fixture();await fixture('unpublished');
    const response=await app.inject({method:'GET',url:'/jobs?keyword='+marker+'&limit=100'});expect(response.statusCode).toBe(200);
    const body=response.json() as {jobs:{id:string}[]};expect(body.jobs.some(row=>row.id===f.job)).toBe(true);
    for(const item of body.jobs){expect(item).not.toHaveProperty('source');expect(item).not.toHaveProperty('updatedAt');}
    const hidden=(await db.query('select j.id from public.jobs j join public.business_profiles b on b.user_id=j.employer_id where not b.is_published and j.title like $1',[marker+'%'])).rows.map(row=>row.id);
    expect(body.jobs.some(row=>hidden.includes(row.id))).toBe(false);
  });
  it('publishes only on explicit authenticated owner intent and preserves it on ordinary edits',async()=>{
    const f=await fixture('unpublished'),jwt=app.get(JwtService);
    const token=await jwt.signAccessToken(f.employer,0,{role:'employer',status:'active'});
    const body={companyName:marker+' published',ownershipType:'Private Limited',companySize:'Small',sector:'Technology',address:'Fixture Street 12',city:'Pune',district:'Pune',isPublished:true};
    const updated=await app.inject({method:'PUT',url:'/profiles/business/me',headers:{authorization:'Bearer '+token},payload:body});expect(updated.statusCode).toBe(200);
    expect((await db.query('select is_published from public.business_profiles where id=$1',[f.company])).rows).toEqual([{is_published:true}]);
    expect((await app.inject({method:'GET',url:'/profiles/business/'+f.company})).statusCode).toBe(200);
    const {isPublished:flag,...edit}=body; expect(flag).toBe(true);
    expect((await app.inject({method:'PUT',url:'/profiles/business/me',headers:{authorization:'Bearer '+token},payload:edit})).statusCode).toBe(200);
    expect((await db.query('select is_published from public.business_profiles where id=$1',[f.company])).rows).toEqual([{is_published:true}]);
  });
  it('does not expose private roster routes or admit a phone-derived slug',async()=>{
    expect((await app.inject({method:'GET',url:'/profiles/institution/students'})).statusCode).toBe(401);
    expect((await app.inject({method:'GET',url:'/profiles/business/usr_9876543210'})).statusCode).toBe(404);
  });
  it('sanitises public CMS while unpublished owners retain authenticated editing',async()=>{
    const f=await fixture('unpublished');
    const token=await app.get(JwtService).signAccessToken(f.coordinator,0,{role:'intermediary',status:'active'});
    const cms={departments:[{id:'department',name:'Engineering',hodName:'Published faculty',contactEmail:'private@example.invalid',contactPhone:'9812345678'}]};
    expect((await app.inject({method:'PUT',url:'/profiles/institution/cms',headers:{authorization:'Bearer '+token},payload:cms})).statusCode).toBe(200);
    const owned=await app.inject({method:'GET',url:'/profiles/institution/cms',headers:{authorization:'Bearer '+token}});
    expect(owned.statusCode).toBe(200);expect(owned.body).toContain('private@example.invalid');
    expect((await app.inject({method:'GET',url:'/profiles/institution/'+f.institution+'/cms'})).statusCode).toBe(404);
    const profile={institutionName:'Published institution',affiliation:'Fixture Board',contactPerson:'Coordinator',address:'Fixture Campus Address',isPublished:true};
    expect((await app.inject({method:'PUT',url:'/profiles/institution/me',headers:{authorization:'Bearer '+token},payload:profile})).statusCode).toBe(200);
    const response=await app.inject({method:'GET',url:'/profiles/institution/'+f.institution+'/cms'});
    expect(response.statusCode).toBe(200);expect(response.body).toContain('Published faculty');
    expect(response.body).not.toContain('private@example.invalid');expect(response.body).not.toContain('9812345678');
  });
  it('scopes company search to its public profile slug and denies direct client RPC execution',async()=>{
    const f=await fixture(),other=await fixture();
    const result=await app.inject({method:'GET',url:'/jobs?companyId='+f.company});
    expect(result.statusCode).toBe(200);const ids=result.json().jobs.map((j:{id:string})=>j.id);
    expect(ids).toContain(f.job);expect(ids).not.toContain(other.job);
    const anon=createClient(process.env['SUPABASE_URL']!,process.env['SUPABASE_ANON_KEY']!);
    expect((await anon.rpc('search_public_jobs',{})).error?.code).toBe('42501');
    expect((await anon.rpc('read_public_institution_cms',{p_id:f.institution})).error?.code).toBe('42501');
  });

  it('public job detail/search carry the company profile slug used by SSR links and JobPosting metadata',async()=>{
    const f=await fixture();
    const detail=await app.inject({method:'GET',url:'/jobs/'+f.job});expect(detail.statusCode).toBe(200);
    const payload=detail.json() as {companyId:string;companyName:string};expect(payload.companyId).toBe(f.company);expect(payload.companyName).toBe(marker+' company');
    const mapped=mapApiJobToJobItem(detail.json());expect(mapped.companyId).toBe(f.company);expect(mapped.companyName).toBe(payload.companyName);
    expect(Object.keys(detail.json()).sort()).toEqual(['id','employerId','title','description','category','employmentType','experienceLevel','minPay','maxPay','city','district','state','openings','skills','expiryDate','isFeatured','featuredUntil','createdAt','companyId','companyName','isActive','isPromoted'].sort());
    const anon=createClient(process.env['SUPABASE_URL']!,process.env['SUPABASE_ANON_KEY']!);
    expect((await anon.rpc('read_public_job',{p_id:f.job})).error?.code).toBe('42501');

    expect((await app.inject({method:'GET',url:'/profiles/business/'+payload.companyId})).statusCode).toBe(200);
    const search=await app.inject({method:'GET',url:'/jobs?companyId='+f.company});expect(search.statusCode).toBe(200);
    const rows=search.json().jobs as {id:string;companyId:string;companyName:string}[];
    expect(rows.find(row=>row.id===f.job)).toMatchObject({companyId:f.company,companyName:marker+' company'});
  });

});
