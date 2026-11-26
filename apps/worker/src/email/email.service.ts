import { randomUUID } from 'node:crypto';
import { isStaging, isTestEnv } from '@indian-job-portal/validation';
import { captureException } from '../config/sentry.js';

export interface AlertDigestJobItem {
  title: string;
  city: string;
  min_pay?: number | null;
  max_pay?: number | null;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  attachments?: Array<{
    filename: string;
    content: string; // base64 string
  }>;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  blocked_by_allowlist?: boolean;
}

function maskEmail(email: string | null | undefined): string {
  if (!email || !email.includes('@')) return '***@***';
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***';
  const visible = local.length > 2 ? `${local[0]}***${local.slice(-1)}` : `${local[0]}***`;
  return `${visible}@${domain}`;
}

export class WorkerEmailService {
  private readonly defaultFrom =
    process.env['EMAIL_FROM'] || 'JobsClick Alerts <alerts@example.com>';

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
        console.log(
          `[Worker Staging Email Gate] Email to ${recipients.map((r) => maskEmail(r)).join(', ')} skipped: blocked_by_allowlist`,
        );
        return {
          success: false,
          error: 'EMAIL_BLOCKED_BY_ALLOWLIST',
          blocked_by_allowlist: true,
        };
      }
    }

    if (isMock) {
      console.log(
        `[Worker Resend Mock] Simulated dispatch to ${activeRecipients.length} recipients`,
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
          ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from,
          to: activeRecipients,
          subject: options.subject,
          html: options.html,
          text: options.text,
          reply_to: options.replyTo,
          headers: options.headers,
          attachments: options.attachments,
        }),
      });

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        console.error(`[Worker Resend Error] HTTP ${response.status}`);
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
      console.log(`[Worker Resend Live] Provider accepted email for ${activeRecipients.length} recipients`);
      return {
        success: true,
        messageId: data.id,
      };
    } catch {
      console.error('[Worker Resend Exception] Email dispatch failed');
      captureException(new Error('Resend email dispatch failed'));
      return {
        success: false,
        error: 'Network failure during email dispatch',
      };
    }
  }

  async sendAlertDigest(
    to: string,
    jobs: AlertDigestJobItem[],
    userId: string,
    language = 'en',
  ): Promise<SendEmailResult> {
    const isHi = language === 'hi';
    const subject = isHi
      ? `आपकी जॉब अलर्ट सूचना (${jobs.length} नए मैच) - JobsClick`
      : `Your Job Alert Digest (${jobs.length} new matches) - JobsClick`;

    const jobItemsHtml = jobs
      .map(
        (j) =>
          `<li style="margin-bottom: 8px;"><strong>${j.title}</strong> - ${j.city} (${j.min_pay ?? 0}-${j.max_pay ?? 0} INR)</li>`,
      )
      .join('');

    const portalUrl = process.env['APP_URL'] || process.env['WEB_URL'] || 'http://localhost:3000';
    const unsubscribeUrl = `${portalUrl}/alerts/unsubscribe?user=${userId}`;

    const html = isHi
      ? `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h3 style="color: #2563eb;">JobsClick पर आपकी पसंद के नए जॉब्स</h3>
          <ul style="padding-left: 20px; color: #374151;">
            ${jobItemsHtml}
          </ul>
          <p style="margin-top: 24px; font-size: 13px; color: #6b7280;">
            अलर्ट्स बंद करने के लिए <a href="${unsubscribeUrl}" style="color: #2563eb;">यहाँ क्लिक करें</a>।
          </p>
        </div>
      `
      : `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h3 style="color: #2563eb;">New Job Openings Matching Your Saved Alerts</h3>
          <ul style="padding-left: 20px; color: #374151;">
            ${jobItemsHtml}
          </ul>
          <p style="margin-top: 24px; font-size: 13px; color: #6b7280;">
            To unsubscribe from daily job alerts, <a href="${unsubscribeUrl}" style="color: #2563eb;">click here</a>.
          </p>
        </div>
      `;

    return this.sendEmail({
      to,
      subject,
      html,
      from: this.defaultFrom,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
  }

  async sendBulkOnboardingWelcomeEmail(options: {
    email: string;
    role: 'job_seeker' | 'employer';
    source: string;
    name?: string;
  }): Promise<SendEmailResult> {
    const webUrl = process.env['WEB_URL'] || process.env['APP_URL'] || 'http://localhost:3000';
    const isEmployer = options.role === 'employer';
    const subject = isEmployer
      ? `Welcome to JobsClick - Complete Your Employer Registration (${options.source})`
      : `Welcome to JobsClick - Your Account is Ready (${options.source})`;

    const loginUrl = `${webUrl}/auth?email=${encodeURIComponent(options.email)}`;
    const stepsHtml = isEmployer
      ? `<ol style="padding-left: 20px; line-height: 1.8;">
          <li>Click <a href="${loginUrl}" style="color: #2563eb; font-weight: bold;">Log In</a> to access your employer account.</li>
          <li>Complete your Enterprise & MSME profile.</li>
          <li>Post your job openings to connect with verified student candidates.</li>
        </ol>`
      : `<ol style="padding-left: 20px; line-height: 1.8;">
          <li>Click <a href="${loginUrl}" style="color: #2563eb; font-weight: bold;">Log In</a> to verify your student account.</li>
          <li>Complete your education profile and skills.</li>
          <li>Discover and apply for verified entry-level and MSME jobs.</li>
        </ol>`;

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1f2937;">
        <h2 style="color: #2563eb;">Welcome to JobsClick!</h2>
        <p>You have been registered on the JobsClick platform by <strong>${options.source}</strong>.</p>
        <div style="background-color: #f3f4f6; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #111827;">Next Steps to Complete Your Onboarding:</h3>
          ${stepsHtml}
        </div>
        <p style="margin-top: 24px;">
          <a href="${loginUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Log In to JobsClick</a>
        </p>
      </div>
    `;

    return this.sendEmail({
      to: options.email,
      subject,
      html,
    });
  }

  async sendInvoiceEmail(options: {
    to: string;
    invoiceNumber: string;
    kind: 'invoice' | 'credit_note';
    totalInr: number;
    pdfBuffer?: Buffer;
    idempotencyKey?: string;
  }): Promise<SendEmailResult> {
    const isCreditNote = options.kind === 'credit_note';
    const title = isCreditNote ? 'Credit Note' : 'Tax Invoice';
    const subject = `${title} ${options.invoiceNumber} - JobsClick`;

    // Hard Invariant #1: Zero phone number in email body
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; color: #1f2937; line-height: 1.5; padding: 20px;">
  <h2 style="color: #1e3a8a;">${title}</h2>
  <p>Dear Customer,</p>
  <p>Please find attached your ${title.toLowerCase()} <strong>${options.invoiceNumber}</strong> for the amount of <strong>₹${options.totalInr.toFixed(2)}</strong>.</p>
  <p>Thank you for using JobsClick platform.</p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
  <p style="font-size: 12px; color: #6b7280;">This is an automated message. Please do not reply directly to this email.</p>
</body>
</html>`;

    const attachments = options.pdfBuffer
      ? [
          {
            filename: `${options.invoiceNumber.replace(/\//g, '_')}.pdf`,
            content: options.pdfBuffer.toString('base64'),
          },
        ]
      : undefined;

    return this.sendEmail({
      to: options.to,
      subject,
      html,
      attachments,
      idempotencyKey: options.idempotencyKey,
    });
  }
}
