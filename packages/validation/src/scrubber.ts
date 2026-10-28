/**
 * PII regex matchers and data scrubbing primitives tailored for Indian Job Portal compliance
 * Hard Invariant #1: Employer/anyone never sees a job seeker's phone or email
 * Hard Invariant #8: Never store full Aadhaar number, never log it
 */
export const BEARER_TOKEN_REGEX = /\bBearer\s+[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/gi;
export const INDIAN_PHONE_REGEX = /(?:(?:\+91|91)[\s-]?)?[6-9]\d{9}\b/g;
export const AADHAAR_REGEX = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;
export const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
export const OTP_REGEX = /\b(otp|verification[- ]?code)\s*(?:is|[:=])?\s*(\d{4,8})\b/gi;

/**
 * Sensitive field keys to scrub recursively from objects and query strings
 */
export const SENSITIVE_KEY_PATTERNS = [
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
  /pin\b/i,
];

/**
 * Request headers strictly stripped from all outbound telemetry payloads
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
  ...(typeof process !== 'undefined' && process.env && process.env['NEXT_PUBLIC_API_URL']
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
    .replace(EMAIL_REGEX, '[EMAIL_REDACTED]')
    .replace(OTP_REGEX, (_match, prefix) => `${prefix}: [OTP_REDACTED]`);
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
 * Universal Breadcrumb sanitizer
 */
export function sanitizeBreadcrumb<T extends object>(breadcrumb: T): T | null {
  const b = breadcrumb as Record<string, unknown>;
  if (b['category'] === 'ui.click' && b['data'] && typeof b['data'] === 'object') {
    const target = String((b['data'] as Record<string, unknown>)['target'] || '');
    if (/password|pin|otp|aadhaar/i.test(target)) {
      return null;
    }
  }

  if (typeof b['message'] === 'string') {
    b['message'] = sanitizeString(b['message']);
  }

  if (b['data']) {
    b['data'] = deepScrubPii(b['data']);
  }

  return breadcrumb;
}

/**
 * Universal Sentry Event sanitizer
 */
export function sanitizeSentryEvent<T extends object>(
  event: T,
  hint?: { originalException?: unknown }
): T | null {
  const ev = event as Record<string, unknown>;

  if (hint?.originalException && typeof hint.originalException === 'string') {
    hint.originalException = sanitizeString(hint.originalException);
  }

  // 1. Scrub User identity: Never send email, phone, username, or raw IP
  if (ev['user'] && typeof ev['user'] === 'object') {
    const u = ev['user'] as Record<string, unknown>;
    delete u['email'];
    delete u['ip_address'];
    delete u['username'];
    if (u['id']) {
      ev['user'] = { id: u['id'] };
    } else {
      delete ev['user'];
    }
  }

  // 2. Scrub Request data & headers
  if (ev['request'] && typeof ev['request'] === 'object') {
    const req = ev['request'] as Record<string, unknown>;
    if (req['headers'] && typeof req['headers'] === 'object') {
      const headers = req['headers'] as Record<string, unknown>;
      for (const h of SENSITIVE_HEADERS) {
        delete headers[h];
        delete headers[h.toLowerCase()];
      }
    }
    if (req['cookies']) {
      req['cookies'] = { __scrubbed: '[COOKIES_SCRUBBED]' };
    }
    if (req['query_string']) {
      if (typeof req['query_string'] === 'string') {
        req['query_string'] = sanitizeString(req['query_string']);
      } else {
        req['query_string'] = deepScrubPii(req['query_string']);
      }
    }
    if (req['data']) {
      req['data'] = deepScrubPii(req['data']);
    }
  }

  // 3. Scrub Breadcrumbs
  if (Array.isArray(ev['breadcrumbs'])) {
    ev['breadcrumbs'] = (ev['breadcrumbs'] as object[])
      .map((b) => sanitizeBreadcrumb(b))
      .filter((b): b is object => b !== null);
  }

  // 4. Scrub Extra & Contexts (preserving trace metadata)
  if (ev['extra']) {
    ev['extra'] = deepScrubPii(ev['extra']);
  }
  if (ev['contexts'] && typeof ev['contexts'] === 'object') {
    const contexts = ev['contexts'] as Record<string, unknown>;
    const traceContext = contexts['trace'];
    ev['contexts'] = deepScrubPii(contexts);
    if (traceContext) {
      (ev['contexts'] as Record<string, unknown>)['trace'] = traceContext;
    }
  }

  // 5. Scrub Exception messages & stack frame local variables and context lines
  if (ev['exception'] && typeof ev['exception'] === 'object') {
    const exc = ev['exception'] as Record<string, unknown>;
    if (Array.isArray(exc['values'])) {
      for (const val of exc['values']) {
        if (val && typeof val === 'object') {
          const valObj = val as Record<string, unknown>;
          if (typeof valObj['value'] === 'string') {
            valObj['value'] = sanitizeString(valObj['value']);
          }
          if (valObj['stacktrace'] && typeof valObj['stacktrace'] === 'object') {
            const st = valObj['stacktrace'] as Record<string, unknown>;
            if (Array.isArray(st['frames'])) {
              for (const frame of st['frames']) {
                if (frame && typeof frame === 'object') {
                  const frObj = frame as Record<string, unknown>;
                  if (frObj['vars']) {
                    frObj['vars'] = deepScrubPii(frObj['vars']);
                  }
                  if (typeof frObj['context_line'] === 'string') {
                    frObj['context_line'] = sanitizeString(frObj['context_line']);
                  }
                  if (Array.isArray(frObj['pre_context'])) {
                    frObj['pre_context'] = frObj['pre_context'].map((line: unknown) =>
                      typeof line === 'string' ? sanitizeString(line) : line
                    );
                  }
                  if (Array.isArray(frObj['post_context'])) {
                    frObj['post_context'] = frObj['post_context'].map((line: unknown) =>
                      typeof line === 'string' ? sanitizeString(line) : line
                    );
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // 6. Scrub Top-level Event Message
  if (typeof ev['message'] === 'string') {
    ev['message'] = sanitizeString(ev['message']);
  }

  return event;
}

export type LogSeverityLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface SentryLogInput {
  level: LogSeverityLevel;
  message: string;
  attributes?: Record<string, unknown>;
  severityNumber?: number;
}

/**
 * Universal Log Sanitizer (supports beforeSendLog)
 */
export function sanitizeLogRecord<T extends SentryLogInput>(logRecord: T): T {
  const result = { ...logRecord } as Record<string, unknown>;
  if (typeof result['message'] === 'string') {
    result['message'] = sanitizeString(result['message']);
  }
  if (result['attributes'] && typeof result['attributes'] === 'object') {
    result['attributes'] = deepScrubPii(result['attributes']);
  }
  return result as T;
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
    return (typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'development') ? 1.0 : 0.2;
  }

  // 4. If parent trace decision exists, respect it with inheritOrSampleWith
  if (typeof inheritOrSampleWith === 'function') {
    return inheritOrSampleWith(
      (typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'development') ? 1.0 : 0.05
    );
  }

  if (parentSampled !== undefined) {
    return parentSampled;
  }

  // 5. Baseline fallback: 100% in local dev, 5% in production to defend quota
  return (typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'development') ? 1.0 : 0.05;
}
