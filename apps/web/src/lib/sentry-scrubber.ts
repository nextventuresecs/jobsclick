import type { Event, EventHint, Breadcrumb } from '@sentry/nextjs';

/**
 * PII regex matchers tailored for Indian Job Portal compliance
 * Hard Invariant #1: Employer/anyone never sees a job seeker's phone or email
 * Hard Invariant #8: Never store full Aadhaar number, never log it
 */
const BEARER_TOKEN_REGEX = /\bBearer\s+[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/gi;
const INDIAN_PHONE_REGEX = /(?:(?:\+91|91)[\s-]?)?[6-9]\d{9}\b/g;
const AADHAAR_REGEX = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Sensitive field keys to scrub recursively from objects and query strings
 */
const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /passwd/i,
  /auth/i,
  /key/i,
  /otp/i,
  /aadhaar/i,
  /phone/i,
  /mobile/i,
  /email/i,
  /cookie/i,
  /credit_card/i,
  /pan/i,
];

/**
 * Request headers strictly stripped from all outbound Sentry payloads
 */
export const SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-forwarded-for',
  'x-real-ip',
  'cf-connecting-ip',
  'proxy-authorization',
  'x-user-id',
  'x-user-role',
];

/**
 * URLs/Domains ignored to prevent 3rd-party extension and analytics noise
 */
export const SENTRY_DENY_URLS = [
  /extensions\//i,
  /^chrome:\/\//i,
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-extension:\/\//i,
  /gtm\.js/i,
  /google-analytics\.com/i,
  /clarity\.ms/i,
];

/**
 * Benign errors ignored by Sentry
 */
export const SENTRY_IGNORE_ERRORS = [
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications',
  'Network request failed',
  'AbortError',
  'Loading chunk',
  /^Script error\.?$/i,
];

/**
 * Trace propagation targets to avoid leaking CORS / sentry-trace headers to 3rd-party domains
 */
export const SENTRY_TRACE_PROPAGATION_TARGETS = [
  'localhost',
  /^https:\/\/api\.jobsclick\.live/,
  /^https:\/\/[^/]+\.jobsclick\.live/,
  /^http:\/\/localhost:3001/,
  ...(typeof process !== 'undefined' && process.env['NEXT_PUBLIC_API_URL']
    ? [process.env['NEXT_PUBLIC_API_URL']]
    : []),
];

/**
 * Utility to identify transactions that should be dropped (health checks, static assets)
 */
export function shouldDropTransaction(transactionName?: string): boolean {
  if (!transactionName) return false;
  return (
    transactionName.includes('/api/health') ||
    transactionName.includes('/healthz') ||
    transactionName.includes('/ping') ||
    transactionName.includes('/_next/') ||
    transactionName.includes('/favicon.ico') ||
    transactionName.includes('/monitoring')
  );
}

/**
 * Sanitize a string against known PII patterns
 */
export function sanitizeString(val: string): string {
  if (!val || typeof val !== 'string') return val;
  return val
    .replace(BEARER_TOKEN_REGEX, 'Bearer [TOKEN_REDACTED]')
    .replace(INDIAN_PHONE_REGEX, '[PHONE_REDACTED]')
    .replace(AADHAAR_REGEX, '[AADHAAR_REDACTED]')
    .replace(EMAIL_REGEX, '[EMAIL_REDACTED]');
}

/**
 * Deep recursive scrubber for objects, arrays, and primitives
 */
export function deepScrubPii<T>(input: T, depth = 0): T {
  if (depth > 6 || input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    return sanitizeString(input) as unknown as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => deepScrubPii(item, depth + 1)) as unknown as T;
  }

  if (typeof input === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pat) => pat.test(key));
      if (isSensitiveKey) {
        cleaned[key] = '[REDACTED_PII]';
      } else {
        cleaned[key] = deepScrubPii(value, depth + 1);
      }
    }
    return cleaned as T;
  }

  return input;
}

/**
 * Strict beforeSend sanitizer removing headers, cookies, and scrubbing PII
 */
