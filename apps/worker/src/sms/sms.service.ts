import { captureException } from '../config/sentry.js';

export interface SendInviteSmsOptions {
  phone: string;
  language?: 'en' | 'hi';
  inviteUrl?: string;
}

export interface SmsResponse {
  success: boolean;
  message: string;
  messageId?: string;
}

export class WorkerSmsService {
  /**
   * Dispatches candidate invitation SMS through MSG91 gateway using DLT template.
   * DLT_2001_INVITE_EN (English) | DLT_2002_INVITE_HI (Hindi)
   */
  async sendInviteSms(options: SendInviteSmsOptions): Promise<SmsResponse> {
    const { phone, language = 'en', inviteUrl = 'https://jobsclick.live' } = options;
    const isTestMode = process.env['NODE_ENV'] === 'test';
    const authKey = process.env['MSG91_AUTH_KEY'];
    const templateId =
      process.env['MSG91_INVITE_TEMPLATE_ID'] ||
      (language === 'hi' ? 'DLT_2002_INVITE_HI' : 'DLT_2001_INVITE_EN');

    const gatewayMode =
      process.env['SMS_GATEWAY_MODE'] ||
      (authKey && authKey !== 'dummy-msg91-key'
        ? (process.env['NODE_ENV'] === 'production' ? 'live' : 'sandbox')
        : 'mock');

    // QA whitelist range (+919876543210 through +919876543219)
    const isTestWhitelist = gatewayMode !== 'live' && phone.startsWith('987654321') && phone.length === 10;
    if (isTestWhitelist) {
      console.log(`[Worker SMS Hook - QA Whitelist] Invite SMS for +91${phone} via ${templateId} (Static QA Bypass)`);
      return {
        success: true,
        message: 'Invite SMS dispatched via MSG91 mock handler (QA whitelist)',
        messageId: `qa_whitelist_invite_${Date.now()}`,
      };
    }

    if (isTestMode || gatewayMode === 'mock' || !authKey || authKey === 'dummy-msg91-key') {
      console.log(`[Worker SMS Hook - Mock] Invite SMS for +91${phone} via ${templateId}`);
      return {
        success: true,
        message: 'Invite SMS dispatched via MSG91 mock handler',
        messageId: `mock_invite_${Date.now()}`,
      };
    }

    if (gatewayMode === 'sandbox') {
      console.log(`[Worker SMS Hook - Sandbox] Invite SMS for +91${phone} via ${templateId} (DLT Pending)`);
      return {
        success: true,
        message: 'Invite SMS processed via MSG91 sandbox',
        messageId: `sandbox_invite_${Date.now()}`,
      };
    }

    try {
      const msg91Url = new URL('https://control.msg91.com/api/v5/flow');
      const response = await fetch(msg91Url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authkey: authKey,
        },
        body: JSON.stringify({
          template_id: templateId,
          short_url: '0',
          recipients: [
            {
              mobiles: `91${phone}`,
              url: inviteUrl,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Worker MSG91 Error] HTTP ${response.status}: ${errorText}`);
        captureException(new Error(`MSG91 Invite delivery failed: ${response.status} ${errorText}`));
        return {
          success: false,
          message: `SMS gateway error: ${response.statusText}`,
        };
      }

      const resData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      console.log(`[Worker MSG91 Live] Successfully delivered Invite SMS to +91${phone} via template ${templateId}`);
      return {
        success: true,
        message: 'Invite SMS delivered via MSG91',
        messageId: (resData['message'] as string) || `msg91_inv_${Date.now()}`,
      };
    } catch (err) {
      console.error(`[Worker MSG91 Exception] ${err}`);
      captureException(err instanceof Error ? err : new Error(String(err)));
      return {
        success: false,
        message: 'SMS delivery network failure',
      };
    }
  }
}
