import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { DLT_SMS_TEMPLATES } from '../src/auth/sms-templates.js';
import { Msg91SmsGateway } from '../src/auth/sms.service.js';
import { EmailService } from '../src/email/email.service.js';
import { JobsService } from '../src/jobs/jobs.service.js';
import { BroadcastService } from '../src/admin/broadcast.service.js';
import { WorkerSmsService } from '../../worker/src/sms/sms.service.js';
import { WorkerEmailService } from '../../worker/src/email/email.service.js';
import type { JobRepository } from '../src/database/repositories/job.repository.js';
import type { ApplicationRepository } from '../src/database/repositories/application.repository.js';
import type { ProfileRepository } from '../src/database/repositories/profile.repository.js';
import type { UserRepository } from '../src/database/repositories/user.repository.js';
import type { WalletService } from '../wallet/wallet.service.js';
import type { QueueService } from '../src/queue/queue.service.js';
import type { AdminService } from '../src/admin/admin.service.js';
import type { CreditLedgerRepository } from '../src/database/repositories/credit-ledger.repository.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@indian-job-portal/database';

describe('SMS / DLT Templates & Staging Safeguards Verification', () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...envSnapshot };
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // =========================================================================
  // Requirement 1 & 8: Single Registry with 4 exact approved templates
  // =========================================================================
  describe('DLT Registry Exact Compliance (Prompt AC-1 & AC-8)', () => {
    it('contains exactly the 4 approved templates and zero aliases', () => {
      const keys = Object.keys(DLT_SMS_TEMPLATES).sort();
      expect(keys).toEqual(['INVITE_EN', 'INVITE_HI', 'OTP_EN', 'OTP_HI']);
    });

    it('OTP_EN matches approved registry specifications exactly', () => {
      const tpl = DLT_SMS_TEMPLATES['OTP_EN']!;
      expect(tpl.templateId).toBe('1277179301139811147');
      expect(tpl.templateName).toBe('JOBSCLICK_OTP_LOGIN_EN');
      expect(tpl.language).toBe('en');
      expect(tpl.senderId).toBe('JOBSCK');
      expect(tpl.isUnicode).toBe(false);
      expect(tpl.templateText).toBe(
        'Dear User,\nYour JobsClick verification code is {#number#}. Valid for {#number#} minutes. Do not share your OTP with anyone.\nRegards,\nSPACECRAFTZZ INNOVATIONS LLP Team',
      );
    });

    it('OTP_HI matches approved registry specifications exactly (with double space before मिनट)', () => {
      const tpl = DLT_SMS_TEMPLATES['OTP_HI']!;
      expect(tpl.templateId).toBe('1277179312348407947');
      expect(tpl.templateName).toBe('JOBSCLICK_OTP_LOGIN_HI');
      expect(tpl.language).toBe('hi');
      expect(tpl.senderId).toBe('JOBSCK');
      expect(tpl.isUnicode).toBe(true);
      expect(tpl.templateText).toBe(
        'JobsClick पर लॉगिन करने के लिए आपका ओटीपी {#number#} है। यह {#number#}  मिनट के लिए मान्य है। इसे किसी के साथ साझा न करें। - SPACECRAFTZZ INNOVATIONS LLP Team',
      );
    });

    it('INVITE_EN matches approved registry specifications exactly', () => {
      const tpl = DLT_SMS_TEMPLATES['INVITE_EN']!;
      expect(tpl.templateId).toBe('1277179291095585071');
      expect(tpl.templateName).toBe('JOBSCLICK_INVITE_CANDIDATE_EN');
      expect(tpl.language).toBe('en');
      expect(tpl.senderId).toBe('JOBSCK');
      expect(tpl.isUnicode).toBe(false);
      expect(tpl.templateText).toBe(
        'You have been invited to Indian Job Portal. Complete your profile and activate your account at jobsclick.live. - SPACECRAFTZZ INNOVATIONS LLP Team',
      );
    });

    it('INVITE_HI matches approved registry specifications exactly', () => {
      const tpl = DLT_SMS_TEMPLATES['INVITE_HI']!;
      expect(tpl.templateId).toBe('1277179291746795224');
      expect(tpl.templateName).toBe('JOBSCLICK_INVITE_CANDIDATE_HI');
      expect(tpl.language).toBe('hi');
      expect(tpl.senderId).toBe('JOBSCK');
      expect(tpl.isUnicode).toBe(true);
      expect(tpl.templateText).toBe(
        'आपको JobsClick पर आमंत्रित किया गया है। अपना खाता सक्रिय करने के लिए jobsclick.live पर जाएं। - SPACECRAFTZZ INNOVATIONS LLP Team',
      );
    });
  });

  // =========================================================================
  // Requirement 2: Language Selection (OTP & Candidate Invite)
  // =========================================================================
  describe('Language Selection for OTP & Invite (Prompt AC-2)', () => {
    it('routes English OTP requests to English template ID 1277179301139811147', async () => {
      const gateway = new Msg91SmsGateway();
      process.env['MSG91_AUTH_KEY'] = 'test_key';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ type: 'success', request_id: 'req_en_1' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const res = await gateway.sendOtp({ phone: '9876543210', otp: '112233', language: 'en' });
      expect(res.success).toBe(true);
      const url = mockFetch.mock.calls[0]![0] as string;
      expect(url).toContain('template_id=1277179301139811147');
    });

    it('routes Hindi OTP requests to Hindi template ID 1277179312348407947', async () => {
      const gateway = new Msg91SmsGateway();
      process.env['MSG91_AUTH_KEY'] = 'test_key';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ type: 'success', request_id: 'req_hi_1' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const res = await gateway.sendOtp({ phone: '9876543210', otp: '112233', language: 'hi' });
      expect(res.success).toBe(true);
      const url = mockFetch.mock.calls[0]![0] as string;
      expect(url).toContain('template_id=1277179312348407947');
    });

    it('routes English candidate invite to English template ID 1277179291095585071 in Worker', async () => {
      const workerSms = new WorkerSmsService();
      process.env['NODE_ENV'] = 'production';
      process.env['MSG91_AUTH_KEY'] = 'real_msg91_key';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ type: 'success', message: 'req_inv_en' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const res = await workerSms.sendInviteSms({ phone: '9876543210', language: 'en' });
      expect(res.success).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string);
      expect(body.template_id).toBe('1277179291095585071');
      expect(body.sender).toBe('JOBSCK');
    });

    it('routes Hindi candidate invite to Hindi template ID 1277179291746795224 in Worker', async () => {
      const workerSms = new WorkerSmsService();
      process.env['NODE_ENV'] = 'production';
      process.env['MSG91_AUTH_KEY'] = 'real_msg91_key';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ type: 'success', message: 'req_inv_hi' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const res = await workerSms.sendInviteSms({ phone: '9876543210', language: 'hi' });
      expect(res.success).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string);
      expect(body.template_id).toBe('1277179291746795224');
      expect(body.sender).toBe('JOBSCK');
    });
  });

  // =========================================================================
  // Requirement 3 & 4: Env Overrides & No Cross-Language Fallback
  // =========================================================================
  describe('Env Overrides & Strict Template Configuration (Prompt AC-3 & AC-4)', () => {
    it('allows MSG91_OTP_TEMPLATE_ID and MSG91_OTP_TEMPLATE_ID_HI overrides', async () => {
      const gateway = new Msg91SmsGateway();
      process.env['MSG91_AUTH_KEY'] = 'test_key';
      process.env['MSG91_OTP_TEMPLATE_ID'] = 'custom_otp_en_999';
      process.env['MSG91_OTP_TEMPLATE_ID_HI'] = 'custom_otp_hi_888';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ type: 'success', request_id: 'fixture-request' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await gateway.sendOtp({ phone: '9876543210', otp: '111111', language: 'en' });
      expect(mockFetch.mock.calls[0]![0] as string).toContain('template_id=custom_otp_en_999');

      await gateway.sendOtp({ phone: '9876543210', otp: '222222', language: 'hi' });
      expect(mockFetch.mock.calls[1]![0] as string).toContain('template_id=custom_otp_hi_888');
    });

    it('allows MSG91_INVITE_TEMPLATE_ID and MSG91_INVITE_TEMPLATE_ID_HI overrides in worker', async () => {
      const workerSms = new WorkerSmsService();
      process.env['NODE_ENV'] = 'production';
      process.env['MSG91_AUTH_KEY'] = 'real_msg91_key';
      process.env['MSG91_INVITE_TEMPLATE_ID'] = 'custom_inv_en_111';
      process.env['MSG91_INVITE_TEMPLATE_ID_HI'] = 'custom_inv_hi_222';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ type: 'success', request_id: 'fixture-request' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await workerSms.sendInviteSms({ phone: '9876543210', language: 'en' });
      const bodyEn = JSON.parse(mockFetch.mock.calls[0]![1].body as string);
      expect(bodyEn.template_id).toBe('custom_inv_en_111');

      await workerSms.sendInviteSms({ phone: '9876543210', language: 'hi' });
      const bodyHi = JSON.parse(mockFetch.mock.calls[1]![1].body as string);
      expect(bodyHi.template_id).toBe('custom_inv_hi_222');
    });

    it('MSG91_SENDER_ID configures sender and defaults to JOBSCK', async () => {
      const workerSms = new WorkerSmsService();
      process.env['NODE_ENV'] = 'production';
      process.env['MSG91_AUTH_KEY'] = 'real_msg91_key';
      delete process.env['MSG91_SENDER_ID'];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ type: 'success', request_id: 'fixture-request' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await workerSms.sendInviteSms({ phone: '9876543210', language: 'en' });
      const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string);
      expect(body.sender).toBe('JOBSCK');
    });
  });

  // =========================================================================
  // Requirement 5: 503 on unapproved templates (Broadcast & Interview Invite)
  // =========================================================================
  describe('Interview Invite & Broadcast SMS 503 Guard (Prompt AC-5)', () => {
    it('Msg91SmsGateway.sendInviteSms returns "no approved DLT template"', async () => {
      const realGateway = new Msg91SmsGateway();
      const res = await realGateway.sendInviteSms({
        phone: '9876543210',
        candidateName: 'Candidate',
        companyName: 'Employer',
        jobTitle: 'CNC Operator',
        language: 'hi',
      });

      expect(res.success).toBe(false);
      expect(res.message).toBe('no approved DLT template');
    });

    it('JobsService.sendInterviewInvite throws 503 ServiceUnavailableException with real Msg91SmsGateway', async () => {
      const mockJobRepo = {
        findById: vi.fn(async () => ({
          id: 'job-1',
          employer_id: 'emp-1',
          title: 'Lathe Operator',
        })),
      };
      const mockAppRepo = {
        findById: vi.fn(async () => ({
          id: 'app-1',
          job_id: 'job-1',
          applicant_id: 'seeker-1',
          status: 'shortlisted',
        })),
      };
      const mockProfileRepo = {
        findSeekerProfileByUserId: vi.fn(async () => ({ full_name: 'Amit Kumar' })),
        findBusinessProfileByUserId: vi.fn(async () => ({ company_name: 'Precision Works' })),
      };
      const mockUserRepo = {
        findById: vi.fn(async () => ({ id: 'seeker-1', phone: '9876543210' })),
      };

      const realGateway = new Msg91SmsGateway();
      const jobsService = new JobsService(
        mockJobRepo as unknown as JobRepository,
        mockAppRepo as unknown as ApplicationRepository,
        mockProfileRepo as unknown as ProfileRepository,
        {} as unknown as WalletService,
        mockUserRepo as unknown as UserRepository,
        realGateway,
        {} as unknown as import('../src/database/repositories/location.repository.js').LocationRepository,
      );

      await expect(
        jobsService.sendInterviewInvite('emp-1', 'app-1', 'employer'),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('BroadcastService.dispatchBroadcast returns 503 "no approved DLT template" in non-test env', async () => {
      const broadcastService = new BroadcastService(
        {} as unknown as QueueService,
        {} as unknown as AdminService,
        {} as unknown as ProfileRepository,
        {} as unknown as UserRepository,
        {} as unknown as CreditLedgerRepository,
        {} as unknown as SupabaseClient<Database>,
      );
      (broadcastService as unknown as { isTestMode: boolean }).isTestMode = false;

      await expect(
        broadcastService.dispatchBroadcast(
          { id: 'admin-1', role: 'admin' },
          {
            filters: {},
            templateId: 'DLT_MSME_NOTICE_EN',
            confirmationToken: 'CONFIRM_TOKEN_ABC123',
          },
        ),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  // =========================================================================
  // Requirement 6: Worker SMS live or hard failure in staging/production
  // =========================================================================
  describe('Worker SMS Non-Mock Behavior in Staging & Production (Prompt AC-6)', () => {
    it('does NOT bypass with QA whitelist in production', async () => {
      const workerSms = new WorkerSmsService();
      process.env['NODE_ENV'] = 'production';
      delete process.env['MSG91_AUTH_KEY'];

      const res = await workerSms.sendInviteSms({
        phone: '9876543210', // QA whitelist number
        language: 'en',
      });

      // In production, must NOT return qa_whitelist_invite_ mock success; it fails hard if auth key missing
      expect(res.success).toBe(false);
      expect(res.message).toContain('missing auth key');
    });

    it('does NOT bypass with mock mode in production', async () => {
      const workerSms = new WorkerSmsService();
      process.env['NODE_ENV'] = 'production';
      delete process.env['MSG91_AUTH_KEY'];

      const res = await workerSms.sendInviteSms({
        phone: '9123456789',
        language: 'en',
      });

      expect(res.success).toBe(false);
      expect(res.message).toContain('missing auth key');
    });
  });

  // =========================================================================
  // Requirement 7: Staging Safety Allowlists (SMS & Email)
  // =========================================================================
  describe('Staging Safety Allowlists (Prompt AC-7)', () => {
    describe('STAGING_SMS_ALLOWLIST', () => {
      it('skips and blocks unlisted phone number in staging', async () => {
        const gateway = new Msg91SmsGateway();
        process.env['APP_ENV'] = 'staging';
        process.env['NODE_ENV'] = 'production';
        process.env['STAGING_SMS_ALLOWLIST'] = '9876543210,9876543211';

        const mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);

        const res = await gateway.sendOtp({ phone: '9999988888', otp: '123456', language: 'en' });
        expect(res.success).toBe(false);
        expect(res.blocked_by_allowlist).toBe(true);
        expect(res.message).toContain('blocked_by_allowlist');
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('empty STAGING_SMS_ALLOWLIST blocks everything in staging', async () => {
        const gateway = new Msg91SmsGateway();
        process.env['APP_ENV'] = 'staging';
        process.env['NODE_ENV'] = 'production';
        process.env['STAGING_SMS_ALLOWLIST'] = '';

        const mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);

        const res = await gateway.sendOtp({ phone: '9876543210', otp: '123456', language: 'en' });
        expect(res.success).toBe(false);
        expect(res.blocked_by_allowlist).toBe(true);
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('allows listed phone number through in staging', async () => {
        const gateway = new Msg91SmsGateway();
        process.env['APP_ENV'] = 'staging';
        process.env['NODE_ENV'] = 'production';
        process.env['MSG91_AUTH_KEY'] = 'valid_staging_key';
        process.env['STAGING_SMS_ALLOWLIST'] = '9876543210,9876543211';

        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ type: 'success', request_id: 'req_stg_1' }),
        });
        vi.stubGlobal('fetch', mockFetch);

        const res = await gateway.sendOtp({ phone: '9876543210', otp: '123456', language: 'en' });
        expect(res.success).toBe(true);
        expect(res.blocked_by_allowlist).toBeUndefined();
        expect(mockFetch).toHaveBeenCalled();
      });

      it('STAGING_SMS_ALLOWLIST is NOT active in production', async () => {
        const gateway = new Msg91SmsGateway();
        process.env['APP_ENV'] = 'production';
        process.env['NODE_ENV'] = 'production';
        process.env['MSG91_AUTH_KEY'] = 'valid_prod_key';
        process.env['STAGING_SMS_ALLOWLIST'] = '9876543210'; // target number is not in allowlist

        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ type: 'success', request_id: 'req_prod_1' }),
        });
        vi.stubGlobal('fetch', mockFetch);

        const res = await gateway.sendOtp({ phone: '9999988888', otp: '123456', language: 'en' });
        expect(res.success).toBe(true);
        expect(res.blocked_by_allowlist).toBeUndefined();
        expect(mockFetch).toHaveBeenCalled();
      });
    });

    describe('STAGING_EMAIL_ALLOWLIST', () => {
      it('skips and blocks unlisted email in staging (API EmailService)', async () => {
        const emailService = new EmailService();
        process.env['APP_ENV'] = 'staging';
        process.env['NODE_ENV'] = 'production';
        process.env['STAGING_EMAIL_ALLOWLIST'] = 'allowed@example.com';

        const mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);

        const res = await emailService.sendEmail({
          to: 'blocked@example.com',
          subject: 'Test Subject',
          html: '<p>Test</p>',
        });

        expect(res.success).toBe(false);
        expect(res.blocked_by_allowlist).toBe(true);
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('skips and blocks unlisted email in staging (WorkerEmailService)', async () => {
        const workerEmail = new WorkerEmailService();
        process.env['APP_ENV'] = 'staging';
        process.env['NODE_ENV'] = 'production';
        process.env['STAGING_EMAIL_ALLOWLIST'] = 'qa@example.com';

        const mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);

        const res = await workerEmail.sendEmail({
          to: 'unapproved@example.com',
          subject: 'Alert Digest',
          html: '<p>Digest</p>',
        });

        expect(res.success).toBe(false);
        expect(res.blocked_by_allowlist).toBe(true);
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('allows listed email through in staging', async () => {
        const emailService = new EmailService();
        process.env['APP_ENV'] = 'staging';
        process.env['NODE_ENV'] = 'production';
        process.env['RESEND_API_KEY'] = 're_live_key_123';
        process.env['STAGING_EMAIL_ALLOWLIST'] = 'allowed@example.com';

        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ id: 'resend_email_id' }),
        });
        vi.stubGlobal('fetch', mockFetch);

        const res = await emailService.sendEmail({
          to: 'allowed@example.com',
          subject: 'Test Subject',
          html: '<p>Test</p>',
        });

        expect(res.success).toBe(true);
        expect(res.blocked_by_allowlist).toBeUndefined();
        expect(mockFetch).toHaveBeenCalled();
      });

      it('STAGING_EMAIL_ALLOWLIST is NOT active in production', async () => {
        const emailService = new EmailService();
        process.env['APP_ENV'] = 'production';
        process.env['NODE_ENV'] = 'production';
        process.env['RESEND_API_KEY'] = 're_live_key_prod';
        process.env['STAGING_EMAIL_ALLOWLIST'] = 'qa@example.com';

        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ id: 'prod_resend_email' }),
        });
        vi.stubGlobal('fetch', mockFetch);

        const res = await emailService.sendEmail({
          to: 'regular-user@example.com',
          subject: 'Welcome',
          html: '<p>Welcome</p>',
        });

        expect(res.success).toBe(true);
        expect(res.blocked_by_allowlist).toBeUndefined();
        expect(mockFetch).toHaveBeenCalled();
      });
    });
  });
});
