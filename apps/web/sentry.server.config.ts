import * as Sentry from '@sentry/nextjs';
import {
  sanitizeSentryEvent,
  sanitizeBreadcrumb,
  contextualTracesSampler,
  shouldDropTransaction,
  SENTRY_IGNORE_ERRORS,
} from './src/lib/sentry-scrubber';

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampler: contextualTracesSampler,
    release: process.env.VERCEL_GIT_COMMIT_SHA || process.env.SENTRY_RELEASE,
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
    ignoreErrors: SENTRY_IGNORE_ERRORS,
    includeLocalVariables: true,
    debug: false,
  });
}

export {};
