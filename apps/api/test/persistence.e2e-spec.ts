import { describe, it, expect } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { AppModule } from '../src/app.module.js';
import { PersistentDatabaseStore } from '../src/database/supabase.provider.js';
import { JobRepository } from '../src/database/repositories/job.repository.js';
import { UserRepository } from '../src/database/repositories/user.repository.js';

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

  describe('Ticket 07: Complete Production Database Cutover & Mock Decommissioning', () => {
    it('strictly prohibits all PersistentDatabaseStore reads and writes in production mode', () => {
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';
      try {
        const store = PersistentDatabaseStore.getInstance();
        expect(() => store.save()).toThrow(/disabled in production/);
        expect(() => store.getTable('jobs')).toThrow(/prohibited in production mode/);
        expect(() => store.setRow('jobs', 'j_test', {})).toThrow(/prohibited in production mode/);
        expect(() => store.deleteRow('jobs', 'j_test')).toThrow(/prohibited in production mode/);
        expect(() => store.clearTable('jobs')).toThrow(/prohibited in production mode/);
      } finally {
        process.env['NODE_ENV'] = originalEnv;
      }
    });

    it('fails closed with InternalServerErrorException (500) when Supabase fails in production mode without disk fallback', async () => {
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';
      try {
        // Mock Supabase client that simulates network or database failure
        const mockFailingSupabase = {
          from: () => ({
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: { message: 'Connection refused: connection to server at "postgres.production" failed' },
                }),
              }),
            }),
            insert: async () => ({
              error: { message: 'Connection pool exhausted' },
            }),
            upsert: async () => ({
              error: { message: 'Connection pool exhausted' },
            }),
          }),
        } as unknown as SupabaseClient;

        const jobRepo = new JobRepository(mockFailingSupabase, false);
        const userRepo = new UserRepository(mockFailingSupabase);

        // 1. Assert findById throws 500 InternalServerErrorException rather than falling back to local files
        await expect(jobRepo.findById('job_test_fail_closed')).rejects.toThrow(InternalServerErrorException);
        await expect(userRepo.findById('usr_test_fail_closed')).rejects.toThrow(InternalServerErrorException);

        // 2. Assert save throws 500 InternalServerErrorException on DB error rather than pretending local success
        await expect(
          userRepo.save({
            id: 'usr_fail',
            phone: '9876543210',
            email: 'test@example.com',
            role: 'job_seeker',
            status: 'active',
            source: 'web',
            created_by: null,
            updated_by: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        ).rejects.toThrow(InternalServerErrorException);
      } finally {
        process.env['NODE_ENV'] = originalEnv;
      }
    });

    it('returns authentic null/404 for non-existent entities without synthetic seeds in production', async () => {
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';
      try {
        const mockCleanSupabase = {
          from: () => ({
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        } as unknown as SupabaseClient;

        const jobRepo = new JobRepository(mockCleanSupabase, false);
        const userRepo = new UserRepository(mockCleanSupabase);

        // Authentic closed lookup: 0 matching records yields genuine null
        const job = await jobRepo.findById('job-non-existent-999');
        expect(job).toBeNull();

        const user = await userRepo.findById('usr-non-existent-999');
        expect(user).toBeNull();
      } finally {
        process.env['NODE_ENV'] = originalEnv;
      }
    });
  });
});
