import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { USER_REPOSITORY, IUserRepository } from '../src/database/repositories/user.repository.js';
import type { UserRow } from '@indian-job-portal/database';

describe('ProfilesController (e2e) - Issues #9, #10, #11', () => {
  let app: NestFastifyApplication;
  let seekerUser: UserRow;
  let businessUser: UserRow;
  let instUser: UserRow;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const userRepo = app.get<IUserRepository>(USER_REPOSITORY);
    const ts = Date.now().toString().slice(-6);
    seekerUser = await userRepo.create({ phone: `91${ts}01`, role: 'job_seeker' });
    businessUser = await userRepo.create({ phone: `91${ts}02`, role: 'employer' });
    instUser = await userRepo.create({ phone: `91${ts}03`, role: 'intermediary' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('PUT /profiles/seeker/me & GET /profiles/seeker/:id - enforces DPDP consent and STRIPS phone/email from public employer view (Hard Invariant #1 & #8)', async () => {
    // 1. Create/Update Seeker Profile
    const updateRes = await app.inject({
      method: 'PUT',
      url: '/profiles/seeker/me',
      headers: { 'x-user-id': seekerUser.id, 'x-user-role': 'job_seeker' },
      payload: {
        fullName: 'Anita Sharma',
        seekerType: 'student',
        aadhaarLastFour: '9876',
        dpdpConsentGiven: true,
        skills: ['Tally', 'Accounting'],
        preferredCategories: ['white'],
        city: 'Indore',
      },
    });

    expect(updateRes.statusCode).toBe(200);
    const updated = JSON.parse(updateRes.payload);
    expect(updated.completenessScore).toBeGreaterThanOrEqual(60);
    expect(updated.id).toBeDefined();
    expect(updated.phone).toBe(seekerUser.phone);
    expect(updated.phone).not.toBe('9876543210');

    // 2. Public / Employer view of candidate profile
    const publicRes = await app.inject({
      method: 'GET',
      url: `/profiles/seeker/${updated.id}`,
    });

    expect(publicRes.statusCode).toBe(200);
    const publicData = JSON.parse(publicRes.payload);

    // Hard Invariant #1 check: Phone and email MUST NEVER be exposed!
    expect(publicData.phone).toBeUndefined();
    expect(publicData.email).toBeUndefined();
    expect(publicData.aadhaarLastFour).toBeUndefined();
    expect(publicData.fullName).toBe('Anita Sharma');
  });

  it('GET & PUT /profiles/business/me & /qr - updates business profile and generates QR code (EMP-01, EMP-03)', async () => {
    const updateRes = await app.inject({
      method: 'PUT',
      url: '/profiles/business/me',
      headers: { 'x-user-id': businessUser.id, 'x-user-role': 'employer' },
      payload: {
        companyName: 'Ujjain Garments MSME',
        ownershipType: 'Proprietorship',
        companySize: 'Micro',
        sector: 'Textiles',
        address: 'Plot 4, Ujjain Industrial Area',
        city: 'Ujjain',
        district: 'Ujjain',
      },
    });

    expect(updateRes.statusCode).toBe(200);
    const busProfile = JSON.parse(updateRes.payload);

    const qrRes = await app.inject({
      method: 'GET',
      url: `/profiles/business/${busProfile.id}/qr`,
    });

    expect(qrRes.statusCode).toBe(200);
    const qrData = JSON.parse(qrRes.payload);
    expect(qrData.qrDataUrl).toContain('data:image/png;base64');
  });

  it('GET & PUT /profiles/institution/me - manages basic institution profile (INT-01)', async () => {
    const updateRes = await app.inject({
      method: 'PUT',
      url: '/profiles/institution/me',
      headers: { 'x-user-id': instUser.id, 'x-user-role': 'intermediary' },
      payload: {
        institutionName: 'MP Engineering College',
        affiliation: 'RGPV Bhopal',
        address: 'Bhopal Road',
        contactPerson: 'Placement Cell Dean',
      },
    });

    expect(updateRes.statusCode).toBe(200);
    const instProfile = JSON.parse(updateRes.payload);
    expect(instProfile.institutionName).toBe('MP Engineering College');
  });

  it('GET /profiles/institution/students - returns enrolled student roster with role authorization (INT-01, Invariant #5)', async () => {
    // 1. As an institution/intermediary, fetch student roster
    const res = await app.inject({
      method: 'GET',
      url: '/profiles/institution/students',
      headers: { 'x-user-id': instUser.id, 'x-user-role': 'intermediary' },
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);
    expect(Array.isArray(data)).toBe(true);

    // 2. Role authorization check: non-institution (e.g. job_seeker) should receive 403 Forbidden
    const forbiddenRes = await app.inject({
      method: 'GET',
      url: '/profiles/institution/students',
      headers: { 'x-user-id': seekerUser.id, 'x-user-role': 'job_seeker' },
    });

    expect(forbiddenRes.statusCode).toBe(403);
  });

  it('returns 404 and no fabricated fallbacks for non-existent profiles', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    const seekerMeRes = await app.inject({
      method: 'GET',
      url: '/profiles/seeker/me',
      headers: { 'x-user-id': nonExistentId, 'x-user-role': 'job_seeker' },
    });
    expect(seekerMeRes.statusCode).toBe(404);

    const seekerUpdateRes = await app.inject({
      method: 'PUT',
      url: '/profiles/seeker/me',
      headers: { 'x-user-id': nonExistentId, 'x-user-role': 'job_seeker' },
      payload: {
        fullName: 'Unknown Person',
        seekerType: 'individual',
        dpdpConsentGiven: true,
        skills: ['Tally'],
        preferredCategories: ['white'],
        city: 'Indore',
      },
    });
    expect(seekerUpdateRes.statusCode).toBe(404);

    const busMeRes = await app.inject({
      method: 'GET',
      url: '/profiles/business/me',
      headers: { 'x-user-id': nonExistentId, 'x-user-role': 'employer' },
    });
    expect(busMeRes.statusCode).toBe(404);

    const busPublicRes = await app.inject({
      method: 'GET',
      url: `/profiles/business/${nonExistentId}`,
    });
    expect(busPublicRes.statusCode).toBe(404);

    const instMeRes = await app.inject({
      method: 'GET',
      url: '/profiles/institution/me',
      headers: { 'x-user-id': nonExistentId, 'x-user-role': 'intermediary' },
    });
    expect(instMeRes.statusCode).toBe(404);
  });
});
