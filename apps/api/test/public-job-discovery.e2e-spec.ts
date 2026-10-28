import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { JobRepository } from '../src/database/repositories/job.repository.js';
import { PersistentDatabaseStore } from '../src/database/supabase.provider.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, JobRow } from '@indian-job-portal/database';

describe('Ticket 2: Public Job Discovery & Live Database Search (E2E Integration)', () => {
  let app: NestFastifyApplication;
  let jobRepository: JobRepository;
  const store = PersistentDatabaseStore.getInstance();

  beforeAll(async () => {
    const scratchFiles = [
      path.resolve(process.cwd(), '.scratch/db-persistence.json'),
      path.resolve(process.cwd(), 'apps/api/.scratch/db-persistence.json'),
    ];
    for (const f of scratchFiles) {
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch {
          // ignore
        }
      }
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    jobRepository = app.get(JobRepository);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // Clear jobs table in persistent store between tests
    store.clearTable('jobs');
  });

  describe('1. Decommission All Synthetic Data Paths', () => {
    it('returns genuine empty state when 0 records match (zero leakage of sample strings)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/jobs',
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data).toEqual({ jobs: [], total: 0 });

      // Verify no sample jobs or synthetic titles are leaked into the output
      expect(res.payload).not.toContain('Warehouse Associate');
      expect(res.payload).not.toContain('Solar Panel Technician');
      expect(res.payload).not.toContain('SAMPLE_JOBS');
    });

    it('strictly fails closed with 404 NotFoundException for non-existent IDs (no mock seed generators)', async () => {
      // Test legacy synthetic prefix `job-` which previously returned a generated mock
      const res1 = await app.inject({
        method: 'GET',
        url: '/jobs/job-non-existent-999',
      });

      expect(res1.statusCode).toBe(404);
      const data1 = JSON.parse(res1.payload);
      expect(data1.statusCode).toBe(404);
      expect(data1.message).toBe('Job not found');

      // Test standard UUID that does not exist
      const res2 = await app.inject({
        method: 'GET',
        url: '/jobs/00000000-0000-0000-0000-000000000000',
      });

      expect(res2.statusCode).toBe(404);
      const data2 = JSON.parse(res2.payload);
      expect(data2.statusCode).toBe(404);
      expect(data2.message).toBe('Job not found');
    });

    it('eliminates silent catch fallback to disk persistence when database connection drops', async () => {
      // Create a mocked Supabase client that fails with connection/network error
      interface MockQueryBuilder {
        eq: () => MockQueryBuilder;
        ilike: () => MockQueryBuilder;
        or: () => MockQueryBuilder;
        gte: () => MockQueryBuilder;
        order: () => MockQueryBuilder;
        range: () => Promise<{ data: null; count: null; error: { message: string; details: string } }>;
        maybeSingle: () => Promise<{ data: null; error: { message: string; details: string } }>;
      }

      const failingQueryBuilder: MockQueryBuilder = {
        eq: () => failingQueryBuilder,
        ilike: () => failingQueryBuilder,
        or: () => failingQueryBuilder,
        gte: () => failingQueryBuilder,
        order: () => failingQueryBuilder,
        range: async () => ({
          data: null,
          count: null,
          error: { message: 'Database timeout', details: 'ETIMEDOUT' },
        }),
        maybeSingle: async () => ({
          data: null,
          error: { message: 'Connection terminated unexpectedly: PG_CONNECTION_DROP', details: 'Socket closed' },
        }),
      };

      const failingSupabase = {
        from: () => ({
          select: () => failingQueryBuilder,
        }),
        rpc: async () => ({
          data: null,
          error: { message: 'RPC connection drop: search_jobs failed' },
        }),
      } as unknown as SupabaseClient<Database>;

      // Explicitly enforce live production database mode via constructor injection
      const strictRepo = new JobRepository(failingSupabase, false);

      // Verify findById strictly throws InternalServerErrorException without disk fallback
      await expect(strictRepo.findById('test-db-drop-id')).rejects.toThrow('DATABASE_ERROR');

      // Verify findMany strictly throws InternalServerErrorException without disk fallback
      await expect(strictRepo.findMany({})).rejects.toThrow('DATABASE_ERROR');
    });
  });

  describe('2. Case-Insensitive Technical Trade Skills Search & Exact Count Semantics', () => {
    beforeEach(async () => {
      // Seed realistic technical trade skill jobs
      const jobsToSeed: JobRow[] = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          employer_id: 'usr_emp_01',
          title: 'Senior CNC Machine Operator',
          description: 'Looking for expert CNC machine operator for automotive component machining.',
          category: 'blue',
          city: 'Indore',
          openings: 3,
          is_active: true,
          created_at: new Date(Date.now() - 30000).toISOString(),
          updated_at: new Date().toISOString(),
          min_pay: 22000,
          max_pay: 30000,
          district: 'Indore',
          state: 'Madhya Pradesh',
          skills: ['CNC', 'Lathe', 'Tooling'],
          employment_type: 'Full-time',
          is_featured: false,
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          employer_id: 'usr_emp_02',
          title: 'Precision VMC Programmer & Operator',
          description: 'Aerospace manufacturing unit requires skilled VMC machine setup technician.',
          category: 'blue',
          city: 'Pune',
          openings: 2,
          is_active: true,
          created_at: new Date(Date.now() - 20000).toISOString(),
          updated_at: new Date().toISOString(),
          min_pay: 28000,
          max_pay: 40000,
          district: 'Pune',
          state: 'Maharashtra',
          skills: ['VMC', 'CAD/CAM', 'Milling'],
          employment_type: 'Full-time',
          is_featured: true,
          featured_until: new Date(Date.now() + 86400000).toISOString(),
        },
        {
          id: '33333333-3333-3333-3333-333333333333',
          employer_id: 'usr_emp_03',
          title: 'Tally Prime GST Accountant',
          description: 'MSME logistics enterprise requires junior accountant proficient in Tally ERP 9 and GST.',
          category: 'white',
          city: 'Indore',
          openings: 1,
          is_active: true,
          created_at: new Date(Date.now() - 10000).toISOString(),
          updated_at: new Date().toISOString(),
          min_pay: 18000,
          max_pay: 25000,
          district: 'Indore',
          state: 'Madhya Pradesh',
          skills: ['Tally', 'GST', 'E-Way Bills'],
          employment_type: 'Full-time',
          is_featured: false,
        },
        {
          id: '44444444-4444-4444-4444-444444444444',
          employer_id: 'usr_emp_04',
          title: 'Industrial Maintenance Mechanical Fitter',
          description: 'Heavy machinery plant requires experienced industrial fitter for hydraulics and pneumatics.',
          category: 'blue',
          city: 'Ahmedabad',
          openings: 4,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          min_pay: 20000,
          max_pay: 26000,
          district: 'Ahmedabad',
          state: 'Gujarat',
          skills: ['Fitter', 'Hydraulics', 'Pneumatics'],
          employment_type: 'Full-time',
          is_featured: false,
        },
      ];

      for (const j of jobsToSeed) {
        await jobRepository.create(j);
      }
    });

    it('matches trade skill "CNC" case-insensitively without dropouts', async () => {
      // Lowercase query
      const resLower = await app.inject({ method: 'GET', url: '/jobs?keyword=cnc' });
      expect(resLower.statusCode).toBe(200);
      const dataLower = JSON.parse(resLower.payload);
      expect(dataLower.total).toBe(1);
      expect(dataLower.jobs[0].title).toBe('Senior CNC Machine Operator');

      // Uppercase query
      const resUpper = await app.inject({ method: 'GET', url: '/jobs?keyword=CNC' });
      expect(resUpper.statusCode).toBe(200);
      const dataUpper = JSON.parse(resUpper.payload);
      expect(dataUpper.total).toBe(1);
      expect(dataUpper.jobs[0].title).toBe('Senior CNC Machine Operator');
    });

    it('matches trade skill "VMC" case-insensitively', async () => {
      const res = await app.inject({ method: 'GET', url: '/jobs?keyword=vmc' });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.total).toBe(1);
      expect(data.jobs[0].title).toBe('Precision VMC Programmer & Operator');
    });

    it('matches trade skill "Tally" case-insensitively', async () => {
      const res = await app.inject({ method: 'GET', url: '/jobs?keyword=TALLY' });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.total).toBe(1);
      expect(data.jobs[0].title).toBe('Tally Prime GST Accountant');
    });

    it('matches trade skill "Fitter" case-insensitively', async () => {
      const res = await app.inject({ method: 'GET', url: '/jobs?keyword=fitter' });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.total).toBe(1);
      expect(data.jobs[0].title).toBe('Industrial Maintenance Mechanical Fitter');
    });

    it('enforces deterministic pagination with featured-first ordering and exact count semantics', async () => {
      // Total 4 active jobs
      const resPage1 = await app.inject({
        method: 'GET',
        url: '/jobs?limit=2&offset=0',
      });

      expect(resPage1.statusCode).toBe(200);
      const page1 = JSON.parse(resPage1.payload);
      expect(page1.total).toBe(4);
      expect(page1.jobs.length).toBe(2);

      // The featured job (VMC Programmer) must rank first
      expect(page1.jobs[0].title).toBe('Precision VMC Programmer & Operator');
      expect(page1.jobs[0].isFeatured).toBe(true);
      expect(page1.jobs[0].isPromoted).toBe(true);

      // Next page must return exactly the remaining 2 jobs without duplication
      const resPage2 = await app.inject({
        method: 'GET',
        url: '/jobs?limit=2&offset=2',
      });

      expect(resPage2.statusCode).toBe(200);
      const page2 = JSON.parse(resPage2.payload);
      expect(page2.total).toBe(4);
      expect(page2.jobs.length).toBe(2);

      const page1Ids = page1.jobs.map((j: JobRow) => j.id);
      const page2Ids = page2.jobs.map((j: JobRow) => j.id);
      // Zero overlap between consecutive pages
      for (const id of page2Ids) {
        expect(page1Ids).not.toContain(id);
      }
    });
  });

  describe('3. Protocol & Edge Cache Hardening', () => {
    it('sets public edge cache headers on GET /jobs', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/jobs',
      });

      expect(res.statusCode).toBe(200);
      const cacheControl = res.headers['cache-control'];
      expect(cacheControl).toBe('public, s-maxage=30, stale-while-revalidate=59');
    });

    it('sets public edge cache headers on GET /jobs/:id for existing records', async () => {
      // Seed a job
      const testJob: JobRow = {
        id: '99999999-9999-9999-9999-999999999999',
        employer_id: 'usr_emp_cache_test',
        title: 'Cache Header Verification Job',
        description: 'Verifying s-maxage and stale-while-revalidate headers.',
        category: 'white',
        city: 'Indore',
        openings: 1,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await jobRepository.create(testJob);

      const res = await app.inject({
        method: 'GET',
        url: `/jobs/${testJob.id}`,
      });

      expect(res.statusCode).toBe(200);
      const cacheControl = res.headers['cache-control'];
      expect(cacheControl).toBe('public, s-maxage=30, stale-while-revalidate=59');
      const data = JSON.parse(res.payload);
      expect(data.id).toBe(testJob.id);
      expect(data.title).toBe(testJob.title);
    });
  });
});
