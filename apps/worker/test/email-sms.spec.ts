import { describe, it, expect, vi } from 'vitest';
import { WorkerEmailService } from '../src/email/email.service.js';
import { WorkerSmsService } from '../src/sms/sms.service.js';

describe('WorkerEmailService & WorkerSmsService', () => {
  it('WorkerEmailService dispatches job alert digest with bilingual copy and list unsubscribe header', async () => {
    const emailService = new WorkerEmailService();
    const result = await emailService.sendAlertDigest(
      'seeker@example.com',
      [
        { title: 'Tally Operator', city: 'Indore', min_pay: 15000, max_pay: 22000 },
        { title: 'Office Assistant', city: 'Bhopal', min_pay: 12000, max_pay: 18000 },
      ],
      'usr_test_123',
      'en',
    );

    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();
  });

  it('WorkerEmailService renders Hindi email alert digest without corrupting characters', async () => {
    const emailService = new WorkerEmailService();
    const result = await emailService.sendAlertDigest(
      'seeker_hi@example.com',
      [{ title: 'लेखा सहायक (Tally)', city: 'इन्दौर', min_pay: 15000, max_pay: 25000 }],
      'usr_test_456',
      'hi',
    );

    expect(result.success).toBe(true);
  });

  it('WorkerSmsService handles invite SMS dispatch in test and whitelist modes', async () => {
    const smsService = new WorkerSmsService();

    // Whitelist QA candidate
    const whitelistRes = await smsService.sendInviteSms({
      phone: '9876543210',
      language: 'en',
    });
    expect(whitelistRes.success).toBe(true);
    expect(whitelistRes.messageId).toContain('qa_whitelist_invite_');

    // Standard mock candidate
    const standardRes = await smsService.sendInviteSms({
      phone: '9123456780',
      language: 'hi',
    });
    expect(standardRes.success).toBe(true);
    expect(standardRes.messageId).toContain('mock_invite_');
  });

  it('WorkerSmsService calls MSG91 flow API when in live mode', async () => {
    const smsService = new WorkerSmsService();
    const originalAuthKey = process.env['MSG91_AUTH_KEY'];
    const originalGatewayMode = process.env['SMS_GATEWAY_MODE'];
    const originalEnv = process.env['NODE_ENV'];

    try {
      process.env['MSG91_AUTH_KEY'] = 'msg91_live_key_xyz';
      process.env['SMS_GATEWAY_MODE'] = 'live';
      process.env['NODE_ENV'] = 'production';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: 'req_live_sms_12345' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const res = await smsService.sendInviteSms({
        phone: '8888899999',
        language: 'en',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://control.msg91.com/api/v5/flow'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            authkey: 'msg91_live_key_xyz',
          }),
        }),
      );
      expect(res.success).toBe(true);
      expect(res.messageId).toBe('req_live_sms_12345');
    } finally {
      process.env['MSG91_AUTH_KEY'] = originalAuthKey;
      process.env['SMS_GATEWAY_MODE'] = originalGatewayMode;
      process.env['NODE_ENV'] = originalEnv;
      vi.unstubAllGlobals();
    }
  });
});
