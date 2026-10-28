import * as Sentry from '@sentry/node';
import type { Job } from 'bullmq';
import {
  sanitizeSentryEvent,
  sanitizeBreadcrumb,
  sanitizeLogRecord,
  sanitizeString,
  deepScrubPii,
  contextualTracesSampler,
  SENTRY_IGNORE_ERRORS,
} from '@indian-job-portal/validation';

export interface TraceContextPayload {
  sentryTrace?: string;
  baggage?: string;
  traceId?: string;
}

let isInitialized = false;

/**
 * Initialize Sentry for Worker with DPDP and Indian Job Portal Zero-PII Invariants
 */
export function initSentry(dsn?: string): void {
  if (isInitialized) {
    return;
  }
  const resolvedDsn = dsn || process.env['SENTRY_DSN'];
  if (resolvedDsn) {
    isInitialized = true;
    const staticSampleRate = process.env['SENTRY_TRACES_SAMPLE_RATE']
      ? Number(process.env['SENTRY_TRACES_SAMPLE_RATE'])
      : undefined;

    const options: Sentry.NodeOptions = {
      dsn: resolvedDsn,
      environment: process.env['NODE_ENV'] || 'development',
      integrations: [
        Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
      ],
      ...(staticSampleRate !== undefined
        ? { tracesSampleRate: staticSampleRate }
        : { tracesSampler: contextualTracesSampler }),
      beforeSend(event, hint) {
        return sanitizeSentryEvent(event, hint);
      },
      beforeBreadcrumb(breadcrumb) {
        return sanitizeBreadcrumb(breadcrumb);
      },
      beforeSendLog(log) {
        return sanitizeLogRecord(log);
      },
      ignoreErrors: SENTRY_IGNORE_ERRORS,
    };
    Sentry.init(options);
  }
}

/**
 * Wrap a BullMQ worker processor to propagate distributed trace context and record execution spans
 */
export function wrapBullMQProcessor<TData = unknown, TResult = unknown>(
  queueName: string,
  processor: (job: Job<TData, TResult>) => Promise<TResult>
): (job: Job<TData, TResult>) => Promise<TResult> {
  return async (job: Job<TData, TResult>): Promise<TResult> => {
    const traceCtx = (job.data as unknown as { _traceContext?: TraceContextPayload })?._traceContext;

    const executeWithSpan = async (): Promise<TResult> => {
      return Sentry.startSpan(
        {
          name: `bullmq.${queueName}.${job.name}`,
          op: 'queue.process',
          attributes: {
            'messaging.system': 'bullmq',
            'messaging.destination': queueName,
            'messaging.message.id': String(job.id),
            'job.attemptsMade': job.attemptsMade,
            'job.name': job.name,
          },
        },
        async () => {
          return processor(job);
        }
      );
    };

    if (traceCtx?.sentryTrace) {
      return Sentry.continueTrace(
        {
          sentryTrace: traceCtx.sentryTrace,
          baggage: traceCtx.baggage,
        },
        executeWithSpan
      );
    }

    return executeWithSpan();
  };
}

/**
 * BullMQ Job Failure Handler enforcing Alert Hygiene:
 * - Suppresses Sentry alerts on transient retries (attemptsMade < attempts)
 * - Only triggers Sentry captureException when job permanently exhausts all attempts
 */
export function handleWorkerJobFailure(
  queueName: string,
  job: Job | undefined,
  err: Error
): string | null {
  const attempts = job?.opts?.attempts || 3;
  const attemptsMade = job?.attemptsMade || 0;
  const isExhausted = attemptsMade >= attempts;

  if (isExhausted) {
    console.error(
      `[Worker - ${queueName}] Job ${job?.id} PERMANENTLY FAILED after ${attemptsMade}/${attempts} attempts: ${err.message}`
    );

    if (process.env['SENTRY_DSN']) {
      return Sentry.withScope((scope) => {
        const traceCtx = (job?.data as unknown as { _traceContext?: TraceContextPayload })?._traceContext;
        if (traceCtx?.sentryTrace) {
          scope.setTag('sentry_trace', traceCtx.sentryTrace);
        }
        if (traceCtx?.traceId) {
          scope.setTag('trace_id', traceCtx.traceId);
        }
        scope.setTag('queue_name', queueName);
        scope.setTag('job_id', String(job?.id));
        scope.setTag('job_name', job?.name || 'unknown');
        scope.setExtra('attempts_made', attemptsMade);
        scope.setExtra('max_attempts', attempts);
        scope.setExtra('job_data', deepScrubPii(job?.data));

        return Sentry.captureException(err);
      });
    }
    return 'sentry_disabled_stub_id';
  }

  // Transient retry: record breadcrumb only, suppress exception alert to prevent notification fatigue
  console.warn(
    `[Worker - ${queueName}] Job ${job?.id} transient failure (${attemptsMade}/${attempts}) - retrying via BullMQ backoff: ${err.message}`
  );

  Sentry.addBreadcrumb({
    category: 'bullmq.retry',
    message: `Job ${job?.id} transient error on attempt ${attemptsMade}/${attempts}: ${sanitizeString(err.message)}`,
    level: 'warning',
    data: {
      queue: queueName,
      jobId: job?.id,
      attemptsMade,
      maxAttempts: attempts,
    },
  });

  return null;
}

/**
 * Standard Sentry captureException with PII scrubbing
 */
export function captureException(error: unknown, additionalContext?: Record<string, unknown>): string {
  if (process.env['SENTRY_DSN']) {
    return Sentry.withScope((scope) => {
      if (additionalContext) {
        scope.setExtra('context', deepScrubPii(additionalContext));
      }
      return Sentry.captureException(error);
    });
  }
  return 'sentry_disabled_stub_id';
}

/**
 * Re-export native Sentry logger for worker jobs
 */
export const logger = Sentry.logger;
