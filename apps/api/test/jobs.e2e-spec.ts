import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import type { UserRow } from '@indian-job-portal/database';
import { AppModule } from '../src/app.module.js';
import { UserRepository } from '../src/database/repositories/user.repository.js';
import { ProfileRepository } from '../src/database/repositories/profile.repository.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { OtpRedisService } from '../src/auth/otp-redis.service.js';

describe('JobsController (e2e) - Issues #13, #14, #15', () => {
  let app: NestFastifyApplication;
  let userRepo: UserRepository;
  let profileRepo: ProfileRepository;
  let jwtService: JwtService;
  let otpRedis: OtpRedisService;

  let employerUser: { id: string; phone: string; token: string };
  let candidateUser: { id: string; phone: string; token: string };

  let createdJobId: string;
  let applicationId: string;

  async function createTestUser(role: UserRow['role']): Promise<{ id: string; phone: string; token: string }> {
    const userId = randomUUID();
    const phone = '98' + Math.floor(10000000 + Math.random() * 90000000);
    await userRepo.save({
      id: userId,
      phone,
      email: null,
      role,
      status: 'active',
      source: 'seed',
      created_by: null,
      updated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await otpRedis.setAuthState(userId, {
      role,
      status: 'active',
      tokenVersion: 0,
    });
    const token = await jwtService.signAccessToken(userId, 0, {
      role,
      status: 'active',
    });
    return { id: userId, phone, token };
  }

  beforeAll(async () => {
    const scratchFiles = [
      path.resolve(process.cwd(), '.scratch/db-persistence.json'),
      path.resolve(process.cwd(), 'apps/api/.scratch/db-persistence.json'),
    ];
    for (const f of scratchFiles) {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {} 
      }
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    userRepo = app.get(UserRepository);
    profileRepo = app.get(ProfileRepository);
    jwtService = app.get(JwtService);
    otpRedis = app.get(OtpRedisService);

    employerUser = await createTestUser('employer');
    candidateUser = await createTestUser('job_seeker');

    await profileRepo.saveSeekerProfile({
      id: randomUUID(),
      user_id: candidateUser.id,
      full_name: 'Rahul Sharma',
      seeker_type: 'individual',
      dpdp_consent_given: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /jobs & GET /jobs - creates job posting and searches by keyword/category (JOB-01, JOB-02)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/jobs',
      headers: { Authorization: `Bearer ${employerUser.token}`, 'x-user-id': employerUser.id },
      payload: {
        title: 'Tally GST Accountant',
        description: 'Need full-time GST accountant for MSME enterprise in Indore.',
        category: 'white',
        minPay: 18000,
        maxPay: 25000,
        city: 'Indore',
        district: 'Indore',
        openings: 2,
        skills: ['Tally', 'GST'],
      },
    });

    expect(createRes.statusCode).toBe(201);
    const createdJob = JSON.parse(createRes.payload);
    expect(createdJob.id).toBeDefined();
    createdJobId = createdJob.id;

    // Filter search test
    const listRes = await app.inject({
      method: 'GET',
      url: '/jobs?keyword=Tally&city=Indore&category=white',
    });

    expect(listRes.statusCode).toBe(200);
    const listData = JSON.parse(listRes.payload);
    expect(listData.jobs.length).toBeGreaterThan(0);
    expect(listData.jobs.some((j: { title: string }) => j.title.includes('Tally'))).toBe(true);
  });

  it('POST /jobs/:id/apply & GET /jobs/:id/applications - handles candidate application and STRIPS phone/email (Hard Invariant #1 & JOB-03)', async () => {
    const applyRes = await app.inject({
      method: 'POST',
      url: `/jobs/${createdJobId}/apply`,
      headers: { Authorization: `Bearer ${candidateUser.token}`, 'x-user-id': candidateUser.id },
    });

    expect(applyRes.statusCode).toBe(201);
    const appRecord = JSON.parse(applyRes.payload);
    expect(appRecord.id).toBeDefined();
    applicationId = appRecord.id;

    // Employer views applications
    const appsRes = await app.inject({
      method: 'GET',
      url: `/jobs/${createdJobId}/applications`,
      headers: { Authorization: `Bearer ${employerUser.token}`, 'x-user-id': employerUser.id },
    });

    expect(appsRes.statusCode).toBe(200);
    const appsList = JSON.parse(appsRes.payload);
    expect(appsList.length).toBeGreaterThan(0);

    const firstApplicant = appsList[0].applicantProfile;
    // Hard Invariant #1 check: Phone and Email MUST NOT be present in applicant profile!
    expect(firstApplicant.phone).toBeUndefined();
    expect(firstApplicant.email).toBeUndefined();
    expect(firstApplicant.fullName).toBeDefined();
  });

  it('PUT /jobs/applications/:appId/status - updates candidate status', async () => {
    const statusRes = await app.inject({
      method: 'PUT',
      url: `/jobs/applications/${applicationId}/status`,
      headers: { Authorization: `Bearer ${employerUser.token}`, 'x-user-id': employerUser.id },
      payload: { status: 'shortlisted' },
    });

    expect(statusRes.statusCode).toBe(200);
    const updatedApp = JSON.parse(statusRes.payload);
    expect(updatedApp.status).toBe('shortlisted');
  });

  it('enforces RBAC on JobsController: job_seeker cannot create jobs or view applications (Issue #2)', async () => {
    // 1. job_seeker cannot create jobs
    const seekerCreateRes = await app.inject({
      method: 'POST',
      url: '/jobs',
      headers: { Authorization: `Bearer ${candidateUser.token}`, 'x-user-id': candidateUser.id },
      payload: {
        title: 'Unauthorized Seeker Job',
        description: 'Should be rejected with 403',
        category: 'white',
        minPay: 15000,
        maxPay: 20000,
        city: 'Indore',
        district: 'Indore',
        openings: 1,
      },
    });
    expect(seekerCreateRes.statusCode).toBe(403);

    // 2. job_seeker cannot view applications
    const seekerAppsRes = await app.inject({
      method: 'GET',
      url: `/jobs/${createdJobId}/applications`,
      headers: { Authorization: `Bearer ${candidateUser.token}`, 'x-user-id': candidateUser.id },
    });
    expect(seekerAppsRes.statusCode).toBe(403);

    // 3. employer cannot apply to a job
    const employerApplyRes = await app.inject({
      method: 'POST',
      url: `/jobs/${createdJobId}/apply`,
      headers: { Authorization: `Bearer ${employerUser.token}`, 'x-user-id': employerUser.id },
    });
    expect(employerApplyRes.statusCode).toBe(403);
  });
});