export function sanitizeSentryEvent<T extends Event>(event: T, hint?: EventHint): T | null {
  if (hint?.originalException && typeof hint.originalException === 'string') {
    hint.originalException = sanitizeString(hint.originalException);
  }

  // 1. Scrub User identity: Never send email, phone, or raw IP
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
    delete event.user.username;
    if (event.user.id) {
      event.user = { id: event.user.id };
    } else {
      event.user = undefined;
    }
  }

  // 2. Scrub Request data & headers
  if (event.request) {
    if (event.request.headers) {
      for (const h of SENSITIVE_HEADERS) {
        delete event.request.headers[h];
        delete event.request.headers[h.toLowerCase()];
      }
    }
    if (event.request.cookies) {
      event.request.cookies = { __scrubbed: '[COOKIES_SCRUBBED]' };
    }
    if (event.request.query_string) {
      if (typeof event.request.query_string === 'string') {
        event.request.query_string = sanitizeString(event.request.query_string);
      } else {
        event.request.query_string = deepScrubPii(event.request.query_string);
      }
    }
    if (event.request.data) {
      event.request.data = deepScrubPii(event.request.data);
    }
  }

  // 3. Scrub Breadcrumbs
  if (event.breadcrumbs && Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs
      .map((b) => sanitizeBreadcrumb(b))
      .filter((b): b is Breadcrumb => b !== null);
  }

  // 4. Scrub Extra & Contexts
  if (event.extra) {
    event.extra = deepScrubPii(event.extra);
  }
  if (event.contexts) {
    event.contexts = deepScrubPii(event.contexts);
  }

  return event;
}

/**
 * Breadcrumb sanitizer
 */
export function sanitizeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === 'ui.click' && breadcrumb.data) {
    const target = String(breadcrumb.data['target'] || '');
    if (/password|pin|otp|aadhaar/i.test(target)) {
      return null;
    }
  }

  if (breadcrumb.message) {
    breadcrumb.message = sanitizeString(breadcrumb.message);
  }

  if (breadcrumb.data) {
    breadcrumb.data = deepScrubPii(breadcrumb.data);
  }

  return breadcrumb;
}

/**
 * Contextual tracesSampler:
 * - 0% for health checks, static assets, and telemetry pings
 * - 100% for transactions encountering errors or 5xx responses
 * - Dynamic rates for standard vs. critical flows
 */
export function contextualTracesSampler(samplingContext: {
  name: string;
  parentSampled?: boolean;
  inheritOrSampleWith?: (fallbackRate: number) => number;
  transactionContext?: {
    name?: string;
    parentSampled?: boolean;
    [key: string]: unknown;
  };
  attributes?: Record<string, unknown>;
}): number | boolean {
  const { name, parentSampled, inheritOrSampleWith, transactionContext, attributes } =
    samplingContext;

  // 1. Zero sampling for health checks & static noise
  if (shouldDropTransaction(name)) {
    return 0.0;
  }

  // 2. 100% sampling for transactions containing unhandled errors or 5xx status codes
  const statusCode =
    transactionContext?.['status'] ||
    attributes?.['http.status_code'] ||
    attributes?.['http.response.status_code'];
  const hasError =
    (typeof statusCode === 'number' && statusCode >= 500) ||
    (typeof statusCode === 'string' && statusCode.startsWith('5')) ||
    attributes?.['error'] === true ||
    attributes?.['has_error'] === true;

  if (hasError) {
    return 1.0;
  }

  // 3. Elevated sampling for critical auth and workspace flows
  if (
    name.includes('/api/auth') ||
    name.includes('/auth') ||
    name.includes('/workspace') ||
    name.includes('/apply')
  ) {
    return process.env.NODE_ENV === 'development' ? 1.0 : 0.2;
  }

  // 4. If parent trace decision exists, respect it with inheritOrSampleWith
  if (typeof inheritOrSampleWith === 'function') {
    return inheritOrSampleWith(process.env.NODE_ENV === 'development' ? 1.0 : 0.05);
  }

  if (parentSampled !== undefined) {
    return parentSampled;
  }

  // 5. Baseline fallback: 100% in local dev, 5% in production to defend quota
  return process.env.NODE_ENV === 'development' ? 1.0 : 0.05;
}
