import { describe, it, expect, vi } from 'vitest';
import type { Event, Breadcrumb } from '@sentry/nextjs';
import {
  sanitizeString,
  deepScrubPii,
  sanitizeSentryEvent,
  sanitizeBreadcrumb,
  contextualTracesSampler,
  shouldDropTransaction,
  SENSITIVE_HEADERS,
  SENTRY_TRACE_PROPAGATION_TARGETS,
} from '../src/lib/sentry-scrubber';
import { withGenAiSpan } from '../src/lib/sentry-ai-telemetry';
import { onRequestError, register } from '../src/instrumentation';
import GlobalError from '../src/app/global-error';
import ErrorBoundary from '../src/app/error';
import { GET as sentryTestRoute } from '../src/app/api/sentry-test/route';
import { triggerServerActionError } from '../src/app/api/sentry-test/actions';

// Mock next-intl translations
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      title: 'Something went wrong',
      sectionError: 'We encountered an issue loading this section.',
      tryAgain: 'Try again',
    };
    return messages[key] || key;
  },
}));

// Mock next/headers for Server Action testing
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ 'sentry-trace': 'trace-123-456-1' })),
}));

describe('Sentry Observability & Zero-PII Suite', () => {
  describe('Edge-Level Data Scrubbing & Zero-PII Policy', () => {
    it('sanitizes Indian phone numbers, Aadhaar, email, and Bearer tokens in raw strings', () => {
      const rawText =
        'Applicant +919876543210 with Aadhaar 1234 5678 9012 and email jobseeker@example.com used Bearer eyJhbGciOiJIUzI1NiJ9.test.sig';
      const sanitized = sanitizeString(rawText);

      expect(sanitized).not.toContain('+919876543210');
      expect(sanitized).not.toContain('1234 5678 9012');
      expect(sanitized).not.toContain('jobseeker@example.com');
      expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiJ9');
      expect(sanitized).toContain('[PHONE_REDACTED]');
      expect(sanitized).toContain('[AADHAAR_REDACTED]');
      expect(sanitized).toContain('[EMAIL_REDACTED]');
      expect(sanitized).toContain('Bearer [TOKEN_REDACTED]');
    });

    it('deep scrubs sensitive keys from objects and nested payloads', () => {
      const payload = {
        candidateName: 'Ramesh Patel',
        phone: '9876543210',
        aadhaarNumber: '9876 5432 1098',
        meta: {
          otpSecret: '998877',
          authToken: 'secret_jwt_xyz',
          publicCategory: 'Fitter',
        },
      };

      const cleaned = deepScrubPii(payload);
      expect(cleaned.phone).toBe('[REDACTED_PII]');
      expect(cleaned.aadhaarNumber).toBe('[REDACTED_PII]');
      expect(cleaned.meta.otpSecret).toBe('[REDACTED_PII]');
      expect(cleaned.meta.authToken).toBe('[REDACTED_PII]');
      expect(cleaned.meta.publicCategory).toBe('Fitter');
    });

    it('strips all sensitive headers, cookies, and user IP addresses from Sentry events', () => {
      const mockEvent: Event = {
        event_id: 'test-event-1',
        user: {
          id: 'usr_secure_123',
          email: 'admin@jobsclick.live',
          ip_address: '103.21.244.2',
          username: 'admin_test',
        },
        request: {
          url: 'https://jobsclick.live/api/apply?phone=9876543210',
          headers: {
            authorization: 'Bearer secret_token',
            cookie: 'auth_token=super_secret_cookie',
            'x-forwarded-for': '203.0.113.195',
            'user-agent': 'Mozilla/5.0 TestBrowser',
          },
          cookies: { auth_token: 'raw_cookie' },
        },
      };

      const result = sanitizeSentryEvent(mockEvent);
      expect(result).not.toBeNull();
      if (!result) return;

      expect(result.user?.id).toBe('usr_secure_123');
      expect(result.user?.email).toBeUndefined();
      expect(result.user?.ip_address).toBeUndefined();
      expect(result.user?.username).toBeUndefined();

      for (const h of SENSITIVE_HEADERS) {
        expect(result.request?.headers?.[h]).toBeUndefined();
      }
      expect(result.request?.headers?.['user-agent']).toBe('Mozilla/5.0 TestBrowser');
      expect(result.request?.cookies).toEqual({ __scrubbed: '[COOKIES_SCRUBBED]' });
    });

    it('drops sensitive click breadcrumbs on password or PIN inputs', () => {
      const passwordClick: Breadcrumb = {
        category: 'ui.click',
        data: { target: 'input[name="password"]' },
      };
      const normalClick: Breadcrumb = {
        category: 'ui.click',
        data: { target: 'button#submit-application' },
      };

      expect(sanitizeBreadcrumb(passwordClick)).toBeNull();
      expect(sanitizeBreadcrumb(normalClick)).not.toBeNull();
    });
  });

  describe('Dynamic Sampling & Quota Defense', () => {
    it('forces 0% sampling on health checks and static endpoints via shouldDropTransaction', () => {
      expect(shouldDropTransaction('/api/health')).toBe(true);
      expect(shouldDropTransaction('/healthz')).toBe(true);
      expect(shouldDropTransaction('/ping')).toBe(true);
      expect(shouldDropTransaction('/_next/static/chunk.js')).toBe(true);
      expect(shouldDropTransaction('/monitoring')).toBe(true);
      expect(shouldDropTransaction('/jobs')).toBe(false);

      expect(contextualTracesSampler({ name: 'GET /api/health' })).toBe(0.0);
      expect(contextualTracesSampler({ name: 'GET /healthz' })).toBe(0.0);
      expect(contextualTracesSampler({ name: 'GET /ping' })).toBe(0.0);
      expect(contextualTracesSampler({ name: 'GET /_next/static/chunk.js' })).toBe(0.0);
      expect(contextualTracesSampler({ name: 'POST /monitoring' })).toBe(0.0);
    });

    it('samples at 100% (1.0) when transaction context contains 5xx error status', () => {
      const errorSample = contextualTracesSampler({
        name: 'POST /api/jobs',
        transactionContext: { status: 500 },
      });
      expect(errorSample).toBe(1.0);

      const gatewayErrorSample = contextualTracesSampler({
        name: 'GET /api/candidates',
        attributes: { 'http.status_code': 502 },
      });
      expect(gatewayErrorSample).toBe(1.0);

      const flagErrorSample = contextualTracesSampler({
        name: 'POST /api/apply',
        attributes: { error: true },
      });
      expect(flagErrorSample).toBe(1.0);
    });

    it('samples critical auth and workspace flows with priority', () => {
      const authSample = contextualTracesSampler({ name: 'POST /api/auth/otp/send' });
      expect(authSample).toBeGreaterThan(0.0);

      const workspaceSample = contextualTracesSampler({ name: 'GET /workspace/employer' });
      expect(workspaceSample).toBeGreaterThan(0.0);
    });

    it('delegates to inheritOrSampleWith when parent decision context exists', () => {
      const inheritMock = vi.fn().mockReturnValue(0.75);
      const result = contextualTracesSampler({
        name: 'GET /jobs',
        inheritOrSampleWith: inheritMock,
      });

      expect(inheritMock).toHaveBeenCalled();
      expect(result).toBe(0.75);
    });

    it('validates trace propagation targets whitelist internal domains and rejects 3rd parties', () => {
      const isAllowed = (url: string) =>
        SENTRY_TRACE_PROPAGATION_TARGETS.some((pattern) => {
          if (typeof pattern === 'string') return url.includes(pattern);
          if (pattern instanceof RegExp) return pattern.test(url);
          return false;
        });

      expect(isAllowed('http://localhost:3000/api/jobs')).toBe(true);
      expect(isAllowed('http://localhost:3001/api/v1/auth')).toBe(true);
      expect(isAllowed('https://api.jobsclick.live/jobs')).toBe(true);
      expect(isAllowed('https://app.jobsclick.live/dashboard')).toBe(true);

      expect(isAllowed('https://api.stripe.com/v1/charges')).toBe(false);
      expect(isAllowed('https://challenges.cloudflare.com/turnstile')).toBe(false);
      expect(isAllowed('https://supabase.co/rest/v1')).toBe(false);
    });
  });

  describe('OpenTelemetry GenAI Semantic Conventions', () => {
    it('executes AI workflow with OpenTelemetry GenAI span attributes and PII scrubbing', async () => {
      const result = await withGenAiSpan(
        {
          system: 'gemini',
          operationName: 'generate_content',
          model: 'gemini-1.5-flash',
          agentName: 'ResumeMatcher',
          prompt: 'Match candidate +919876543210 with Job 42',
        },
        async () => {
          return {
            result: { matchScore: 92 },
            inputTokens: 50,
            outputTokens: 25,
            finishReason: 'stop',
            outputSummary: 'Candidate qualified for Electrician role',
          };
        }
      );

      expect(result).toEqual({ matchScore: 92 });
    });
  });

  describe('Next.js Native Instrumentation & Error Boundaries', () => {
    it('exports native onRequestError handler from instrumentation.ts', () => {
      expect(typeof onRequestError).toBe('function');
      expect(typeof register).toBe('function');
    });

    it('exports App Router GlobalError and ErrorBoundary components', () => {
      expect(GlobalError).toBeDefined();
      expect(ErrorBoundary).toBeDefined();
    });
  });

  describe('Verification Route Handler (/api/sentry-test) & Server Actions', () => {
    it('handles server-error action and reports to Sentry', async () => {
      const req = new Request('http://localhost:3000/api/sentry-test?action=server-error');
      const res = await sentryTestRoute(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.action).toBe('server-error');
      expect(data.errorId).toBeDefined();
    });

    it('handles distributed-trace action with propagated trace headers', async () => {
      const req = new Request('http://localhost:3000/api/sentry-test?action=distributed-trace', {
        headers: {
          'sentry-trace': '1234567890abcdef1234567890abcdef-1234567890abcdef-1',
          baggage: 'sentry-environment=test',
        },
      });
      const res = await sentryTestRoute(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.action).toBe('distributed-trace');
      expect(data.propagatedTrace).toBe('1234567890abcdef1234567890abcdef-1234567890abcdef-1');
      expect(data.timestamp).toBeDefined();
    });

    it('handles client-error action returning HTML trigger page', async () => {
      const req = new Request('http://localhost:3000/api/sentry-test?action=client-error');
      const res = await sentryTestRoute(req);
      const html = await res.text();

      expect(res.status).toBe(200);
      expect(html).toContain('Sentry Client Error Verification');
      expect(html).toContain('Client-side error triggered');
    });

    it('handles pii-scrub action and validates zero-leak scrubbed output', async () => {
      const req = new Request('http://localhost:3000/api/sentry-test?action=pii-scrub');
      const res = await sentryTestRoute(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.scrubbed.phone).toBe('[REDACTED_PII]');
      expect(data.scrubbed.email).toBe('[REDACTED_PII]');
      expect(data.scrubbed.aadhaar).toBe('[REDACTED_PII]');
      expect(data.scrubbed.userToken).toBe('[REDACTED_PII]');
      expect(data.scrubbed.normalField).toBe('Public Job Posting Title');

      expect(data.sanitizedStringResult).toContain('[PHONE_REDACTED]');
      expect(data.sanitizedStringResult).toContain('[EMAIL_REDACTED]');
      expect(data.sanitizedStringResult).toContain('[AADHAAR_REDACTED]');
    });

    it('triggers Server Action deterministic error with trace context', async () => {
      const result = await triggerServerActionError('candidate_verification_fail');
      expect(result.success).toBe(false);
      expect(result.error).toContain('[Sentry Server Action Test]');
      expect(result.eventId).toBeDefined();
    });
  });
});
