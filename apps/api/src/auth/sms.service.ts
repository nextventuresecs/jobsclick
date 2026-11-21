import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isStaging, isStrictEnv } from '@indian-job-portal/validation';
import { DLT_SMS_TEMPLATES } from './sms-templates.js';
import { captureException } from '../config/sentry.js';
import { maskPhone, scrubSensitiveData } from '../common/mask.js';

export interface SendOtpOptions {
  phone: string;
  otp: string;
  language?: 'en' | 'hi';
}

export interface SmsResponse {
  success: boolean;
  message: string;
  messageId?: string;
  blocked_by_allowlist?: boolean;
}

export interface SendInviteSmsOptions {
  phone: string;
  candidateName?: string;
  companyName?: string;
  jobTitle?: string;
  language?: 'en' | 'hi';
}

export abstract class SmsGateway {
  abstract sendOtp(options: SendOtpOptions): Promise<SmsResponse>;
  abstract sendInviteSms(options: SendInviteSmsOptions): Promise<SmsResponse>;
}

@Injectable()
export class Msg91SmsGateway extends SmsGateway {
  private readonly logger = new Logger(Msg91SmsGateway.name);

  /**
   * Dispatches OTP SMS through live MSG91 gateway using approved DLT template IDs.
   * OTP_EN (English: 1277179301139811147) | OTP_HI (Hindi: 1277179312348407947)
   */
  async sendOtp(options: SendOtpOptions): Promise<SmsResponse> {
    const { phone, otp, language = 'en' } = options;
    const authKey = process.env['MSG91_AUTH_KEY'];
    const senderId = process.env['MSG91_SENDER_ID'] || 'JOBSCK';

    // Staging safety allowlist gate (active ONLY in staging; not active in production)
    if (isStaging()) {
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);
      const allowlistRaw = process.env['STAGING_SMS_ALLOWLIST'] || '';
      const allowlist = allowlistRaw
        .split(',')
        .map((s) => s.trim().replace(/\D/g, '').slice(-10))
        .filter(Boolean);

      if (allowlist.length === 0 || !allowlist.includes(cleanPhone)) {
        this.logger.log(`[Staging SMS Gate] OTP SMS to ${maskPhone(phone)} skipped: blocked_by_allowlist`);
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
      templateId = process.env['MSG91_OTP_TEMPLATE_ID_HI'] || DLT_SMS_TEMPLATES['OTP_HI']?.templateId;
    } else {
      templateId = process.env['MSG91_OTP_TEMPLATE_ID'] || DLT_SMS_TEMPLATES['OTP_EN']?.templateId;
    }

    if (!templateId) {
      if (isStrictEnv()) {
        this.logger.error(`[MSG91 Gateway Error] Missing DLT template configuration for OTP (${language})`);
        return {
          success: false,
          message: `Missing DLT template configuration for OTP (${language})`,
        };
      }
      templateId = language === 'hi' ? '1277179312348407947' : '1277179301139811147';
    }

    if (!authKey) {
      this.logger.error(`[MSG91 Gateway Error] MSG91_AUTH_KEY is not configured when dispatching to ${maskPhone(phone)}`);
      return {
        success: false,
        message: 'SMS service configuration error: missing auth key',
      };
    }

    try {
      const msg91Url = new URL('https://control.msg91.com/api/v5/otp');
      msg91Url.searchParams.set('template_id', templateId);
      msg91Url.searchParams.set('mobile', `91${phone}`);
      msg91Url.searchParams.set('otp_expiry', '10');

      const response = await fetch(msg91Url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authkey: authKey,
        },
        body: JSON.stringify({
          otp,
          sender: senderId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const scrubbedError = scrubSensitiveData(errorText);
        this.logger.error(`[MSG91 Gateway Error] HTTP ${response.status} dispatching to ${maskPhone(phone)}: ${scrubbedError}`);
        captureException(new Error(`MSG91 OTP delivery failed: ${response.status} ${scrubbedError}`));
        return {
          success: false,
          message: `SMS gateway error: ${response.statusText}`,
        };
      }

      const resData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      this.logger.log(
        `[SMS Hook - MSG91 Live] Successfully delivered OTP to ${maskPhone(phone)} via template ${templateId}`
      );

      return {
        success: true,
        message: 'OTP delivered via MSG91',
        messageId:
          (resData['message'] as string) ||
          (resData['request_id'] as string) ||
          randomUUID(),
      };
    } catch (err) {
      this.logger.error(`[MSG91 Network Exception] dispatching to ${maskPhone(phone)}: ${err instanceof Error ? err.message : String(err)}`);
      captureException(err instanceof Error ? err : new Error(String(err)));
      return {
        success: false,
        message: 'SMS delivery network failure',
      };
    }
  }

  /**
   * Dispatches confidential interview invite SMS.
   * NOTE: No approved Jio DLT template exists for interview invites yet.
   * Must return error indicating 'no approved DLT template' (503 Service Unavailable upstream).
   */
  async sendInviteSms(options: SendInviteSmsOptions): Promise<SmsResponse> {
    this.logger.warn(
      `[MSG91 Gateway] Interview invite SMS dispatch attempted to ${maskPhone(options.phone)}, but no approved DLT template exists`
    );
    return {
      success: false,
      message: 'no approved DLT template',
    };
  }
}

export { Msg91SmsGateway as SmsService };
export { Msg91SmsGateway as Msg91SmsService };
