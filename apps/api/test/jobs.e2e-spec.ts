import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';

describe('JobsController (e2e) - Issues #13, #14, #15', () => {
  let app: NestFastifyApplication;
  let createdJobId: string;
  let applicationId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /jobs & GET /jobs - creates job posting and searches by keyword/category (JOB-01, JOB-02)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/jobs',
      headers: { 'x-user-id': 'usr_employer_55' },
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
      headers: { 'x-user-id': 'usr_candidate_77' },
    });

    expect(applyRes.statusCode).toBe(201);
    const appRecord = JSON.parse(applyRes.payload);
    expect(appRecord.id).toBeDefined();
    applicationId = appRecord.id;

    // Employer views applications
    const appsRes = await app.inject({
      method: 'GET',
      url: `/jobs/${createdJobId}/applications`,
      headers: { 'x-user-id': 'usr_employer_55' },
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
      headers: { 'x-user-id': 'usr_employer_55' },
      payload: { status: 'shortlisted' },
    });

    expect(statusRes.statusCode).toBe(200);
    const updatedApp = JSON.parse(statusRes.payload);
    expect(updatedApp.status).toBe('shortlisted');
  });
});
