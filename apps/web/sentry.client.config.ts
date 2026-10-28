import * as Sentry from '@sentry/nextjs';
import {
  sanitizeSentryEvent,
  sanitizeBreadcrumb,
  sanitizeLogRecord,
  contextualTracesSampler,
  shouldDropTransaction,
  SENTRY_DENY_URLS,
  SENTRY_IGNORE_ERRORS,
  SENTRY_TRACE_PROPAGATION_TARGETS,
  type SentryLogInput,
} from './src/lib/sentry-scrubber';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

if (SENTRY_DSN) {
  const options = {
    dsn: SENTRY_DSN,
    tracesSampler: contextualTracesSampler,
    tracePropagationTargets: SENTRY_TRACE_PROPAGATION_TARGETS,
    release:
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.SENTRY_RELEASE,
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
    denyUrls: SENTRY_DENY_URLS,
    ignoreErrors: SENTRY_IGNORE_ERRORS,
    replaysSessionSampleRate: process.env.NODE_ENV === 'development' ? 0.1 : 0.01,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    debug: false,
  };

  Sentry.init(options as Parameters<typeof Sentry.init>[0]);
}

export {};
