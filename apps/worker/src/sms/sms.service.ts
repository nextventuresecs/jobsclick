import { randomUUID } from 'node:crypto';
import { isStaging, isTestEnv } from '@indian-job-portal/validation';
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
  blocked_by_allowlist?: boolean;
}

export const WORKER_INVITE_DLT_TEMPLATES = {
  INVITE_EN: {
    templateId: '1277179291095585071',
    templateName: 'JOBSCLICK_INVITE_CANDIDATE_EN',
    language: 'en' as const,
    senderId: 'JOBSCK',
  },
  INVITE_HI: {
    templateId: '1277179291746795224',
    templateName: 'JOBSCLICK_INVITE_CANDIDATE_HI',
    language: 'hi' as const,
    senderId: 'JOBSCK',
  },
} as const;

export class WorkerSmsService {
  /**
   * Dispatches candidate invitation SMS through MSG91 gateway using approved DLT templates:
   * INVITE_EN (1277179291095585071) | INVITE_HI (1277179291746795224)
   */
  async sendInviteSms(options: SendInviteSmsOptions): Promise<SmsResponse> {
    const defaultInvite = process.env['APP_URL'] || process.env['WEB_URL'] || 'http://localhost:3000';
    const { phone, language = 'en', inviteUrl = defaultInvite } = options;
    const authKey = process.env['MSG91_AUTH_KEY'];
    const senderId = process.env['MSG91_SENDER_ID'] || 'JOBSCK';

    // Mock and QA whitelist branches MUST run ONLY when isTestEnv()
    if (isTestEnv()) {
      // QA whitelist range (+919876543210 through +919876543219)
      const isTestWhitelist = phone.startsWith('987654321') && phone.length === 10;
      if (isTestWhitelist) {
        console.log(`[Worker SMS Hook - QA Whitelist] Invite SMS for +91${phone} (Static QA Bypass)`);
        return {
          success: true,
          message: 'Invite SMS dispatched via MSG91 mock handler (QA whitelist)',
          messageId: `qa_whitelist_invite_${randomUUID()}`,
        };
      }

      console.log(`[Worker SMS Hook - Mock] Invite SMS for +91${phone}`);
      return {
        success: true,
        message: 'Invite SMS dispatched via MSG91 mock handler',
        messageId: `mock_invite_${randomUUID()}`,
      };
    }

    // Staging safety allowlist gate (active ONLY in staging; not active in production)
    if (isStaging()) {
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);
      const allowlistRaw = process.env['STAGING_SMS_ALLOWLIST'] || '';
      const allowlist = allowlistRaw
        .split(',')
        .map((s) => s.trim().replace(/\D/g, '').slice(-10))
        .filter(Boolean);

      if (allowlist.length === 0 || !allowlist.includes(cleanPhone)) {
        console.log(
          `[Worker SMS Staging Gate] Invite SMS to +91${cleanPhone.slice(-4).padStart(cleanPhone.length, 'X')} skipped: blocked_by_allowlist`,
        );
        return {
          success: true,
          message: 'SMS skipped: blocked_by_allowlist',
          messageId: `staging_allowlist_blocked_${randomUUID()}`,
          blocked_by_allowlist: true,
        };
      }
    }

    // Language selection with env overrides; no cross-language fallback
    let templateId: string | undefined;
    if (language === 'hi') {
      templateId = process.env['MSG91_INVITE_TEMPLATE_ID_HI'] || WORKER_INVITE_DLT_TEMPLATES.INVITE_HI.templateId;
    } else {
      templateId = process.env['MSG91_INVITE_TEMPLATE_ID'] || WORKER_INVITE_DLT_TEMPLATES.INVITE_EN.templateId;
    }

    if (!templateId) {
      console.error(`[Worker SMS Error] Missing DLT template configuration for invite (${language})`);
      return {
        success: false,
        message: `Missing DLT template configuration for invite (${language})`,
      };
    }

    // In staging and production, missing or dummy auth key is a hard failure
    if (!authKey || authKey === 'dummy-msg91-key') {
      console.error(
        `[Worker SMS Error] MSG91_AUTH_KEY is not configured or dummy in strict env when dispatching to +91${phone}`,
      );
      return {
        success: false,
        message: 'SMS service configuration error: missing auth key',
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
          sender: senderId,
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
        messageId: (resData['message'] as string) || randomUUID(),
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
