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
    const apiKey = process.env['RESEND_API_KEY']?.trim();
    const isMock = isTestEnv();

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
          success: false,
          error: 'EMAIL_BLOCKED_BY_ALLOWLIST',
          blocked_by_allowlist: true,
        };
      }
    }

    if (isMock) {
      this.logger.log(
        `[Resend Email Mock] Simulated dispatch to ${activeRecipients.length} recipients`,
      );
      return {
        success: true,
        messageId: randomUUID(),
      };
    }

    if (!apiKey || apiKey === 're_dummy_resend_api_key') {
      return { success: false, error: 'EMAIL_PROVIDER_UNAVAILABLE' };
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
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
        await response.body?.cancel().catch(() => undefined);
        this.logger.error(`[Resend API Error] HTTP ${response.status}`);
        captureException(new Error(`Resend email delivery failed: ${response.status}`));
        return {
          success: false,
          error: `Resend error: HTTP ${response.status}`,
        };
      }

      const data = (await response.json()) as { id?: unknown };
      if (typeof data?.id !== 'string' || !data.id.trim()) {
        return { success: false, error: 'EMAIL_PROVIDER_UNCONFIRMED' };
      }
      this.logger.log(`[Resend Live] Provider accepted email for ${activeRecipients.length} recipients`);
      return {
        success: true,
        messageId: data.id,
      };
    } catch {
      this.logger.error('[Resend Network Exception] Email dispatch failed');
      captureException(new Error('Resend email dispatch failed'));
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
    const verifyLink = new URL('/auth/verify-email', portalUrl);
    verifyLink.searchParams.set('token', token);

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
