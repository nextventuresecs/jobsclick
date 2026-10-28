import { describe, it, expect, beforeEach } from 'vitest';
import * as Sentry from '@sentry/node';
import Fastify from 'fastify';
import {
  setupFastifySentry,
  getCurrentTraceContext,
  getTracePropagationHeaders,
  sentryLogger,
} from '../src/config/sentry.js';
import {
  sanitizeString,
  sanitizeSentryEvent,
  sanitizeBreadcrumb,
  sanitizeLogRecord,
} from '@indian-job-portal/validation';

describe('API Sentry Telemetry & Trace Propagation Suite', () => {
  const capturedEnvelopes: Array<unknown> = [];

  beforeEach(() => {
    capturedEnvelopes.length = 0;
    process.env['SENTRY_DSN'] = 'https://mockkey@mock.sentry.io/123456';
    Sentry.init({
      dsn: process.env['SENTRY_DSN'],
      environment: 'test',
      integrations: [
        Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
      ],
      transport: () => ({
        send: async (envelope) => {
          capturedEnvelopes.push(envelope);
          return { statusCode: 200 };
        },
        flush: async () => true,
      }),
      beforeSend(event, hint) {
        return sanitizeSentryEvent(event, hint);
      },
      beforeBreadcrumb(breadcrumb) {
        return sanitizeBreadcrumb(breadcrumb);
      },
      beforeSendLog(log) {
        return sanitizeLogRecord(log);
      },
    });
  });

  describe('1. Inbound Fastify Trace Extraction & Propagation', () => {
    it('extracts W3C / sentry-trace headers in Fastify hook and establishes request trace context', async () => {
      const fastify = Fastify();
      setupFastifySentry(fastify);

      let capturedTraceId: string | undefined;
      let capturedTraceHeaders: { sentryTrace?: string; baggage?: string } | undefined;

      fastify.get('/test-trace', async () => {
        const ctx = getCurrentTraceContext();
        capturedTraceId = ctx?.traceId;
        capturedTraceHeaders = getTracePropagationHeaders();
        return { status: 'ok', traceId: capturedTraceId };
      });

      const incomingTrace = '4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-1';
      const incomingBaggage = 'sentry-environment=production,sentry-release=0.1.0';

      const response = await fastify.inject({
        method: 'GET',
        url: '/test-trace',
        headers: {
          'sentry-trace': incomingTrace,
          baggage: incomingBaggage,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(capturedTraceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
      expect(capturedTraceHeaders?.sentryTrace).toContain('4bf92f3577b34da6a3ce929d0e0e4736');
      expect(capturedTraceHeaders?.baggage).toContain(incomingBaggage);
    });

    it('generates a synthetic traceId when no inbound trace header exists', async () => {
      const fastify = Fastify();
      setupFastifySentry(fastify);

      let capturedTraceId: string | undefined;

      fastify.get('/test-no-trace', async () => {
        const ctx = getCurrentTraceContext();
        capturedTraceId = ctx?.traceId;
        return { status: 'ok', traceId: capturedTraceId };
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/test-no-trace',
      });

      expect(response.statusCode).toBe(200);
      expect(capturedTraceId).toBeDefined();
      expect(typeof capturedTraceId).toBe('string');
      expect(capturedTraceId?.length).toBeGreaterThan(0);
    });

    it('seamlessly bridges request trace into QueueService job publication', async () => {
      const fastify = Fastify();
      setupFastifySentry(fastify);
      const { QueueService } = await import('../src/queue/queue.service.js');
      const queueService = new QueueService();

      let publishedJobData: Record<string, unknown> | undefined;

      fastify.post('/api/import', async () => {
        const job = await queueService.publishBulkImportJob({
          batchId: 'batch_trace_test_1',
          source: 'college_drive',
        });
        publishedJobData = job.data as Record<string, unknown>;
        return { success: true, jobId: job.id };
      });

      const incomingTrace = '9876543210abcdef9876543210abcdef-00f067aa0ba902b7-1';
      const incomingBaggage = 'sentry-environment=test,sentry-release=0.1.0';

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/import',
        headers: {
          'sentry-trace': incomingTrace,
          baggage: incomingBaggage,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(publishedJobData).toBeDefined();

      const traceCtx = (
        publishedJobData as unknown as {
          _traceContext: { sentryTrace: string; baggage?: string; traceId?: string };
        }
      )._traceContext;
      expect(traceCtx).toBeDefined();
      expect(traceCtx.sentryTrace).toContain('9876543210abcdef9876543210abcdef');
      expect(traceCtx.traceId).toBe('9876543210abcdef9876543210abcdef');
      expect(traceCtx.baggage).toContain(incomingBaggage);

      await queueService.onModuleDestroy();
    });
  });

  describe('2. Monorepo Zero-PII Invariant Redaction', () => {
    it('redacts Indian phone numbers, Aadhaar, email, and Bearer tokens in raw strings and log records', () => {
      const rawMsg =
        'Candidate +919876543210 with Aadhaar 1234 5678 9012 and email seeker@domain.in supplied Bearer eyJhbGciOiJIUzI1NiJ9.test.sig';
      const scrubbed = sanitizeString(rawMsg);

      expect(scrubbed).not.toContain('+919876543210');
      expect(scrubbed).not.toContain('1234 5678 9012');
      expect(scrubbed).not.toContain('seeker@domain.in');
      expect(scrubbed).not.toContain('eyJhbGciOiJIUzI1NiJ9');

      expect(scrubbed).toContain('[PHONE_REDACTED]');
      expect(scrubbed).toContain('[AADHAAR_REDACTED]');
      expect(scrubbed).toContain('[EMAIL_REDACTED]');
      expect(scrubbed).toContain('Bearer [TOKEN_REDACTED]');

      const logRecord = sanitizeLogRecord({
        message: 'Applicant 9876543210 applied with otpSecret 123456',
        attributes: {
          phone: '9876543210',
          aadhaar: '1234-5678-9012',
          role: 'electrician',
        },
      });

      expect(logRecord.message).toContain('[PHONE_REDACTED]');
      expect(logRecord.attributes?.['phone']).toBe('[REDACTED_PII]');
      expect(logRecord.attributes?.['aadhaar']).toBe('[REDACTED_PII]');
      expect(logRecord.attributes?.['role']).toBe('electrician');
    });

    it('strips sensitive auth headers, cookies, and user identifying details from Sentry events', () => {
      const event: Sentry.Event = {
        event_id: 'api-event-1',
        user: {
          id: 'usr_api_456',
          email: 'candidate@jobsclick.live',
          ip_address: '49.207.200.10',
          username: 'candidate_ramesh',
        },
        request: {
          url: 'https://api.jobsclick.live/jobs/apply',
          headers: {
            authorization: 'Bearer secret_jwt',
            cookie: 'session_id=secret_cookie_val',
            'x-forwarded-for': '49.207.200.10',
            'content-type': 'application/json',
          },
        },
      };

      const sanitized = sanitizeSentryEvent(event);
      expect(sanitized).not.toBeNull();
      if (!sanitized) return;

      expect(sanitized.user?.id).toBe('usr_api_456');
      expect(sanitized.user?.email).toBeUndefined();
      expect(sanitized.user?.ip_address).toBeUndefined();
      expect(sanitized.user?.username).toBeUndefined();

      expect(sanitized.request?.headers?.['authorization']).toBeUndefined();
      expect(sanitized.request?.headers?.['cookie']).toBeUndefined();
      expect(sanitized.request?.headers?.['x-forwarded-for']).toBeUndefined();
      expect(sanitized.request?.headers?.['content-type']).toBe('application/json');
    });

    it('scrubs sensitive click and navigation breadcrumbs', () => {
      const sensitiveBreadcrumb: Sentry.Breadcrumb = {
        category: 'ui.click',
        data: { target: 'input[name="aadhaarNumber"]' },
      };
      const normalBreadcrumb: Sentry.Breadcrumb = {
        category: 'navigation',
        message: 'Navigated to job details page for phone 9876543210',
      };

      expect(sanitizeBreadcrumb(sensitiveBreadcrumb)).toBeNull();

      const cleaned = sanitizeBreadcrumb(normalBreadcrumb);
      expect(cleaned).not.toBeNull();
      expect(cleaned?.message).toContain('[PHONE_REDACTED]');
      expect(cleaned?.message).not.toContain('9876543210');
    });
  });

  describe('3. Fastify onError Hook & Wire Envelope Capture', () => {
    it('captures unhandled route errors through Fastify onError hook and scrubs wire payload', async () => {
      const fastify = Fastify();
      setupFastifySentry(fastify);

      fastify.get('/error-test', async () => {
        throw new Error('Failure processing applicant +919876543210');
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/error-test?phone=9876543210&secretToken=super_secret',
        headers: {
          'sentry-trace': '11112222333344445555666677778888-00f067aa0ba902b7-1',
        },
      });

      expect(response.statusCode).toBe(500);

      await Sentry.flush(1000);

      // Verify wire envelope was intercepted
      expect(capturedEnvelopes.length).toBeGreaterThan(0);
      const rawWireString = JSON.stringify(capturedEnvelopes);

      // PII invariants: zero raw phone numbers or raw tokens on wire
      expect(rawWireString).not.toContain('+919876543210');
      expect(rawWireString).toContain('[PHONE_REDACTED]');
      expect(rawWireString).toContain('11112222333344445555666677778888');
    });

    it('structured logger dispatches sanitized messages and captures errors', async () => {
      sentryLogger.info('Candidate +919876543210 logged in', {
        otpSecret: '654321',
        city: 'Pune',
      });

      sentryLogger.error('Registration failed for Aadhaar 1234 5678 9012');

      await Sentry.flush(1000);

      const rawWireString = JSON.stringify(capturedEnvelopes);
      expect(rawWireString).not.toContain('1234 5678 9012');
      expect(rawWireString).toContain('[AADHAAR_REDACTED]');
    });

    it('Sentry native logger transmits scrubbed log envelopes', async () => {
      Sentry.logger.info('User triggered test log for applicant +919876543210', {
        action: 'test_log',
        phone: '9876543210',
        aadhaar: '1234 5678 9012',
      });

      await Sentry.flush(1000);

      const rawWireString = JSON.stringify(capturedEnvelopes);
      expect(rawWireString).not.toContain('+919876543210');
      expect(rawWireString).not.toContain('1234 5678 9012');
      expect(rawWireString).toContain('[PHONE_REDACTED]');
      expect(rawWireString).toContain('User triggered test log');
      expect(rawWireString).toContain('test_log');
    });

    it('captures console.log and console.warn via consoleLoggingIntegration with PII scrubbing', async () => {
      console.log('Admin verified Aadhaar 9999 8888 7777 successfully');
      console.warn('Temporary delay sending OTP: 654321');

      await Sentry.flush(1000);

      const rawWireString = JSON.stringify(capturedEnvelopes);
      expect(rawWireString).not.toContain('9999 8888 7777');
      expect(rawWireString).not.toContain('654321');
      expect(rawWireString).toContain('[AADHAAR_REDACTED]');
      expect(rawWireString).toContain('[OTP_REDACTED]');
    });
  });
});
