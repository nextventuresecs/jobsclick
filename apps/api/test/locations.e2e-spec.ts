import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import type { DistrictRow, PincodeRow, StateRow, UserRow } from '@indian-job-portal/database';
import { AppModule } from '../src/app.module.js';
import { PersistentDatabaseStore } from '../src/database/supabase.provider.js';

describe('Locations API & Profile/Job Location Validation (JS-02, EMP-01, JOB-01, INT-01)', () => {
  let app: NestFastifyApplication;
  const store = PersistentDatabaseStore.getInstance();

  const mpIndoreId = '11111111-1111-4111-8111-111111111111';
  const mpDewasId = '22222222-2222-4222-8222-222222222222';
  const mhPuneId = '33333333-3333-4333-8333-333333333333';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    store.clearTable('states');
    store.clearTable('districts');
    store.clearTable('pincodes');
    store.clearTable('users');
    store.clearTable('job_seeker_profiles');
    store.clearTable('business_profiles');
    store.clearTable('institution_profiles');
    store.clearTable('jobs');

    const states: StateRow[] = [
      { lgd_code: 23, name_en: 'Madhya Pradesh', name_hi: null, is_ut: false },
      { lgd_code: 27, name_en: 'Maharashtra', name_hi: null, is_ut: false },
    ];
    for (const s of states) {
      store.setRow('states', String(s.lgd_code), s);
    }

    const districts: DistrictRow[] = [
      {
        id: mpIndoreId,
        lgd_code: 406,
        state_code: 23,
        name_en: 'Indore',
        name_hi: 'इंदौर',
        is_active: true,
        source: 'lgd',
        effective_from: null,
        notes: null,
      },
      {
        id: mpDewasId,
        lgd_code: 404,
        state_code: 23,
        name_en: 'Dewas',
        name_hi: null,
        is_active: true,
        source: 'lgd',
        effective_from: null,
        notes: null,
      },
      {
        id: mhPuneId,
        lgd_code: 490,
        state_code: 27,
        name_en: 'Pune',
        name_hi: null,
        is_active: true,
        source: 'lgd',
        effective_from: null,
        notes: null,
      },
    ];
    for (const d of districts) {
      store.setRow('districts', d.id, d);
    }

    const pins: PincodeRow[] = [
      {
        pincode: '452001',
        state_code: 23,
        district_id: mpIndoreId,
        ambiguous: false,
        candidate_district_ids: [],
      },
      {
        pincode: '452010',
        state_code: 23,
        district_id: null,
        ambiguous: true,
        candidate_district_ids: [mpIndoreId, mpDewasId],
      },
    ];
    for (const p of pins) {
      store.setRow('pincodes', p.pincode, p);
    }
  });

  it('serves cached public GET /locations/states and GET /locations/districts?state=', async () => {
    const statesRes = await app.inject({ method: 'GET', url: '/locations/states' });
    expect(statesRes.statusCode).toBe(200);
    expect(statesRes.headers['cache-control']).toContain('public');
    expect(JSON.parse(statesRes.payload)).toEqual({
      states: [
        { lgdCode: 23, nameEn: 'Madhya Pradesh', nameHi: null, isUt: false },
        { lgdCode: 27, nameEn: 'Maharashtra', nameHi: null, isUt: false },
      ],
    });

    const distRes = await app.inject({ method: 'GET', url: '/locations/districts?state=23' });
    expect(distRes.statusCode).toBe(200);
    expect(distRes.headers['cache-control']).toContain('public');
    const distData = JSON.parse(distRes.payload);
    expect(distData.districts.map((d: { nameEn: string }) => d.nameEn)).toEqual(['Dewas', 'Indore']);

    const badDistRes = await app.inject({ method: 'GET', url: '/locations/districts?state=abc' });
    expect(badDistRes.statusCode).toBe(400);
  });

  it('returns districtId on unambiguous PIN and null districtId with candidates on ambiguous PIN', async () => {
    const exactRes = await app.inject({ method: 'GET', url: '/locations/pincode/452001' });
    expect(exactRes.statusCode).toBe(200);
    expect(exactRes.headers['cache-control']).toContain('public');
    const exactBody = JSON.parse(exactRes.payload);
    expect(exactBody.ambiguous).toBe(false);
    expect(exactBody.stateCode).toBe(23);
    expect(exactBody.districtId).toBe(mpIndoreId);

    const ambRes = await app.inject({ method: 'GET', url: '/locations/pincode/452010' });
    expect(ambRes.statusCode).toBe(200);
    const ambBody = JSON.parse(ambRes.payload);
    expect(ambBody.ambiguous).toBe(true);
    expect(ambBody.districtId).toBeNull();
    expect(ambBody.district).toBeNull();
    expect(ambBody.candidates.map((c: { id: string }) => c.id)).toEqual([mpDewasId, mpIndoreId]);

    const badPinRes = await app.inject({ method: 'GET', url: '/locations/pincode/012345' });
    expect(badPinRes.statusCode).toBe(400);

    const missingPinRes = await app.inject({ method: 'GET', url: '/locations/pincode/452099' });
    expect(missingPinRes.statusCode).toBe(404);
  });

  it('validates district belongs to state on seeker, business, institution, and job saves', async () => {
    const seekerUser: UserRow = {
      id: 'usr_loc_seeker',
      phone: '9876543211',
      email: null,
      role: 'job_seeker',
      status: 'active',
      source: 'direct',
      token_version: 0,
      created_by: null,
      updated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const employerUser: UserRow = {
      ...seekerUser,
      id: 'usr_loc_emp',
      phone: '9876543212',
      role: 'employer',
    };
    const instUser: UserRow = {
      ...seekerUser,
      id: 'usr_loc_inst',
      phone: '9876543213',
      role: 'intermediary',
    };
    store.setRow('users', seekerUser.id, seekerUser);
    store.setRow('users', employerUser.id, employerUser);
    store.setRow('users', instUser.id, instUser);

    const seekerHeaders = { authorization: `Bearer jwt_session_${seekerUser.id}_1792520000` };
    const empHeaders = { authorization: `Bearer jwt_session_${employerUser.id}_1792520000` };
    const instHeaders = { authorization: `Bearer jwt_session_${instUser.id}_1792520000` };

    // Mismatch (MP state 23 + MH Pune district) fails with 400 on seeker profile
    const badSeeker = await app.inject({
      method: 'PUT',
      url: '/profiles/seeker/me',
      headers: seekerHeaders,
      payload: {
        fullName: 'Ramesh Kumar',
        city: 'Indore',
        stateCode: 23,
        districtId: mhPuneId,
      },
    });
    expect(badSeeker.statusCode).toBe(400);

    // Valid MP state 23 + Indore district succeeds and persists
    const goodSeeker = await app.inject({
      method: 'PUT',
      url: '/profiles/seeker/me',
      headers: seekerHeaders,
      payload: {
        fullName: 'Ramesh Kumar',
        city: 'Indore',
        district: 'Indore',
        state: 'Madhya Pradesh',
        stateCode: 23,
        districtId: mpIndoreId,
        pincode: '452001',
      },
    });
    expect(goodSeeker.statusCode).toBe(200);
    expect(JSON.parse(goodSeeker.payload)).toMatchObject({
      stateCode: 23,
      districtId: mpIndoreId,
      pincode: '452001',
    });

    // Business profile mismatch fails, valid match succeeds
    const badBiz = await app.inject({
      method: 'PUT',
      url: '/profiles/business/me',
      headers: empHeaders,
      payload: {
        companyName: 'Aarya Precision',
        ownershipType: 'Private Limited',
        companySize: 'Small',
        sector: 'Manufacturing',
        address: '12 Sector B, Pithampur',
        city: 'Indore',
        district: 'Indore',
        stateCode: 23,
        districtId: mhPuneId,
      },
    });
    expect(badBiz.statusCode).toBe(400);

    const goodBiz = await app.inject({
      method: 'PUT',
      url: '/profiles/business/me',
      headers: empHeaders,
      payload: {
        companyName: 'Aarya Precision',
        ownershipType: 'Private Limited',
        companySize: 'Small',
        sector: 'Manufacturing',
        address: '12 Sector B, Pithampur',
        city: 'Indore',
        district: 'Indore',
        state: 'Madhya Pradesh',
        stateCode: 23,
        districtId: mpIndoreId,
        pincode: '452001',
      },
    });
    expect(goodBiz.statusCode).toBe(200);
    expect(JSON.parse(goodBiz.payload)).toMatchObject({
      stateCode: 23,
      districtId: mpIndoreId,
      pincode: '452001',
    });

    // Institution profile mismatch fails, valid match succeeds
    const badInst = await app.inject({
      method: 'PUT',
      url: '/profiles/institution/me',
      headers: instHeaders,
      payload: {
        institutionName: 'Govt ITI Indore',
        affiliation: 'NCVT',
        contactPerson: 'S. Verma',
        address: 'Nanda Nagar, Indore',
        stateCode: 23,
        districtId: mhPuneId,
      },
    });
    expect(badInst.statusCode).toBe(400);

    const goodInst = await app.inject({
      method: 'PUT',
      url: '/profiles/institution/me',
      headers: instHeaders,
      payload: {
        institutionName: 'Govt ITI Indore',
        affiliation: 'NCVT',
        contactPerson: 'S. Verma',
        address: 'Nanda Nagar, Indore',
        city: 'Indore',
        district: 'Indore',
        state: 'Madhya Pradesh',
        stateCode: 23,
        districtId: mpIndoreId,
        pincode: '452001',
      },
    });
    expect(goodInst.statusCode).toBe(200);
    expect(JSON.parse(goodInst.payload)).toMatchObject({
      stateCode: 23,
      districtId: mpIndoreId,
      pincode: '452001',
    });

    // Job create mismatch fails, valid match succeeds
    const badJob = await app.inject({
      method: 'POST',
      url: '/jobs',
      headers: empHeaders,
      payload: {
        title: 'CNC Operator',
        description: 'Operate CNC turning machines in Indore industrial area.',
        category: 'manufacturing',
        minPay: 18000,
        maxPay: 24000,
        city: 'Indore',
        district: 'Indore',
        stateCode: 23,
        districtId: mhPuneId,
      },
    });
    expect(badJob.statusCode).toBe(400);

    const goodJob = await app.inject({
      method: 'POST',
      url: '/jobs',
      headers: empHeaders,
      payload: {
        title: 'CNC Operator',
        description: 'Operate CNC turning machines in Indore industrial area.',
        category: 'manufacturing',
        minPay: 18000,
        maxPay: 24000,
        city: 'Indore',
        district: 'इंदौर',
        state: 'मध्य प्रदेश',
        stateCode: 23,
        districtId: mpIndoreId,
      },
    });
    expect(goodJob.statusCode).toBe(201);
    const createdJob = JSON.parse(goodJob.payload);
    expect(createdJob).toMatchObject({
      stateCode: 23,
      districtId: mpIndoreId,
      district: 'Indore',
      state: 'Madhya Pradesh',
    });

    // Deactivate district after job creation; unrelated salary update still succeeds
    const existingIndore = store.getTable<DistrictRow>('districts')[mpIndoreId]!;
    store.setRow('districts', mpIndoreId, { ...existingIndore, is_active: false });

    const patchSalaryRes = await app.inject({
      method: 'PUT',
      url: `/jobs/${createdJob.id}`,
      headers: empHeaders,
      payload: {
        maxPay: 26000,
      },
    });
    expect(patchSalaryRes.statusCode).toBe(200);
    expect(JSON.parse(patchSalaryRes.payload)).toMatchObject({
      maxPay: 26000,
      districtId: mpIndoreId,
    });

    // Explicitly switching to an inactive district fails
    const badSwitchRes = await app.inject({
      method: 'PUT',
      url: `/jobs/${createdJob.id}`,
      headers: empHeaders,
      payload: {
        stateCode: 23,
        districtId: mpIndoreId,
        maxPay: 27000,
      },
    });
    expect(badSwitchRes.statusCode).toBe(200); // unchanged districtId stays allowed

    const inactiveDistrictId = '44444444-4444-4444-8444-444444444444';
    store.setRow('districts', inactiveDistrictId, {
      id: inactiveDistrictId,
      lgd_code: 999,
      state_code: 23,
      name_en: 'Retired District',
      name_hi: null,
      is_active: false,
      source: 'lgd',
      effective_from: null,
      notes: null,
    });
    const switchToInactiveRes = await app.inject({
      method: 'PUT',
      url: `/jobs/${createdJob.id}`,
      headers: empHeaders,
      payload: {
        stateCode: 23,
        districtId: inactiveDistrictId,
      },
    });
    expect(switchToInactiveRes.statusCode).toBe(400);
  });
});
