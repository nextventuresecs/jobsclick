import * as Sentry from '@sentry/node';

export function initSentry(dsn?: string): void {
  if (dsn) {
    Sentry.init({
      dsn,
      environment: process.env['NODE_ENV'] || 'development',
      tracesSampleRate: 1.0,
    });
  }
}

export function captureException(error: unknown): string {
  if (process.env['SENTRY_DSN']) {
    return Sentry.captureException(error);
  }
  return 'sentry_disabled_stub_id';
}
