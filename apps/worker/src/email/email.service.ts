import { randomUUID } from 'node:crypto';
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
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class WorkerEmailService {
  private readonly defaultFrom =
    process.env['EMAIL_FROM'] || 'JobsClick Alerts <alerts@jobsclick.live>';

  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    const apiKey = process.env['RESEND_API_KEY'];
    const isTestEnv =
      process.env['NODE_ENV'] === 'test' || !apiKey || apiKey === 're_dummy_resend_api_key';

    const from = options.from || this.defaultFrom;
    const recipients = Array.isArray(options.to) ? options.to : [options.to];

    if (isTestEnv) {
      console.log(
        `[Worker Resend Mock] Dispatched email to ${recipients.join(', ')} | Subject: "${options.subject}" (From: ${from})`,
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
        console.error(`[Worker Resend Error] HTTP ${response.status}: ${errorText}`);
        captureException(new Error(`Resend email delivery failed: ${response.status} ${errorText}`));
        return {
          success: false,
          error: `Resend error: ${response.statusText}`,
        };
      }

      const data = (await response.json()) as { id?: string };
      console.log(`[Worker Resend Live] Successfully sent email to ${recipients.join(', ')} (ID: ${data.id})`);
      return {
        success: true,
        messageId: data.id || randomUUID(),
      };
    } catch (err) {
      console.error(`[Worker Resend Exception] ${err}`);
      captureException(err instanceof Error ? err : new Error(String(err)));
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

    const portalUrl = process.env['APP_URL'] || 'https://jobsclick.live';
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
      from: 'JobsClick Alerts <alerts@jobsclick.live>',
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
    const webUrl = process.env['WEB_URL'] || 'https://jobsclick.live';
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
}
