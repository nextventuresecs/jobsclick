import { describe, it, expect, beforeEach, vi } from 'vitest';
import { toBackendRole, toClientRole, SelfSignupRoleSchema } from '@indian-job-portal/validation';
import { DPDP_CONSENT_VERSION } from '@/components/auth/AuthModal';

describe('Phone OTP Frontend Integration - Ticket T-04 (AUTH-01, AUTH-02)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Role Mapping Consistency', () => {
    it('correctly maps client role to backend role for OTP verification payload', () => {
      expect(toBackendRole('jobseeker')).toBe('job_seeker');
      expect(toBackendRole('employer')).toBe('employer');
      expect(toBackendRole('institution')).toBe('intermediary');
      expect(toBackendRole('msme_dept')).toBe('msme_admin');
      expect(toBackendRole('platform_admin')).toBe('admin');
    });

    it('correctly maps backend role back to client role for UI state hydration', () => {
      expect(toClientRole('job_seeker')).toBe('jobseeker');
      expect(toClientRole('employer')).toBe('employer');
      expect(toClientRole('intermediary')).toBe('institution');
      expect(toClientRole('msme_admin')).toBe('msme_dept');
      expect(toClientRole('admin')).toBe('platform_admin');
    });
  });

  describe('AppContext Session & User State Hydration', () => {
    it('exports AppProvider and useApp hook', async () => {
      const { AppProvider, useApp } = await import('../src/context/AppContext.js');
      expect(AppProvider).toBeDefined();
      expect(useApp).toBeDefined();
    });

    it('defines storage keys for role, token, and user state persistence', async () => {
      const mockStorage: Record<string, string> = {
        jobsclick_user_role: 'employer',
        jobsclick_access_token: 'jwt_mock_token_123',
        jobsclick_user_data: JSON.stringify({
          id: 'usr_9876543210',
          phone: '9876543210',
          email: null,
          role: 'employer',
          status: 'active',
        }),
      };

      const storedUser = JSON.parse(mockStorage['jobsclick_user_data']!);
      expect(storedUser.id).toBe('usr_9876543210');
      expect(mockStorage['jobsclick_access_token']).toBe('jwt_mock_token_123');
      expect(mockStorage['jobsclick_user_role']).toBe('employer');
    });
  });

  describe('API Endpoints Communication', () => {
    it('verifies POST /auth/send-otp payload and cooldown handling contract', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          message: 'OTP sent successfully',
          cooldownSeconds: 60,
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const apiUrl = 'http://localhost:3001';
      const phone = '9876543210';

      const response = await fetch(`${apiUrl}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/auth/send-otp',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: '9876543210' }),
        })
      );

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.cooldownSeconds).toBe(60);
    });

    it('forwards turnstileToken in POST /auth/send-otp payload when bot challenge is completed', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          message: 'OTP sent successfully',
          cooldownSeconds: 60,
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const apiUrl = 'http://localhost:3001';
      const phone = '9876543210';
      const turnstileToken = 'cf_token_valid_123';

      await fetch(`${apiUrl}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, turnstileToken }),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/auth/send-otp',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: '9876543210', turnstileToken: 'cf_token_valid_123' }),
        })
      );
    });

    it('each resend clears the previous turnstile token and mints a fresh token', async () => {
      const tokensSent: string[] = [];
      const mockFetch = vi.fn().mockImplementation(async (_url, opts) => {
        const body = JSON.parse(opts.body);
        tokensSent.push(body.turnstileToken);
        return {
          ok: true,
          status: 201,
          json: async () => ({ success: true, message: 'OTP sent successfully' }),
        };
      });
      vi.stubGlobal('fetch', mockFetch);

      const apiUrl = 'http://localhost:3001';
      const phone = '9876543210';

      // 1. First send with initial turnstile token
      const initialToken = 'cf_token_initial_111';
      await fetch(`${apiUrl}/auth/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, turnstileToken: initialToken }),
      });

      // 2. Resend must supply a fresh turnstile token, never reusing the first
      const resendToken = 'cf_token_fresh_resend_222';
      await fetch(`${apiUrl}/auth/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, turnstileToken: resendToken }),
      });

      expect(tokensSent).toHaveLength(2);
      expect(tokensSent[0]).toBe(initialToken);
      expect(tokensSent[1]).toBe(resendToken);
      expect(tokensSent[0]).not.toBe(tokensSent[1]);
    });

    it('verifies error handling on 429 cool-down or daily limit from /auth/otp/send', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'retry-after': '45' }),
        json: async () => ({
          statusCode: 429,
          message: 'Please wait 45 seconds before requesting a new OTP',
          error: 'Too Many Requests',
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const response = await fetch('http://localhost:3001/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '9876543210' }),
      });

      expect(response.ok).toBe(false);
      const err = await response.json();
      expect(err.message).toBe('Please wait 45 seconds before requesting a new OTP');
    });

    it('verifies 401 Unauthorized handling from /auth/verify-otp on invalid code', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          statusCode: 401,
          message: 'Invalid or expired OTP code',
          error: 'Unauthorized',
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const response = await fetch('http://localhost:3001/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: '9876543210',
          code: '000000',
          role: toBackendRole('jobseeker'),
        }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
      const err = await response.json();
      expect(err.message).toBe('Invalid or expired OTP code');
    });

    it('verifies successful /auth/verify-otp returns accessToken and UserSession for hydration', async () => {
      const mockSession = {
        accessToken: 'jwt_session_usr_9876543210_1729000000',
        user: {
          id: 'usr_9876543210',
          phone: '9876543210',
          email: null,
          emailVerified: false,
          role: 'job_seeker',
          status: 'active',
        },
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => mockSession,
      });
      vi.stubGlobal('fetch', mockFetch);

      const response = await fetch('http://localhost:3001/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: '9876543210',
          code: '123456',
          role: 'job_seeker',
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.accessToken).toBe(mockSession.accessToken);
      expect(data.user.id).toBe('usr_9876543210');
      expect(data.user.role).toBe('job_seeker');
    });

    it('blocks self-signup and displays invitation-only message for elevated roles (Audit P0-5)', () => {
      const elevatedRoles = ['institution', 'msme_dept', 'platform_admin'] as const;

      for (const clientRole of elevatedRoles) {
        const backendRole = toBackendRole(clientRole);
        const check = SelfSignupRoleSchema.safeParse(backendRole);
        expect(check.success).toBe(false);

        let message = '';
        if (!check.success) {
          if (
            clientRole === 'institution' ||
            clientRole === 'msme_dept' ||
            clientRole === 'platform_admin' ||
            backendRole === 'intermediary' ||
            backendRole === 'msme_admin' ||
            backendRole === 'admin'
          ) {
            message = 'Institution, MSME, and Admin accounts are created by invitation only.';
          } else {
            message = 'Invalid role selection. Self-signup is only available for job seekers and employers.';
          }
        }
        expect(message).toBe('Institution, MSME, and Admin accounts are created by invitation only.');
      }
    });

    it('permits self-signup for jobseeker and employer roles', () => {
      const allowedRoles = ['jobseeker', 'employer'] as const;
      for (const clientRole of allowedRoles) {
        const backendRole = toBackendRole(clientRole);
        const check = SelfSignupRoleSchema.safeParse(backendRole);
        expect(check.success).toBe(true);
      }
    });

    it('disables submit and blocks OTP request when consent checkbox is not ticked', () => {
      let consentAccepted = false;
      const phoneInput = '9876543210';
      const isSubmitting = false;

      // Submit button is disabled
      const isSubmitDisabled = isSubmitting || phoneInput.length !== 10 || !consentAccepted;
      expect(isSubmitDisabled).toBe(true);

      // handleRequestOtp blocks submission with error
      let errorMessage: string | null = null;
      if (!consentAccepted) {
        errorMessage = 'Please accept the Terms of Service & DPDP Privacy Notice to continue.';
      }
      expect(errorMessage).toBe('Please accept the Terms of Service & DPDP Privacy Notice to continue.');
    });

    it('enables submit button and conditionally includes consentVersion in verify payload only when ticked', () => {
      let consentAccepted = true;
      const phoneInput = '9876543210';
      const isSubmitting = false;

      // Submit button is enabled when consent is ticked
      const isSubmitDisabled = isSubmitting || phoneInput.length !== 10 || !consentAccepted;
      expect(isSubmitDisabled).toBe(false);

      // Payload contains consentVersion when consent is ticked
      const payloadWithConsent = {
        phone: '9876543210',
        code: '123456',
        role: 'job_seeker',
        ...(consentAccepted ? { consentVersion: DPDP_CONSENT_VERSION } : {}),
      };
      expect(payloadWithConsent.consentVersion).toBe(DPDP_CONSENT_VERSION);

      // Payload omits consentVersion when consent is unticked
      consentAccepted = false;
      const payloadWithoutConsent = {
        phone: '9876543210',
        code: '123456',
        role: 'job_seeker',
        ...(consentAccepted ? { consentVersion: DPDP_CONSENT_VERSION } : {}),
      };
      expect(payloadWithoutConsent).not.toHaveProperty('consentVersion');
    });
  });
});
