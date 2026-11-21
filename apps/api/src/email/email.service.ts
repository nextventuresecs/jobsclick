import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isStaging, isTestEnv } from '@indian-job-portal/validation';
import { captureException } from '../config/sentry.js';
import { maskEmail } from '../common/mask.js';
import type { IEmailService, SendEmailOptions, SendEmailResult } from './email.interface.js';

@Injectable()
export class EmailService implements IEmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly defaultFrom =
    process.env['EMAIL_FROM'] || 'JobsClick <notifications@example.com>';

  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    const apiKey = process.env['RESEND_API_KEY'];
    const isMock = isTestEnv() || !apiKey || apiKey === 're_dummy_resend_api_key';

    const from = options.from || this.defaultFrom;
    const recipients = Array.isArray(options.to) ? options.to : [options.to];

    let activeRecipients = recipients;
    if (isStaging()) {
      const allowlistRaw = process.env['STAGING_EMAIL_ALLOWLIST'] || '';
      const allowlist = allowlistRaw
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      activeRecipients = recipients.filter((r) => allowlist.includes(r.trim().toLowerCase()));
      if (activeRecipients.length === 0) {
        this.logger.log(
          `[Staging Email Gate] Email to ${recipients.map((r) => maskEmail(r)).join(', ')} skipped: blocked_by_allowlist`,
        );
        return {
          success: true,
          messageId: `staging_email_blocked_${randomUUID()}`,
          blocked_by_allowlist: true,
        };
      }
    }

    if (isMock) {
      this.logger.log(
        `[Resend Email Mock] Dispatched email to ${activeRecipients.join(', ')} | Subject: "${options.subject}" (Sender: ${from})`,
      );
      return {
        success: true,
        messageId: randomUUID(),
      };
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: activeRecipients,
          subject: options.subject,
          html: options.html,
          text: options.text,
          reply_to: options.replyTo,
          headers: options.headers,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`[Resend API Error] HTTP ${response.status}: ${errorText}`);
        captureException(new Error(`Resend email delivery failed: ${response.status} ${errorText}`));
        return {
          success: false,
          error: `Resend error: ${response.statusText}`,
        };
      }

      const data = (await response.json()) as { id?: string };
      this.logger.log(`[Resend Live] Successfully sent email to ${recipients.join(', ')} (ID: ${data.id})`);
      return {
        success: true,
        messageId: data.id || randomUUID(),
      };
    } catch (err) {
      this.logger.error(`[Resend Network Exception] ${err}`);
      captureException(err instanceof Error ? err : new Error(String(err)));
      return {
        success: false,
        error: 'Network failure during email dispatch',
      };
    }
  }

  async sendVerificationEmail(
    email: string,
    token: string,
    language: 'en' | 'hi' = 'en',
  ): Promise<SendEmailResult> {
    const portalUrl = process.env['APP_URL'] || process.env['WEB_URL'] || 'http://localhost:3000';
    const verifyLink = `${portalUrl}/auth/verify-email?token=${token}`;

    const isHi = language === 'hi';
    const subject = isHi
      ? 'JobsClick - अपना ईमेल पता सत्यापित करें'
      : 'JobsClick - Verify your email address';

    const html = isHi
      ? `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">JobsClick ईमेल सत्यापन</h2>
          <p>नमस्ते,</p>
          <p>JobsClick पर अपना ईमेल पता सत्यापित करने के लिए कृपया नीचे दिए गए बटन पर क्लिक करें:</p>
          <p style="margin: 30px 0;">
            <a href="${verifyLink}" style="background-color: #2563eb; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              ईमेल सत्यापित करें
            </a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">यदि आपने यह अनुरोध नहीं किया था, तो आप इस ईमेल को अनदेखा कर सकते हैं।</p>
        </div>
      `
      : `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">JobsClick Email Verification</h2>
          <p>Hello,</p>
          <p>Please click the button below to verify your email address on JobsClick:</p>
          <p style="margin: 30px 0;">
            <a href="${verifyLink}" style="background-color: #2563eb; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Verify Email Address
            </a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">If you did not request this verification, please safely ignore this email.</p>
        </div>
      `;

    return this.sendEmail({
      to: email,
      subject,
      html,
    });
  }
}
