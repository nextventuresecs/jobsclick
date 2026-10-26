import { describe, it, expect } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { PersistentDatabaseStore } from '../src/database/supabase.provider.js';

describe('T-01: Database Persistence Across API Restarts (E2E)', () => {
  const createTestApp = async (): Promise<NestFastifyApplication> => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    return app;
  };

  it('persists jobs, seeker profiles, and applications across service reboots', async () => {
    // -------------------------------------------------------------
    // INSTANCE 1: Boot up container instance 1 and write data
    // -------------------------------------------------------------
    const app1 = await createTestApp();

    const employerUserId = 'usr_employer_t01_persistence';
    const seekerUserId = 'usr_seeker_t01_persistence';

    // 1. Create a job posting on instance 1
    const createJobRes = await app1.inject({
      method: 'POST',
      url: '/jobs',
      headers: { 'x-user-id': employerUserId },
      payload: {
        title: 'Senior CNC Machine Operator',
        description: 'Experienced CNC operator for manufacturing plant in Pithampur.',
        category: 'blue',
        minPay: 22000,
        maxPay: 30000,
        city: 'Indore',
        district: 'Dhar',
        openings: 5,
        skills: ['CNC', 'Lathe', 'Tooling'],
      },
    });

    expect(createJobRes.statusCode).toBe(201);
    const createdJob = JSON.parse(createJobRes.payload);
    expect(createdJob.id).toBeDefined();
    const jobId = createdJob.id;

    // 2. Create / update seeker profile on instance 1
    const updateProfileRes = await app1.inject({
      method: 'PUT',
      url: '/profiles/seeker/me',
      headers: { 'x-user-id': seekerUserId },
      payload: {
        fullName: 'Rajesh Kumar Patel',
        seekerType: 'individual',
        aadhaarLastFour: '4567',
        dpdpConsentGiven: true,
        skills: ['CNC', 'Lathe'],
        preferredCategories: ['blue'],
        city: 'Indore',
      },
    });

    expect(updateProfileRes.statusCode).toBe(200);
    const profile = JSON.parse(updateProfileRes.payload);
    expect(profile.id).toBeDefined();
    const seekerProfileId = profile.id;

    // 3. Candidate applies to the job on instance 1
    const applyRes = await app1.inject({
      method: 'POST',
      url: `/jobs/${jobId}/apply`,
      headers: { 'x-user-id': seekerUserId },
    });

    expect(applyRes.statusCode).toBe(201);
    const application = JSON.parse(applyRes.payload);
    expect(application.id).toBeDefined();

    // -------------------------------------------------------------
    // SIMULATE CONTAINER RESTART: Completely close instance 1
    // -------------------------------------------------------------
    await app1.close();

    // -------------------------------------------------------------
    // INSTANCE 2: Boot up a fresh container instance 2
    // -------------------------------------------------------------
    const app2 = await createTestApp();

    try {
      // 4. Verify Job persisted across reboot
      const getJobRes = await app2.inject({
        method: 'GET',
        url: `/jobs/${jobId}`,
      });

      expect(getJobRes.statusCode).toBe(200);
      const fetchedJob = JSON.parse(getJobRes.payload);
      expect(fetchedJob.id).toBe(jobId);
      expect(fetchedJob.title).toBe('Senior CNC Machine Operator');
      expect(fetchedJob.openings).toBe(5);

      // 5. Verify Seeker Profile persisted across reboot (me)
      const getProfileMeRes = await app2.inject({
        method: 'GET',
        url: '/profiles/seeker/me',
        headers: { 'x-user-id': seekerUserId },
      });

      expect(getProfileMeRes.statusCode).toBe(200);
      const fetchedProfile = JSON.parse(getProfileMeRes.payload);
      expect(fetchedProfile.fullName).toBe('Rajesh Kumar Patel');
      expect(fetchedProfile.skills).toContain('CNC');

      // 6. Verify Seeker Profile public view persisted across reboot with PII stripped
      const getPublicProfileRes = await app2.inject({
        method: 'GET',
        url: `/profiles/seeker/${seekerProfileId}`,
      });

      expect(getPublicProfileRes.statusCode).toBe(200);
      const publicProfile = JSON.parse(getPublicProfileRes.payload);
      expect(publicProfile.fullName).toBe('Rajesh Kumar Patel');
      expect(publicProfile.phone).toBeUndefined();
      expect(publicProfile.email).toBeUndefined();

      // 7. Verify Job Applications persisted across reboot for the employer
      const getApplicationsRes = await app2.inject({
        method: 'GET',
        url: `/jobs/${jobId}/applications`,
        headers: { 'x-user-id': employerUserId },
      });

      expect(getApplicationsRes.statusCode).toBe(200);
      const applicationsList = JSON.parse(getApplicationsRes.payload);
      expect(applicationsList.length).toBe(1);
      expect(applicationsList[0].applicantId).toBe(seekerUserId);
      expect(applicationsList[0].applicantProfile.phone).toBeUndefined();
    } finally {
      await app2.close();
    }
  });

  describe('Ticket 05: Fail-Fast in Production Mode', () => {
    it('strictly prohibits PersistentDatabaseStore save() file fallback in production', () => {
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';
      try {
        const store = PersistentDatabaseStore.getInstance();
        expect(() => store.save()).toThrow(/disabled in production/);
      } finally {
        process.env['NODE_ENV'] = originalEnv;
      }
    });
  });
});
