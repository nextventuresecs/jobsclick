import * as Sentry from '@sentry/nextjs';
import {
  sanitizeSentryEvent,
  sanitizeBreadcrumb,
  sanitizeLogRecord,
  contextualTracesSampler,
  shouldDropTransaction,
  SENTRY_IGNORE_ERRORS,
  type SentryLogInput,
} from './src/lib/sentry-scrubber';

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  const options = {
    dsn: SENTRY_DSN,
    tracesSampler: contextualTracesSampler,
    release: process.env.VERCEL_GIT_COMMIT_SHA || process.env.SENTRY_RELEASE,
    beforeSend(event: Sentry.Event, hint?: Sentry.EventHint) {
      return sanitizeSentryEvent(event, hint);
    },
    beforeSendTransaction(event: Sentry.Event) {
      if (shouldDropTransaction(event.transaction)) {
        return null;
      }
      return sanitizeSentryEvent(event);
    },
    beforeBreadcrumb: sanitizeBreadcrumb,
    beforeSendLog(log: SentryLogInput) {
      return sanitizeLogRecord(log);
    },
    ignoreErrors: SENTRY_IGNORE_ERRORS,
    debug: false,
  };

  Sentry.init(options as Parameters<typeof Sentry.init>[0]);
}

export {};
