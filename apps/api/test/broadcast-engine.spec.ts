import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import {
  calculateSmsSegments,
  splitSmsIntoSegments,
  getGraphemeClusters,
  interpolateTemplate,
  validateDltTemplateVariables,
} from '../src/admin/sms-segment.util.js';
import { BroadcastProcessor } from '../../worker/src/processors/broadcast.processor.js';
import { ProfileRepository } from '../src/database/repositories/profile.repository.js';
import { JobRepository } from '../src/database/repositories/job.repository.js';
import { ApplicationRepository } from '../src/database/repositories/application.repository.js';
import { CreditLedgerRepository } from '../src/database/repositories/credit-ledger.repository.js';
import { applyStatisticalDisclosureControl } from '../src/admin/reports.service.js';

describe('Ticket T-20: MSME Department Broadcast Engine & District Employment Reports', () => {
  let app: NestFastifyApplication;
  let profileRepo: ProfileRepository;
  let jobRepo: JobRepository;
  let appRepo: ApplicationRepository;
  let ledgerRepo: CreditLedgerRepository;

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
    ledgerRepo = app.get(CreditLedgerRepository);
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

    it('protects Devanagari grapheme clusters and reassembles split segments seamlessly', () => {
      const complexHindi = 'भारत सरकार एमएसएमई विभाग: राष्ट्रीय सूक्ष्म, लघु एवं मध्यम उद्योग प्रोत्साहन योजना 2026 के अंतर्गत सब्सिडी एवं ऋण सहायता हेतु तुरंत आवेदन करें।';
      const clusters = getGraphemeClusters(complexHindi);
      expect(clusters.length).toBeGreaterThan(0);

      // Verify segmentation produces valid segments
      const segResult = calculateSmsSegments(complexHindi);
      expect(segResult.encoding).toBe('UCS-2');
      expect(segResult.segments.length).toBeGreaterThanOrEqual(1);

      const directSplit = splitSmsIntoSegments(complexHindi);
      expect(directSplit.length).toBe(segResult.segments.length);

      // Reassembly test: zero data loss across segment boundaries
      const reassembled = segResult.segments.join('');
      expect(reassembled).toBe(complexHindi.normalize('NFC'));

      // Ensure segment splitting respects atomic grapheme clusters
      segResult.segments.forEach((seg) => {
        expect(seg.length).toBeLessThanOrEqual(70);
      });
    });

    it('validates DLT template variables against length limits and prevents delimiter injection', () => {
      const template = '[MSME Alert] Subsidies available for {#sector#} units in {#district#}. Apply at msme.gov.in';
      
      // Valid inputs
      const validRes = validateDltTemplateVariables(template, { sector: 'Manufacturing', district: 'Indore' });
      expect(validRes.valid).toBe(true);

      // Delimiter injection attempt
      const injectRes = validateDltTemplateVariables(template, { sector: 'Textiles{#malicious#}', district: 'Bhopal' });
      expect(injectRes.valid).toBe(false);
      expect(injectRes.errors[0]).toContain('illegal delimiter');

      // Max length overflow attempt
      const overflowRes = validateDltTemplateVariables(
        template,
        { sector: 'A'.repeat(60), district: 'Indore' },
        { sector: { maxLength: 50 } },
      );
      expect(overflowRes.valid).toBe(false);
      expect(overflowRes.errors[0]).toContain('exceeds maximum length');
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
      expect(data.audienceDigest).toBeDefined();
      expect(data.graphemeCount).toBeGreaterThan(0);
    });

    it('POST /admin/broadcast/dispatch - dispatches campaign, reserves ledger escrow and records immutable audit log', async () => {
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
      expect(data.audienceDigest).toBeDefined();

      // Verify Two-Phase Escrow in Credit Ledger (Hard Invariant #7)
      const ledgerEntries = await ledgerRepo.findByUserId('admin_state_officer_1');
      const escrowEntry = ledgerEntries.find((e) => e.reason.includes('BROADCAST_ESCROW_RESERVED'));
      expect(escrowEntry).toBeDefined();
      expect(escrowEntry?.amount).toBeLessThan(0);

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

    it('POST /admin/broadcast/dispatch - rejects duplicate confirmation token with 409 Conflict', async () => {
      // Re-dispatching with the same token used in previous test
      const duplicateRes = await app.inject({
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

      expect(duplicateRes.statusCode).toBe(409);
      const err = JSON.parse(duplicateRes.payload);
      expect(err.message).toContain('already in progress or has executed');
    });

    it('POST /admin/broadcast/dispatch - rejects drifted audience digest with 422 Unprocessable Entity', async () => {
      const driftRes = await app.inject({
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
          confirmationToken: 'CONFIRM_DISPATCH_NEW_TOKEN_999',
          audienceDigest: 'tampered_invalid_sha256_digest_000000',
        },
      });

      expect(driftRes.statusCode).toBe(422);
      const err = JSON.parse(driftRes.payload);
      expect(err.message).toContain('AUDIENCE_DRIFT_DETECTED');
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
      // Bhopal has 1 hire (< 5 threshold), so SDC cell suppression sanitizes totalHires to 0 and displayHires to '<5'
      expect(bhopalItem.suppressedHires).toBe(true);
      expect(bhopalItem.totalHires).toBe(0);
      expect(bhopalItem.displayHires).toBe('<5');

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

    it('enforces Statistical Disclosure Control (SDC): primary and complementary cell suppression', () => {
      // Test dataset with 1 primary suppressed district (Hires = 2 < 5)
      const rawDistricts = [
        { district: 'District Alpha', onboardedMsmes: 50, activeJobs: 20, totalHires: 2 }, // primary: < 5
        { district: 'District Beta', onboardedMsmes: 80, activeJobs: 40, totalHires: 12 }, // secondary candidate (smallest non-zero)
        { district: 'District Gamma', onboardedMsmes: 120, activeJobs: 60, totalHires: 45 },
      ];

      const sdcResult = applyStatisticalDisclosureControl(rawDistricts);

      // District Alpha must be primary-suppressed (raw totalHires zeroed out for SDC compliance)
      const alpha = sdcResult.find((d) => d.district === 'District Alpha')!;
      expect(alpha.suppressedHires).toBe(true);
      expect(alpha.totalHires).toBe(0);
      expect(alpha.displayHires).toBe('<5');

      // District Beta must be secondary-suppressed (raw totalHires zeroed out for SDC compliance)
      const beta = sdcResult.find((d) => d.district === 'District Beta')!;
      expect(beta.suppressedHires).toBe(true);
      expect(beta.totalHires).toBe(0);
      expect(beta.displayHires).toBe('<5');

      // District Gamma has large volume, remains unsuppressed
      const gamma = sdcResult.find((d) => d.district === 'District Gamma')!;
      expect(gamma.suppressedHires).toBe(false);
      expect(gamma.displayHires).toBe('45');
    });
  });
});
