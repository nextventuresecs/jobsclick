import { Injectable, Logger } from '@nestjs/common';
import { captureException } from '../config/sentry.js';
import type { IEmailService, SendEmailOptions, SendEmailResult } from './email.interface.js';

@Injectable()
export class EmailService implements IEmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly defaultFrom =
    process.env['EMAIL_FROM'] || 'JobsClick <notifications@jobsclick.live>';

  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    const apiKey = process.env['RESEND_API_KEY'];
    const isTestEnv =
      process.env['NODE_ENV'] === 'test' || !apiKey || apiKey === 're_dummy_resend_api_key';

    const from = options.from || this.defaultFrom;
    const recipients = Array.isArray(options.to) ? options.to : [options.to];

    if (isTestEnv) {
      this.logger.log(
        `[Resend Email Mock] Dispatched email to ${recipients.join(', ')} | Subject: "${options.subject}" (Sender: ${from})`,
      );
      return {
        success: true,
        messageId: `mock_email_${Date.now()}`,
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
          to: recipients,
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
        messageId: data.id || `resend_${Date.now()}`,
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
    const portalUrl = process.env['APP_URL'] || 'https://jobsclick.live';
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
