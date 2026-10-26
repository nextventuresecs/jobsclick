import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fs from 'node:fs';
import path from 'node:path';
import { AppModule } from '../src/app.module.js';
import { WalletService } from '../src/wallet/wallet.service.js';
import { JobRepository } from '../src/database/repositories/job.repository.js';
import { alertsProcessor } from '../../worker/src/processors/alerts.processor.js';
import type { Job } from 'bullmq';

describe('Ticket T-21: Featured Job Promotions & Search Alerts (JOB-05, JOB-06)', () => {
  let app: NestFastifyApplication;
  let walletService: WalletService;
  let jobRepository: JobRepository;

  const employerId = `emp_t21_${Date.now()}`;
  const otherEmployerId = `emp_other_${Date.now()}`;
  const candidateId = `cand_t21_${Date.now()}`;

  let organicJobId: string;
  let featuredJobId: string;

  beforeAll(async () => {
    const scratchFile = path.resolve(process.cwd(), '.scratch/db-persistence.json');
    if (fs.existsSync(scratchFile)) {
      try {
        fs.unlinkSync(scratchFile);
      } catch {
        // ignore
      }
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    walletService = app.get(WalletService);
    jobRepository = app.get(JobRepository);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Employer Job Promotion & Wallet Deduction (JOB-05, Hard Invariant #7)', () => {
    it('creates standard job vacancy', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/jobs',
        headers: { 'x-user-id': employerId, 'x-user-role': 'employer' },
        payload: {
          title: 'Senior CNC Lathe Operator',
          description: 'Automotive gearbox manufacturer looking for skilled CNC operator.',
          category: 'manufacturing',
          city: 'Indore',
          district: 'Indore',
          minPay: 22000,
          maxPay: 35000,
          openings: 3,
          skills: ['CNC', 'Lathe', 'Fanuc'],
        },
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.payload);
      expect(data.id).toBeDefined();
      expect(data.isPromoted).toBe(false);
      featuredJobId = data.id;
    });

    it('rejects promotion when employer has insufficient credits (Hard Invariant #7)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/jobs/${featuredJobId}/promote`,
        headers: { 'x-user-id': employerId, 'x-user-role': 'employer' },
        payload: {
          durationDays: 7,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('INSUFFICIENT_CREDITS');
    });

    it('rejects promotion by non-owner user (RLS / Authz)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/jobs/${featuredJobId}/promote`,
        headers: { 'x-user-id': otherEmployerId, 'x-user-role': 'employer' },
        payload: {
          durationDays: 7,
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it('successfully promotes job when credits are granted to employer', async () => {
      // Grant credits via ledger
      await walletService.recordTransaction({
        userId: employerId,
        amount: 200,
        reason: 'Employer credit package purchase (WAL-03)',
        actorId: employerId,
      });

      const res = await app.inject({
        method: 'POST',
        url: `/jobs/${featuredJobId}/promote`,
        headers: { 'x-user-id': employerId, 'x-user-role': 'employer' },
        payload: {
          durationDays: 7,
        },
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.payload);
      expect(data.success).toBe(true);
      expect(data.cost).toBe(50);
      expect(data.remainingBalance).toBe(150);
      expect(data.job.isFeatured).toBe(true);
      expect(data.job.isPromoted).toBe(true);
      expect(new Date(data.job.featuredUntil).getTime()).toBeGreaterThan(Date.now());
    });

    it('prevents TOCTOU double-spend under concurrent promotion requests', async () => {
      // Employer has 150 credits remaining. Cost is 50 per 7-day promotion.
      // If we create 4 new jobs and launch 4 concurrent promotions (cost 4 * 50 = 200),
      // exactly 3 should succeed and 1 must fail with INSUFFICIENT_CREDITS.
      const jobIds: string[] = [];
      for (let i = 0; i < 4; i++) {
        const createRes = await app.inject({
          method: 'POST',
          url: '/jobs',
          headers: { 'x-user-id': employerId, 'x-user-role': 'employer' },
          payload: {
            title: `Concurrent Tech Position ${i}`,
            description: 'Testing concurrency safety in job promotion.',
            category: 'technology',
            city: 'Bhopal',
            district: 'Bhopal',
            minPay: 20000,
            maxPay: 30000,
            openings: 1,
            skills: ['NodeJS'],
          },
        });
        jobIds.push(JSON.parse(createRes.payload).id);
      }

      // Fire 4 promotions concurrently
      const promotionPromises = jobIds.map((id) =>
        app.inject({
          method: 'POST',
          url: `/jobs/${id}/promote`,
          headers: { 'x-user-id': employerId, 'x-user-role': 'employer' },
          payload: { durationDays: 7 },
        }),
      );

      const results = await Promise.all(promotionPromises);
      const successes = results.filter((r) => r.statusCode === 201);
      const failures = results.filter((r) => r.statusCode === 400);

      expect(successes.length).toBe(3);
      expect(failures.length).toBe(1);
      expect(JSON.parse(failures[0]!.payload).code).toBe('INSUFFICIENT_CREDITS');

      const { balance } = await walletService.getBalance(employerId);
      expect(balance).toBe(0);
    });

    it('rolls back credit deduction atomically if job update fails', async () => {
      // Give employer 50 credits
      await walletService.recordTransaction({
        userId: employerId,
        amount: 50,
        reason: 'Test rollback grant',
        actorId: employerId,
      });

      const { balance: balanceBefore } = await walletService.getBalance(employerId);
      expect(balanceBefore).toBe(50);

      // Create a job for failure test
      const createRes = await app.inject({
        method: 'POST',
        url: '/jobs',
        headers: { 'x-user-id': employerId, 'x-user-role': 'employer' },
        payload: {
          title: 'Rollback Failure Test Job',
          description: 'Testing atomicity rollback.',
          category: 'healthcare_services',
          city: 'Ujjain',
          district: 'Ujjain',
          minPay: 20000,
          maxPay: 30000,
          openings: 1,
          skills: ['Nursing'],
        },
      });
      const failJobId = JSON.parse(createRes.payload).id;

      // Mock jobRepository.update to throw
      const originalUpdate = jobRepository.update.bind(jobRepository);
      jobRepository.update = async (id, updates) => {
        if (id === failJobId) {
          throw new Error('Simulated database write failure during job update');
        }
        return originalUpdate(id, updates);
      };

      try {
        const promoteRes = await app.inject({
          method: 'POST',
          url: `/jobs/${failJobId}/promote`,
          headers: { 'x-user-id': employerId, 'x-user-role': 'employer' },
          payload: { durationDays: 7 },
        });

        // The request should fail (500 or 400)
        expect(promoteRes.statusCode).toBeGreaterThanOrEqual(400);

        // Crucial Invariant: Balance must NOT be debited!
        const { balance: balanceAfter } = await walletService.getBalance(employerId);
        expect(balanceAfter).toBe(50);
      } finally {
        // Restore repository
        jobRepository.update = originalUpdate;
      }
    });
  });

  describe('2. Search Relevance Ranking & Deterministic Expiration (JOB-05)', () => {
    it('creates a newer organic job for ranking comparison', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/jobs',
        headers: { 'x-user-id': employerId, 'x-user-role': 'employer' },
        payload: {
          title: 'Junior CNC Machinist',
          description: 'Entry level CNC milling machinist position.',
          category: 'manufacturing',
          city: 'Indore',
          district: 'Indore',
          minPay: 15000,
          maxPay: 20000,
          openings: 2,
          skills: ['CNC'],
        },
      });

      expect(res.statusCode).toBe(201);
      organicJobId = JSON.parse(res.payload).id;
    });

    it('pins promoted job to top of matching search results', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/jobs?keyword=CNC&city=Indore',
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.jobs.length).toBeGreaterThanOrEqual(2);

      // Featured job must be pinned at index 0 despite organic job being created later
      const featuredIdx = data.jobs.findIndex((j: { id: string }) => j.id === featuredJobId);
      const organicIdx = data.jobs.findIndex((j: { id: string }) => j.id === organicJobId);

      expect(featuredIdx).toBe(0);
      expect(organicIdx).toBeGreaterThan(featuredIdx);
      expect(data.jobs[0].isPromoted).toBe(true);
    });

    it('relevance guardrail: does not promote irrelevant featured jobs in mismatched query', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/jobs?city=Bengaluru',
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      // Indore featured job must not appear in Bengaluru search
      expect(data.jobs.some((j: { id: string }) => j.id === featuredJobId)).toBe(false);
    });

    it('expired featured job falls back to standard chronological ranking', async () => {
      // Simulate expired promotion
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await jobRepository.update(featuredJobId, { featured_until: pastDate });

      const res = await app.inject({
        method: 'GET',
        url: '/jobs?keyword=CNC&city=Indore',
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);

      const featuredJobInList = data.jobs.find((j: { id: string }) => j.id === featuredJobId);
      expect(featuredJobInList.isPromoted).toBe(false);

      // Organic job was created more recently, so it should rank first now
      const featuredIdx = data.jobs.findIndex((j: { id: string }) => j.id === featuredJobId);
      const organicIdx = data.jobs.findIndex((j: { id: string }) => j.id === organicJobId);
      expect(organicIdx).toBeLessThan(featuredIdx);
    });

    it('matches full-text search keywords against skills array in addition to title and description', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/jobs',
        headers: { 'x-user-id': employerId, 'x-user-role': 'employer' },
        payload: {
          title: 'Circuit Hardware Technician',
          description: 'Assembly line technician for electronic components.',
          category: 'technology',
          city: 'Gwalior',
          district: 'Gwalior',
          minPay: 18000,
          maxPay: 26000,
          openings: 2,
          skills: ['Microcontroller', 'Soldering', 'SMD'],
        },
      });

      expect(res.statusCode).toBe(201);
      const createdJob = JSON.parse(res.payload);

      // Search by keyword that ONLY exists in skills array
      const searchRes = await app.inject({
        method: 'GET',
        url: '/jobs?keyword=Microcontroller',
      });

      expect(searchRes.statusCode).toBe(200);
      const searchData = JSON.parse(searchRes.payload);
      expect(searchData.jobs.some((j: { id: string }) => j.id === createdJob.id)).toBe(true);
    });

    it('ensures featured jobs appear on Page 1 even when offset and limit pagination is applied', async () => {
      // Create 8 jobs in unique city with staggered timestamps
      const uniqueCity = `Jabalpur_${Date.now()}`;
      const jabalpurJobIds: string[] = [];
      for (let i = 0; i < 8; i++) {
        const createRes = await app.inject({
          method: 'POST',
          url: '/jobs',
          headers: { 'x-user-id': employerId, 'x-user-role': 'employer' },
          payload: {
            title: `Logistics Dispatcher Grade ${i}`,
            description: 'Warehouse dispatch and inventory management.',
            category: 'logistics_supply',
            city: uniqueCity,
            district: uniqueCity,
            minPay: 16000,
            maxPay: 24000,
            openings: 1,
            skills: ['Inventory', 'Logistics'],
          },
        });
        jabalpurJobIds.push(JSON.parse(createRes.payload).id);
      }

      // Promote the 1st job created (which in standard chronological DESC order would be at the bottom / row 8)
      const olderJobId = jabalpurJobIds[0]!;
      await walletService.recordTransaction({
        userId: employerId,
        amount: 100,
        reason: 'Pagination test credits',
        actorId: employerId,
      });

      const promoteRes = await app.inject({
        method: 'POST',
        url: `/jobs/${olderJobId}/promote`,
        headers: { 'x-user-id': employerId, 'x-user-role': 'employer' },
        payload: { durationDays: 7 },
      });
      expect(promoteRes.statusCode).toBe(201);

      // Request Page 1 with limit 3 (simulating a smaller page size)
      const page1Res = await app.inject({
        method: 'GET',
        url: `/jobs?city=${uniqueCity}&limit=3&offset=0`,
      });

      expect(page1Res.statusCode).toBe(200);
      const page1Data = JSON.parse(page1Res.payload);
      expect(page1Data.jobs.length).toBe(3);
      expect(page1Data.total).toBe(8);

      // The promoted job MUST be at index 0 of Page 1 despite being an older record
      expect(page1Data.jobs[0].id).toBe(olderJobId);
      expect(page1Data.jobs[0].isPromoted).toBe(true);
    });
  });

  describe('3. Job Search Alerts & Worker Daily Digest (JOB-06, Hard Invariant #1)', () => {
    it('creates a job search alert for a candidate', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/jobs/alerts',
        headers: { 'x-user-id': candidateId, 'x-user-role': 'job_seeker' },
        payload: {
          title: 'Indore Manufacturing Openings',
          filters: {
            city: 'Indore',
            category: 'manufacturing',
          },
          frequency: 'daily',
        },
      });

      expect(res.statusCode).toBe(201);
      const alert = JSON.parse(res.payload);
      expect(alert.id).toBeDefined();
      expect(alert.userId).toBe(candidateId);
      expect(alert.title).toBe('Indore Manufacturing Openings');
      expect(alert.isActive).toBe(true);
    });

    it('retrieves candidate active job alerts (Zero PII leakage)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/jobs/alerts',
        headers: { 'x-user-id': candidateId, 'x-user-role': 'job_seeker' },
      });

      expect(res.statusCode).toBe(200);
      const alerts = JSON.parse(res.payload);
      expect(alerts.length).toBeGreaterThanOrEqual(1);
      expect(alerts[0].userId).toBe(candidateId);
      // Hard Invariant #1: No email or phone exposed in payload
      expect(JSON.stringify(alerts)).not.toContain('@');
      expect(JSON.stringify(alerts)).not.toContain('phone');
    });

    it('runs alerts worker processor and dispatches deduplicated digest', async () => {
      const candidateAlerts = await jobRepository.findAlertsByUserId(candidateId);
      const recentJobs = await jobRepository.findRecentlyCreatedJobs(new Date(Date.now() - 24 * 60 * 60 * 1000));

      const mockJob = {
        data: {
          timeframeHours: 24,
          candidateId,
          alerts: candidateAlerts,
          jobs: recentJobs,
        },
        attemptsMade: 0,
      } as unknown as Job;

      const result = await alertsProcessor(mockJob);

      expect(result.status).toBe('completed');
      expect(result.alertsEvaluated).toBeGreaterThanOrEqual(1);
      expect(result.candidatesNotified).toBeGreaterThanOrEqual(1);
      expect(result.totalJobsMatched).toBeGreaterThanOrEqual(1);
      expect(result.totalDeliveriesCreated).toBeGreaterThanOrEqual(1);

      // Verify deduplication: re-running immediately produces 0 new deliveries
      const secondRunResult = await alertsProcessor(mockJob);
      expect(secondRunResult.status).toBe('completed');
      expect(secondRunResult.candidatesNotified).toBe(0);
      expect(secondRunResult.totalDeliveriesCreated).toBe(0);
    });

    it('enforces idempotency and zero duplicate notifications under BullMQ worker retry attempts', async () => {
      const candidateAlerts = await jobRepository.findAlertsByUserId(candidateId);
      const recentJobs = await jobRepository.findRecentlyCreatedJobs(new Date(Date.now() - 24 * 60 * 60 * 1000));

      // Attempt 1: simulated retry after transient failure
      const retryJob = {
        data: {
          timeframeHours: 24,
          candidateId,
          alerts: candidateAlerts,
          jobs: recentJobs,
          shouldSimulateFailure: true,
        },
        attemptsMade: 1, // BullMQ attempt 2
      } as unknown as Job;

      await expect(alertsProcessor(retryJob)).rejects.toThrow('Simulated transient search alert failure');

      // Attempt 2: Successful retry run (attemptsMade = 2)
      const successRetryJob = {
        data: {
          timeframeHours: 24,
          candidateId,
          alerts: candidateAlerts,
          jobs: recentJobs,
          shouldSimulateFailure: true,
        },
        attemptsMade: 2,
      } as unknown as Job;

      const retryResult = await alertsProcessor(successRetryJob);
      expect(retryResult.status).toBe('completed');
      // Because jobs were already delivered, zero duplicate candidates are notified
      expect(retryResult.candidatesNotified).toBe(0);
      expect(retryResult.totalDeliveriesCreated).toBe(0);
    });
  });
});
