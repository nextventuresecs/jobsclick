import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
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
  });
});
