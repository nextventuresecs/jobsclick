import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailService } from '../src/email/email.service.js';

describe('EmailService (Resend Provider & Domain jobsclick.live)', () => {
  let service: EmailService;

  beforeEach(() => {
    service = new EmailService();
  });

  it('formats and dispatches email via Resend mock handler in test environment', async () => {
    const result = await service.sendEmail({
      to: 'candidate@example.com',
      subject: 'Test Subject',
      html: '<p>Test Email Body</p>',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();
    expect(result.messageId).toContain('mock_email_');
  });

  it('renders bilingual email verification template with secure link', async () => {
    const enResult = await service.sendVerificationEmail('candidate_en@example.com', 'tok_123', 'en');
    expect(enResult.success).toBe(true);

    const hiResult = await service.sendVerificationEmail('candidate_hi@example.com', 'tok_456', 'hi');
    expect(hiResult.success).toBe(true);
  });

  it('dispatches live email through Resend API when live key is provided', async () => {
    const originalApiKey = process.env['RESEND_API_KEY'];
    const originalEnv = process.env['NODE_ENV'];

    try {
      process.env['RESEND_API_KEY'] = 're_test_live_key';
      process.env['NODE_ENV'] = 'production';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'email_live_987654' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await service.sendEmail({
        to: 'hiring@msme.in',
        subject: 'Candidate Applied',
        html: '<p>A candidate applied to your job.</p>',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer re_test_live_key',
          }),
        }),
      );

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('email_live_987654');
    } finally {
      process.env['RESEND_API_KEY'] = originalApiKey;
      process.env['NODE_ENV'] = originalEnv;
      vi.unstubAllGlobals();
    }
  });

  it('handles Resend API error responses gracefully without throwing', async () => {
    const originalApiKey = process.env['RESEND_API_KEY'];
    const originalEnv = process.env['NODE_ENV'];

    try {
      process.env['RESEND_API_KEY'] = 're_test_live_key';
      process.env['NODE_ENV'] = 'production';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => 'Domain jobsclick.live not verified yet',
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await service.sendEmail({
        to: 'test@invalid.com',
        subject: 'Test Failure',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Resend error: Forbidden');
    } finally {
      process.env['RESEND_API_KEY'] = originalApiKey;
      process.env['NODE_ENV'] = originalEnv;
      vi.unstubAllGlobals();
    }
  });
});
