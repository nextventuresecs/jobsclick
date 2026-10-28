import { describe, it, expect, beforeEach } from 'vitest';
import * as Sentry from '@sentry/node';
import type { Job } from 'bullmq';
import {
  wrapBullMQProcessor,
  handleWorkerJobFailure,
} from '../src/config/sentry.js';
import {
  sanitizeSentryEvent,
  sanitizeBreadcrumb,
  sanitizeLogRecord,
} from '@indian-job-portal/validation';

describe('Worker Sentry Telemetry & BullMQ Alert Hygiene Suite', () => {
  const capturedEnvelopes: Array<unknown> = [];

  beforeEach(() => {
    capturedEnvelopes.length = 0;
    process.env['SENTRY_DSN'] = 'https://mockkey@mock.sentry.io/654321';
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

  describe('1. Distributed Trace Continuity Across Request-Job Boundary', () => {
    it('propagates distributed trace from job._traceContext into Sentry execution span', async () => {
      const parentTraceId = 'c0ffee112233445566778899aabbccdd';
      const inboundSentryTrace = `${parentTraceId}-1234567890abcdef-1`;

      const mockJob = {
        id: 'job_import_99',
        name: 'bulk-import',
        queueName: 'bulk-import',
        attemptsMade: 0,
        opts: { attempts: 3 },
        data: {
          batchId: 'batch_test_1',
          source: 'college_drive',
          _traceContext: {
            sentryTrace: inboundSentryTrace,
            baggage: 'sentry-environment=test',
            traceId: parentTraceId,
          },
        },
      } as unknown as Job;

      let spanExecuted = false;
      let activeTraceData: { 'sentry-trace'?: string; baggage?: string } | undefined;

      const processor = wrapBullMQProcessor('bulk-import', async () => {
        spanExecuted = true;
        activeTraceData = Sentry.getTraceData();
        return { status: 'completed' };
      });

      const result = await processor(mockJob);

      expect(spanExecuted).toBe(true);
      expect(result).toEqual({ status: 'completed' });
      expect(activeTraceData?.['sentry-trace']).toContain(parentTraceId);
    });
  });

  describe('2. BullMQ Alert Hygiene (Suppress Retries, Alert on Exhaustion)', () => {
    it('suppresses Sentry exception alert on transient retry (attemptsMade < attempts)', async () => {
      const mockJob = {
        id: 'job_retry_1',
        name: 'invite-wave',
        attemptsMade: 1, // Attempt 1 of 3 (transient)
        opts: { attempts: 3 },
        data: {
          waveId: 'wave_01',
          waveSize: 100,
        },
      } as unknown as Job;

      const transientError = new Error('Transient SMS gateway timeout');
      const eventId = handleWorkerJobFailure('invite-wave', mockJob, transientError);

      await Sentry.flush(500);

      expect(eventId).toBeNull();
      // Zero Sentry exception envelopes dispatched
      const errorEventEnvelopes = capturedEnvelopes.filter((env) => {
        const items = (env as [unknown, Array<[{ type?: string }, unknown]>])[1];
        return Array.isArray(items) && items.some((item) => item[0]?.type === 'event');
      });
      expect(errorEventEnvelopes.length).toBe(0);
    });

    it('captures Sentry exception when job permanently exhausts all attempts (attemptsMade >= attempts)', async () => {
      const targetTraceId = '99998888777766665555444433332222';
      const mockJob = {
        id: 'job_exhausted_99',
        name: 'bulk-import',
        attemptsMade: 3, // Exhausted all 3 attempts
        opts: { attempts: 3 },
        data: {
          batchId: 'batch_exhausted',
          source: 'msme_portal',
          _traceContext: {
            sentryTrace: `${targetTraceId}-00f067aa0ba902b7-1`,
            traceId: targetTraceId,
          },
        },
      } as unknown as Job;

      const permanentError = new Error('Database integrity constraint violation');
      const eventId = handleWorkerJobFailure('bulk-import', mockJob, permanentError);

      await Sentry.flush(1000);

      expect(eventId).toBeDefined();
      expect(eventId).not.toBeNull();
      expect(capturedEnvelopes.length).toBeGreaterThan(0);

      const rawWire = JSON.stringify(capturedEnvelopes);
      expect(rawWire).toContain(targetTraceId);
      expect(rawWire).toContain('bulk-import');
      expect(rawWire).toContain('job_exhausted_99');
    });
  });

  describe('3. Monorepo Zero-PII Invariant Scrubbing on Worker Failures', () => {
    it('redacts full 12-digit Aadhaar, phone numbers, and OTPs on wire when job fails permanently', async () => {
      const mockJob = {
        id: 'job_pii_fail_42',
        name: 'generate-pdf',
        attemptsMade: 3,
        opts: { attempts: 3 },
        data: {
          seekerId: 'seeker_123',
          candidatePhone: '9876543210',
          aadhaarNumber: '1234 5678 9012',
          meta: {
            otpSecret: '887766',
            bearerToken: 'Bearer eyJhbGciOiJIUzI1NiJ9.test.sig',
          },
        },
      } as unknown as Job;

      const errorWithPhone = new Error('Failed generating resume PDF for applicant +919876543210');
      handleWorkerJobFailure('generate-pdf', mockJob, errorWithPhone);

      await Sentry.flush(1000);

      const rawWire = JSON.stringify(capturedEnvelopes);

      // Verify ZERO raw phone numbers or raw bearer tokens on the wire
      expect(rawWire).not.toContain('+919876543210');
      expect(rawWire).not.toContain('eyJhbGciOiJIUzI1NiJ9');

      // Verify redaction tokens appear
      expect(rawWire).toContain('[PHONE_REDACTED]');
      expect(rawWire).toContain('[REDACTED_PII]');

      // Verify deep scrubbing on the structured event payload
      interface EventPayload {
        extra: {
          job_data: {
            candidatePhone: string;
            aadhaarNumber: string;
            meta: {
              otpSecret: string;
              bearerToken: string;
            };
          };
        };
      }

      const eventEnvelope = capturedEnvelopes.find((env) => {
        const items = (env as [unknown, Array<[{ type?: string }, unknown]>])[1];
        return Array.isArray(items) && items.some((item) => item[0]?.type === 'event');
      }) as [unknown, Array<[unknown, EventPayload]>];
      expect(eventEnvelope).toBeDefined();
      const eventPayload = eventEnvelope[1][0][1];
      expect(eventPayload.extra.job_data.candidatePhone).toBe('[REDACTED_PII]');
      expect(eventPayload.extra.job_data.aadhaarNumber).toBe('[REDACTED_PII]');
      expect(eventPayload.extra.job_data.meta.otpSecret).toBe('[REDACTED_PII]');
      expect(eventPayload.extra.job_data.meta.bearerToken).toBe('[REDACTED_PII]');
    });

    it('worker Sentry.logger.info emits scrubbed log records', async () => {
      Sentry.logger.info('Worker processed job for +919876543210', {
        action: 'worker_log_test',
        candidateAadhaar: '1234 5678 9012',
      });

      console.warn('Worker queue delayed OTP: 987654');

      await Sentry.flush(1000);

      const rawWire = JSON.stringify(capturedEnvelopes);
      expect(rawWire).not.toContain('+919876543210');
      expect(rawWire).not.toContain('1234 5678 9012');
      expect(rawWire).not.toContain('987654');
      expect(rawWire).toContain('[PHONE_REDACTED]');
      expect(rawWire).toContain('[OTP_REDACTED]');
      expect(rawWire).toContain('worker_log_test');
    });
  });
});
