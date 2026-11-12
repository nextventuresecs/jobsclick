import { Injectable, Logger } from '@nestjs/common';
import { captureException } from '../config/sentry.js';

export abstract class TurnstileVerifier {
  abstract verify(token?: string, clientIp?: string): Promise<boolean>;
}

@Injectable()
export class CloudflareTurnstileVerifier extends TurnstileVerifier {
  private readonly logger = new Logger(CloudflareTurnstileVerifier.name);

  async verify(token?: string, clientIp?: string): Promise<boolean> {
    if (!token || !token.trim()) {
      return false;
    }

    const secretKey = process.env['TURNSTILE_SECRET_KEY'];
    if (!secretKey) {
      this.logger.error('TURNSTILE_SECRET_KEY is not configured');
      return false;
    }

    try {
      const form = new URLSearchParams();
      form.append('secret', secretKey);
      form.append('response', token.trim());
      if (clientIp) {
        form.append('remoteip', clientIp);
      }

      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        this.logger.warn(`Turnstile siteverify responded with HTTP status ${res.status}`);
        return false;
      }

      const outcome = (await res.json().catch(() => ({ success: false }))) as { success?: boolean };
      return Boolean(outcome.success);
    } catch (err) {
      this.logger.error(`Turnstile verification network failure: ${err instanceof Error ? err.message : String(err)}`);
      captureException(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }
}
