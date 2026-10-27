import * as Sentry from '@sentry/nextjs';
import {
  sanitizeSentryEvent,
  sanitizeBreadcrumb,
  contextualTracesSampler,
  shouldDropTransaction,
  SENTRY_DENY_URLS,
  SENTRY_IGNORE_ERRORS,
  SENTRY_TRACE_PROPAGATION_TARGETS,
} from './src/lib/sentry-scrubber';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampler: contextualTracesSampler,
    tracePropagationTargets: SENTRY_TRACE_PROPAGATION_TARGETS,
    release:
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.SENTRY_RELEASE,
    beforeSend(event, hint) {
      return sanitizeSentryEvent(event, hint);
    },
    beforeSendTransaction(event) {
      if (shouldDropTransaction(event.transaction)) {
        return null;
      }
      return sanitizeSentryEvent(event);
    },
    beforeBreadcrumb: sanitizeBreadcrumb,
    denyUrls: SENTRY_DENY_URLS,
    ignoreErrors: SENTRY_IGNORE_ERRORS,
    replaysSessionSampleRate: process.env.NODE_ENV === 'development' ? 0.1 : 0.01,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    debug: false,
  });
}

export {};
