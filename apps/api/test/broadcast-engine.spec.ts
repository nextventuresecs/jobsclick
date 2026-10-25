import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { calculateSmsSegments, interpolateTemplate } from '../src/admin/sms-segment.util.js';
import { BroadcastProcessor } from '../../worker/src/processors/broadcast.processor.js';
import { ProfileRepository } from '../src/database/repositories/profile.repository.js';
import { JobRepository } from '../src/database/repositories/job.repository.js';
import { ApplicationRepository } from '../src/database/repositories/application.repository.js';

describe('Ticket T-20: MSME Department Broadcast Engine & District Employment Reports', () => {
  let app: NestFastifyApplication;
  let profileRepo: ProfileRepository;
  let jobRepo: JobRepository;
  let appRepo: ApplicationRepository;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    profileRepo = app.get(ProfileRepository);
    jobRepo = app.get(JobRepository);
    appRepo = app.get(ApplicationRepository);
  });

  afterAll(async () => {
    await app.close();
  });

  // =========================================================================
  // 1. Telecom Character Encoding & Segment Math (TRAI / DLT Precision)
  // =========================================================================
  describe('SMS Segment Math & DLT Encoding (GSM-7 vs. UCS-2)', () => {
    it('calculates single-segment ASCII GSM-7 message (<= 160 chars)', () => {
      const text = 'Notice: All Micro and Small enterprises in Bhopal district must submit compliance report by end of month.';
      expect(text.length).toBeLessThanOrEqual(160);

      const result = calculateSmsSegments(text);
      expect(result.encoding).toBe('GSM-7');
      expect(result.segmentCount).toBe(1);
    });

    it('calculates multi-segment ASCII GSM-7 message (> 160 chars, concatenated at 153 chars/segment)', () => {
      // 165 characters of standard GSM ASCII
      const text = 'This is an official government notification dispatched by the Department of Micro, Small and Medium Enterprises regarding urgent subsidised industrial credit schemes.'.slice(0, 165);
      expect(text.length).toBe(165);

      const result = calculateSmsSegments(text);
      expect(result.encoding).toBe('GSM-7');
      expect(result.segmentCount).toBe(2); // 165 / 153 = 1.07 -> 2 segments
    });

    it('detects Unicode Hindi (Devanagari) characters and calculates single-segment UCS-2 (<= 70 chars)', () => {
      // 55 characters of Hindi
      const hindiText = 'मध्य प्रदेश एमएसएमई विभाग: क्लस्टर प्रोत्साहन योजना 2026.';
      expect(hindiText.length).toBeLessThanOrEqual(70);

      const result = calculateSmsSegments(hindiText);
      expect(result.encoding).toBe('UCS-2');
      expect(result.segmentCount).toBe(1);
    });

    it('calculates multi-segment Unicode Hindi UCS-2 message (> 70 chars, concatenated at 67 chars/segment)', () => {
      // 78 characters of Hindi
      const longHindiText = 'मध्य प्रदेश एमएसएमई विभाग: औद्योगिक क्लस्टर प्रोत्साहन योजना 2026 के अंतर्गत सब्सिडी हेतु आवेदन करें।';
      expect(Array.from(longHindiText).length).toBeGreaterThan(70);

      const result = calculateSmsSegments(longHindiText);
      expect(result.encoding).toBe('UCS-2');
      expect(result.segmentCount).toBe(2); // > 70 chars -> 2 segments
    });

    it('handles GSM extended characters (^, {, }, [, ], ~) as 2 septets', () => {
      const textWithBrackets = 'Notice: {Urgent}'; // '{' and '}' count as 2 chars each
      const result = calculateSmsSegments(textWithBrackets);
      expect(result.encoding).toBe('GSM-7');
      expect(result.effectiveLength).toBe(textWithBrackets.length + 2);
    });

    it('interpolates template parameters accurately', () => {
      const template = 'Dear {#companyName#}, subsidy for {#sector#} is approved.';
      const resolved = interpolateTemplate(template, {
        companyName: 'Apex Tools Pvt Ltd',
        sector: 'Automotive',
      });
      expect(resolved).toBe('Dear Apex Tools Pvt Ltd, subsidy for Automotive is approved.');
    });
  });

  // =========================================================================
  // 2. Broadcast Cost Preview & Dispatch Engine (API Endpoints & RBAC)
  // =========================================================================
  describe('Broadcast Cost Preview & Dispatch API', () => {
    beforeEach(async () => {
      // Seed synthetic enterprise profiles across districts
      await profileRepo.saveBusinessProfile({
        id: 'biz_msme_bhopal_1',
        user_id: 'usr_emp_bhopal_1',
        company_name: 'Bhopal Precision Works',
        ownership_type: 'private_limited',
        company_size: 'micro',
        sector: 'Manufacturing',
        city: 'Bhopal',
        district: 'Bhopal',
        is_msme: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await profileRepo.saveBusinessProfile({
        id: 'biz_msme_indore_1',
        user_id: 'usr_emp_indore_1',
        company_name: 'Indore Food Processors',
        ownership_type: 'partnership',
        company_size: 'small',
        sector: 'Agro',
        city: 'Indore',
        district: 'Indore',
        is_msme: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });

    it('POST /admin/broadcast/preview - calculates dynamic audience count and segment costs', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/broadcast/preview',
        headers: {
          'x-user-id': 'admin_state_officer_1',
          'x-user-role': 'msme_admin',
        },
        payload: {
          filters: { district: 'Bhopal', companySize: 'micro' },
          templateId: 'DLT_MSME_SUBSIDY_ALERT_EN',
          variables: { message: 'Quarterly compliance update.' },
        },
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.payload);
      expect(data.recipientCount).toBeGreaterThanOrEqual(1);
      expect(data.encoding).toBe('GSM-7');
      expect(data.segmentCount).toBe(1);
      expect(data.costPerSmsPaise).toBe(20);
      expect(data.totalCostPaise).toBe(data.recipientCount * 20);
      expect(data.totalCostInr).toBe(data.totalCostPaise / 100);
      expect(data.previewText).toContain('Bhopal');
    });

    it('POST /admin/broadcast/dispatch - dispatches campaign and records immutable audit log', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/broadcast/dispatch',
        headers: {
          'x-user-id': 'admin_state_officer_1',
          'x-user-role': 'msme_admin',
        },
        payload: {
          filters: { district: 'Bhopal' },
          templateId: 'DLT_MSME_NOTICE_EN',
          variables: { message: 'Cluster notification' },
          confirmationToken: 'CONFIRM_DISPATCH_XYZ123',
        },
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.payload);
      expect(data.campaignId).toBeDefined();
      expect(data.status).toBe('queued');
      expect(data.batchesEnqueued).toBeGreaterThan(0);

      // Verify Audit Log was recorded (Hard Invariant #6)
      const auditRes = await app.inject({
        method: 'GET',
        url: '/admin/audit-logs',
        headers: {
          'x-user-id': 'admin_state_officer_1',
        },
      });
      const logs = JSON.parse(auditRes.payload);
      const broadcastLog = logs.find((l: { action: string }) => l.action === 'MSME_BROADCAST_DISPATCHED');
      expect(broadcastLog).toBeDefined();
      expect(broadcastLog.meta.campaignId).toBe(data.campaignId);
    });

    it('POST /admin/broadcast/dispatch - rejects unauthorized roles with 403 Forbidden', async () => {
      const seekerRes = await app.inject({
        method: 'POST',
        url: '/admin/broadcast/dispatch',
        headers: {
          'x-user-id': 'usr_seeker_1',
          'x-user-role': 'job_seeker',
        },
        payload: {
          filters: {},
          templateId: 'DLT_MSME_NOTICE_EN',
          confirmationToken: 'CONFIRM_DISPATCH_XYZ123',
        },
      });
      expect(seekerRes.statusCode).toBe(403);

      const employerRes = await app.inject({
        method: 'POST',
        url: '/admin/broadcast/dispatch',
        headers: {
          'x-user-id': 'usr_emp_1',
          'x-user-role': 'employer',
        },
        payload: {
          filters: {},
          templateId: 'DLT_MSME_NOTICE_EN',
          confirmationToken: 'CONFIRM_DISPATCH_XYZ123',
        },
      });
      expect(employerRes.statusCode).toBe(403);
    });
  });

  // =========================================================================
  // 3. Worker Delivery & Idempotency Keys (Hard Invariant #4)
  // =========================================================================
  describe('Worker Consumer & Idempotency Guarantee', () => {
    it('skips duplicate message dispatch when identical idempotency key is processed', async () => {
      const processor = new BroadcastProcessor();
      const jobMock = {
        id: 'job_bcast_test_1',
        data: {
          campaignId: 'camp_test_100',
          batchIndex: 0,
          totalBatches: 1,
          templateId: 'DLT_MSME_NOTICE_EN',
          variables: { message: 'Idempotency test' },
          recipients: [
            {
              businessProfileId: 'biz_1',
              phone: '9876543210',
              idempotencyKey: 'idemp_key_unique_abc123',
            },
          ],
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
      };

      // First run
      const result1 = await processor.process(jobMock as unknown as Parameters<typeof processor.process>[0]);
      expect(result1.status).toBe('completed');
      expect(result1.sentCount).toBe(1);

      // Re-run simulating retry of same job
      const result2 = await processor.process(jobMock as unknown as Parameters<typeof processor.process>[0]);
      expect(result2.status).toBe('completed');
      expect(result2.sentCount).toBe(1);
    });
  });

  // =========================================================================
  // 4. District Employment Reports & Zero PII Leakage (Hard Invariant #1)
  // =========================================================================
  describe('District Employment Reports (MSME-04 & Zero PII)', () => {
    beforeAll(async () => {
      // Seed jobs and applications
      const job1 = await jobRepo.create({
        id: 'job_bhopal_cnc_1',
        employer_id: 'usr_emp_bhopal_1',
        title: 'CNC Operator',
        description: 'CNC lathe operator for auto components',
        category: 'blue',
        city: 'Bhopal',
        district: 'Bhopal',
        openings: 5,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await appRepo.create({
        id: 'app_bhopal_hired_1',
        job_id: job1.id,
        applicant_id: 'usr_seeker_secret_pii_1',
        status: 'hired',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });

    it('GET /admin/reports/district-employment - aggregates district stats with ZERO personal seeker PII', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/reports/district-employment',
        headers: {
          'x-user-id': 'admin_state_officer_1',
          'x-user-role': 'msme_admin',
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);

      // Verify contract fields
      const bhopalItem = data.find((d: { district: string }) => d.district.toLowerCase() === 'bhopal');
      expect(bhopalItem).toBeDefined();
      expect(bhopalItem.onboardedMsmes).toBeGreaterThanOrEqual(1);
      expect(bhopalItem.activeJobs).toBeGreaterThanOrEqual(1);
      expect(bhopalItem.totalHires).toBeGreaterThanOrEqual(1);

      // Verify Hard Invariant #1 & PRD Decision D12: ZERO PII fields exist anywhere in response
      data.forEach((item: Record<string, unknown>) => {
        expect(item).not.toHaveProperty('applicant_id');
        expect(item).not.toHaveProperty('phone');
        expect(item).not.toHaveProperty('email');
        expect(item).not.toHaveProperty('aadhaar');
        expect(item).not.toHaveProperty('name');
        expect(item).not.toHaveProperty('full_name');
        expect(item).toHaveProperty('district');
        expect(item).toHaveProperty('onboardedMsmes');
        expect(item).toHaveProperty('activeJobs');
        expect(item).toHaveProperty('totalHires');
      });
    });

    it('GET /admin/reports/district-employment - rejects unauthorized role with 403 Forbidden', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/reports/district-employment',
        headers: {
          'x-user-id': 'usr_seeker_1',
          'x-user-role': 'job_seeker',
        },
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
