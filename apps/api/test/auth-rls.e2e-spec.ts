import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';

describe('T-02: Row-Level Security (RLS) & API Auth Guards (E2E)', () => {
  let app: NestFastifyApplication;

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

  it('rejects unauthenticated requests to protected endpoints with 401 Unauthorized', async () => {
    // 1. POST /jobs without auth
    const createJobRes = await app.inject({
      method: 'POST',
      url: '/jobs',
      payload: {
        title: 'Unauthenticated Job Posting',
        description: 'Should be rejected',
        category: 'white',
        minPay: 10000,
        maxPay: 20000,
        city: 'Indore',
        district: 'Indore',
        openings: 1,
      },
    });
    expect(createJobRes.statusCode).toBe(401);

    // 2. GET /profiles/seeker/me without auth
    const getProfileMeRes = await app.inject({
      method: 'GET',
      url: '/profiles/seeker/me',
    });
    expect(getProfileMeRes.statusCode).toBe(401);

    // 3. PUT /profiles/seeker/me without auth
    const updateProfileMeRes = await app.inject({
      method: 'PUT',
      url: '/profiles/seeker/me',
      payload: {
        fullName: 'Hacker Name',
        seekerType: 'individual',
        dpdpConsentGiven: true,
      },
    });
    expect(updateProfileMeRes.statusCode).toBe(401);

    // 4. PUT /jobs/:id without auth
    const updateJobRes = await app.inject({
      method: 'PUT',
      url: '/jobs/job_dummy_123',
      payload: { title: 'Modified Job Title' },
    });
    expect(updateJobRes.statusCode).toBe(401);
  });

  it('allows unauthenticated access to public discovery endpoints', async () => {
    // Public job listings
    const publicJobsRes = await app.inject({
      method: 'GET',
      url: '/jobs',
    });
    expect(publicJobsRes.statusCode).toBe(200);
  });

  it('prevents User A from modifying or deleting User B job (Enforced at API & Tenancy layers)', async () => {
    const userB = 'usr_employer_b_owner';
    const userA = 'usr_employer_a_intruder';

    // 1. User B creates a job posting
    const createRes = await app.inject({
      method: 'POST',
      url: '/jobs',
      headers: { 'x-user-id': userB },
      payload: {
        title: 'User B Exclusive Job',
        description: 'Only User B can edit this job',
        category: 'white',
        minPay: 30000,
        maxPay: 40000,
        city: 'Bhopal',
        district: 'Bhopal',
        openings: 2,
        skills: ['Management'],
      },
    });
    expect(createRes.statusCode).toBe(201);
    const job = JSON.parse(createRes.payload);

    // 2. User A attempts to modify User B's job posting
    const tamperRes = await app.inject({
      method: 'PUT',
      url: `/jobs/${job.id}`,
      headers: { 'x-user-id': userA },
      payload: {
        title: 'Tampered by User A',
      },
    });
    // Should be rejected (400 or 403)
    expect([400, 403]).toContain(tamperRes.statusCode);

    // 3. User A attempts to delete User B's job posting
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/jobs/${job.id}`,
      headers: { 'x-user-id': userA },
    });
    expect([400, 403]).toContain(deleteRes.statusCode);
  });

  it('prevents User A from viewing User B private job applications', async () => {
    const userB = 'usr_employer_b_owner';
    const userA = 'usr_employer_a_intruder';
    const candidate = 'usr_candidate_c';

    // 1. User B creates job
    const createJobRes = await app.inject({
      method: 'POST',
      url: '/jobs',
      headers: { 'x-user-id': userB },
      payload: {
        title: 'Confidential Executive Role',
        description: 'Applications are private to User B',
        category: 'white',
        minPay: 50000,
        maxPay: 80000,
        city: 'Indore',
        district: 'Indore',
        openings: 1,
      },
    });
    expect(createJobRes.statusCode).toBe(201);
    const job = JSON.parse(createJobRes.payload);

    // 2. Candidate applies
    const applyRes = await app.inject({
      method: 'POST',
      url: `/jobs/${job.id}/apply`,
      headers: { 'x-user-id': candidate },
    });
    expect(applyRes.statusCode).toBe(201);

    // 3. User A attempts to view applications for User B's job
    const intruderRes = await app.inject({
      method: 'GET',
      url: `/jobs/${job.id}/applications`,
      headers: { 'x-user-id': userA },
    });
    expect([400, 403]).toContain(intruderRes.statusCode);
  });
});
