import type { Event, EventHint, Breadcrumb } from '@sentry/nextjs';
import {
  BEARER_TOKEN_REGEX,
  INDIAN_PHONE_REGEX,
  AADHAAR_REGEX,
  EMAIL_REGEX,
  SENSITIVE_KEY_PATTERNS,
  SENSITIVE_HEADERS,
  SENTRY_DENY_URLS,
  SENTRY_IGNORE_ERRORS,
  SENTRY_TRACE_PROPAGATION_TARGETS,
  shouldDropTransaction,
  sanitizeString,
  deepScrubPii,
  sanitizeBreadcrumb as baseSanitizeBreadcrumb,
  sanitizeSentryEvent as baseSanitizeSentryEvent,
  sanitizeLogRecord,
  contextualTracesSampler,
  type SentryLogInput,
  type LogSeverityLevel,
} from '@indian-job-portal/validation';

export {
  BEARER_TOKEN_REGEX,
  INDIAN_PHONE_REGEX,
  AADHAAR_REGEX,
  EMAIL_REGEX,
  SENSITIVE_KEY_PATTERNS,
  SENSITIVE_HEADERS,
  SENTRY_DENY_URLS,
  SENTRY_IGNORE_ERRORS,
  SENTRY_TRACE_PROPAGATION_TARGETS,
  shouldDropTransaction,
  sanitizeString,
  deepScrubPii,
  sanitizeLogRecord,
  contextualTracesSampler,
  type SentryLogInput,
  type LogSeverityLevel,
};

/**
 * Next.js typed breadcrumb sanitizer wrapper
 */
export function sanitizeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  return baseSanitizeBreadcrumb(breadcrumb) as Breadcrumb | null;
}

/**
 * Next.js typed event sanitizer wrapper
 */
export function sanitizeSentryEvent<T extends Event>(event: T, hint?: EventHint): T | null {
  return baseSanitizeSentryEvent(event, hint) as T | null;
}
