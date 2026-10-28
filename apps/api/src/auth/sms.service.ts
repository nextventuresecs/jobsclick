import { Injectable, Logger } from '@nestjs/common';
import { DLT_SMS_TEMPLATES } from './sms-templates.js';
import { captureException } from '../config/sentry.js';

export interface SendOtpOptions {
  phone: string;
  otp: string;
  language?: 'en' | 'hi';
}

export interface SmsResponse {
  success: boolean;
  message: string;
  messageId?: string;
}

@Injectable()
export class Msg91SmsService {
  private readonly logger = new Logger(Msg91SmsService.name);

  /**
   * Dispatches OTP SMS through MSG91 gateway using approved DLT template IDs.
   * DLT_1001_OTP_EN (English) | DLT_1002_OTP_HI (Hindi)
   */
  async sendOtp(options: SendOtpOptions): Promise<SmsResponse> {
    const { phone, otp, language = 'en' } = options;
    const isTestMode = process.env['NODE_ENV'] === 'test';
    const authKey = process.env['MSG91_AUTH_KEY'];
    const senderId = process.env['MSG91_SENDER_ID'] || 'JOBSCK';

    const templateKey = language === 'hi' ? 'OTP_HI' : 'OTP_EN';
    const templateConfig = DLT_SMS_TEMPLATES[templateKey];
    const templateId =
      process.env['MSG91_OTP_TEMPLATE_ID'] ||
      templateConfig?.templateId ||
      '1277179301139811147';

    // 1. Gateway mode selection: mock | sandbox | live
    const gatewayMode =
      process.env['SMS_GATEWAY_MODE'] ||
      (authKey && authKey !== 'dummy-msg91-key'
        ? (process.env['NODE_ENV'] === 'production' ? 'live' : 'sandbox')
        : 'mock');

    // 2. Reserved test QA whitelist range (+919876543210 through +919876543219)
    // Only intercepts when not in live production mode
    const isTestWhitelist = gatewayMode !== 'live' && phone.startsWith('987654321') && phone.length === 10;
    if (isTestWhitelist) {
      this.logger.log(
        `[SMS Hook - QA Whitelist] OTP for +91${phone}: ${otp} (Static QA Bypass)`
      );
      return {
        success: true,
        message: 'OTP dispatched via MSG91 mock handler (QA whitelist)',
        messageId: `qa_whitelist_${Date.now()}`,
      };
    }

    // In test mode, mock mode, or missing credentials, log mock delivery
    if (isTestMode || gatewayMode === 'mock' || !authKey || authKey === 'dummy-msg91-key') {
      this.logger.log(
        `[SMS Hook - MSG91 Mock] OTP for +91${phone}: ${otp} (Template: ${templateId})`
      );
      return {
        success: true,
        message: 'OTP dispatched via MSG91 mock handler',
        messageId: `mock_msg_${Date.now()}`,
      };
    }

    // In sandbox mode (DLT template approval pending), log delivery and simulate success
    if (gatewayMode === 'sandbox') {
      this.logger.log(
        `[SMS Hook - MSG91 Sandbox (DLT Pending)] OTP for +91${phone}: ${otp} (Template: ${templateId})`
      );
      return {
        success: true,
        message: 'OTP processed via MSG91 sandbox (DLT pending)',
        messageId: `sandbox_msg_${Date.now()}`,
      };
    }

    try {
      const msg91Url = new URL('https://control.msg91.com/api/v5/otp');
      msg91Url.searchParams.set('template_id', templateId);
      msg91Url.searchParams.set('mobile', `91${phone}`);
      msg91Url.searchParams.set('authkey', authKey);
      msg91Url.searchParams.set('otp', otp);
      msg91Url.searchParams.set('sender', senderId);
      msg91Url.searchParams.set('otp_expiry', '10');

      const response = await fetch(msg91Url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`[MSG91 Gateway Error] HTTP ${response.status}: ${errorText}`);
        captureException(new Error(`MSG91 OTP delivery failed: ${response.status} ${errorText}`));
        return {
          success: false,
          message: `SMS gateway error: ${response.statusText}`,
        };
      }

      const resData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      this.logger.log(
        `[SMS Hook - MSG91 Live] Successfully delivered OTP to +91${phone} via template ${templateId}`
      );

      return {
        success: true,
        message: 'OTP delivered via MSG91',
        messageId:
          (resData['message'] as string) ||
          (resData['request_id'] as string) ||
          `msg91_${Date.now()}`,
      };
    } catch (err) {
      this.logger.error(`[MSG91 Network Exception] ${err}`);
      captureException(err instanceof Error ? err : new Error(String(err)));
      return {
        success: false,
        message: 'SMS delivery network failure',
      };
    }
  }

  /**
   * Verifies Cloudflare Turnstile token via the siteverify API.
   */
  async verifyTurnstile(token?: string, clientIp?: string): Promise<boolean> {
    if (!token) return false;

    const isTestMode = process.env['NODE_ENV'] === 'test';
    const secretKey = process.env['TURNSTILE_SECRET_KEY'];

    if (token === 'invalid-token' || token === 'fail-token') {
      return false;
    }

    if (isTestMode) {
      return true;
    }

    if (!secretKey || secretKey === 'dummy-turnstile-secret-key') {
      return true;
    }

    try {
      const form = new URLSearchParams();
      form.append('secret', secretKey);
      form.append('response', token);
      if (clientIp) {
        form.append('remoteip', clientIp);
      }

      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });

      if (!res.ok) {
        return false;
      }

      const outcome = (await res.json()) as { success: boolean };
      return Boolean(outcome.success);
    } catch (err) {
      this.logger.error(`[Turnstile Exception] ${err}`);
      captureException(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }
}
