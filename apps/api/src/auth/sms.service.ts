import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isTestEnv } from '@indian-job-portal/validation';
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
   * DLT_1001_OTP_EN (English) | DLT_1002_OTP_HI (Hindi)
   */
  async sendOtp(options: SendOtpOptions): Promise<SmsResponse> {
    const { phone, otp, language = 'en' } = options;
    const authKey = process.env['MSG91_AUTH_KEY'];
    const senderId = process.env['MSG91_SENDER_ID'] || 'JOBSCK';

    const templateKey = language === 'hi' ? 'OTP_HI' : 'OTP_EN';
    const templateConfig = DLT_SMS_TEMPLATES[templateKey];
    const templateId =
      process.env['MSG91_OTP_TEMPLATE_ID'] ||
      templateConfig?.templateId ||
      '1277179301139811147';

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
   * Dispatches confidential interview invite SMS via approved Jio DLT invite template
   * DLT_1003_INVITE_CANDIDATE_HI (1277179291746795224)
   */
  async sendInviteSms(options: SendInviteSmsOptions): Promise<SmsResponse> {
    const { phone, language = 'en' } = options;
    const authKey = process.env['MSG91_AUTH_KEY'];
    const senderId = process.env['MSG91_SENDER_ID'] || 'JOBSCK';

    const templateKey = language === 'hi' ? 'INVITE_HI' : 'INVITE_EN';
    const templateConfig = DLT_SMS_TEMPLATES[templateKey];
    const templateId =
      process.env['MSG91_INVITE_TEMPLATE_ID'] ||
      templateConfig?.templateId ||
      '1277179291746795224';

    if (!authKey) {
      if (isTestEnv()) {
        this.logger.log(`[MSG91 Gateway] Live SMS key not configured; mock-dispatched interview invite to ${maskPhone(phone)}`);
        return {
          success: true,
          message: 'Interview invite sent via SMS (mock mode)',
          messageId: randomUUID(),
        };
      }
      this.logger.error(`[MSG91 Gateway Error] MSG91_AUTH_KEY is not configured when dispatching invite to ${maskPhone(phone)}`);
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
              name: options.candidateName || 'Candidate',
              company: options.companyName || 'Employer',
              job: options.jobTitle || 'Job',
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const scrubbedError = scrubSensitiveData(errorText);
        this.logger.error(`[MSG91 Invite Error] HTTP ${response.status} dispatching to ${maskPhone(phone)}: ${scrubbedError}`);
        captureException(new Error(`MSG91 invite delivery failed: ${response.status} ${scrubbedError}`));
        return {
          success: false,
          message: `SMS gateway error: ${response.statusText}`,
        };
      }

      this.logger.log(`[SMS Hook - MSG91 Live] Successfully delivered interview invite to ${maskPhone(phone)}`);
      return {
        success: true,
        message: 'Interview invite sent via MSG91',
        messageId: randomUUID(),
      };
    } catch (err) {
      this.logger.error(`[MSG91 Network Exception] dispatching invite to ${maskPhone(phone)}: ${err instanceof Error ? err.message : String(err)}`);
      captureException(err instanceof Error ? err : new Error(String(err)));
      return {
        success: false,
        message: 'SMS delivery network failure',
      };
    }
  }
}

export { Msg91SmsGateway as SmsService };
export { Msg91SmsGateway as Msg91SmsService };
