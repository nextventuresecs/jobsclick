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

export interface IEmailService {
  sendEmail(options: SendEmailOptions): Promise<SendEmailResult>;
  sendVerificationEmail(email: string, token: string, language?: 'en' | 'hi'): Promise<SendEmailResult>;
}
