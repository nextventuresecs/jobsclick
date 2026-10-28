import * as Sentry from '@sentry/node';
import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  sanitizeSentryEvent,
  sanitizeBreadcrumb,
  sanitizeLogRecord,
  sanitizeString,
  deepScrubPii,
  contextualTracesSampler,
  SENTRY_IGNORE_ERRORS,
} from '@indian-job-portal/validation';

export interface RequestTraceContext {
  traceId: string;
  spanId?: string;
  sentryTrace?: string;
  baggage?: string;
}

export const requestTraceStorage = new AsyncLocalStorage<RequestTraceContext>();

function getTraceIdFromTraceHeader(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const parts = value.split('-');

  // W3C traceparent format: 00-<trace-id>-<span-id>-<flags>
  if (parts.length >= 4 && parts[0] === '00' && parts[1]?.length === 32) {
    return parts[1];
  }

  // Sentry trace format: <trace-id>-<span-id>-<sampled>
  if (parts.length >= 3 && parts[0]?.length === 32) {
    return parts[0];
  }

  return undefined;
}

/**
 * Get active request trace context from AsyncLocalStorage or Sentry global scope
 */
export function getCurrentTraceContext(): RequestTraceContext | undefined {
  const store = requestTraceStorage.getStore();
  if (store) {
    return store;
  }
  const traceData = Sentry.getTraceData();
  const sentryTrace = traceData['sentry-trace'];
  if (sentryTrace) {
    const traceId = getTraceIdFromTraceHeader(sentryTrace) || '';
    return {
      traceId,
      sentryTrace,
      baggage: traceData['baggage'],
    };
  }
  return undefined;
}

/**
 * Returns trace propagation headers for outbound HTTP requests and BullMQ job payloads
 */
export function getTracePropagationHeaders(): {
  sentryTrace?: string;
  baggage?: string;
  traceId?: string;
} {
  const ctx = getCurrentTraceContext();
  if (ctx) {
    return {
      sentryTrace: ctx.sentryTrace,
      baggage: ctx.baggage,
      traceId: ctx.traceId,
    };
  }
  const traceData = Sentry.getTraceData();
  const sentryTrace = traceData['sentry-trace'];
  if (sentryTrace) {
    return {
      sentryTrace,
      baggage: traceData['baggage'],
      traceId: getTraceIdFromTraceHeader(sentryTrace),
    };
  }
  return {};
}

let isInitialized = false;

/**
 * Initialize Sentry for NestJS / Fastify with DPDP and Indian Job Portal Zero-PII Invariants
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
 * Setup Fastify hooks for request trace propagation, AsyncLocalStorage isolation, and error capture
 */
export function setupFastifySentry(fastify: FastifyInstance): void {
  // 1. Inbound trace extraction and AsyncLocalStorage scoping
  fastify.addHook('onRequest', (req: FastifyRequest, _reply: FastifyReply, done: () => void) => {
    const rawTrace = (req.headers['sentry-trace'] || req.headers['traceparent']) as string | undefined;
    const rawBaggage = req.headers['baggage'] as string | undefined;

    Sentry.continueTrace(
      {
        sentryTrace: rawTrace,
        baggage: rawBaggage,
      },
      () => {
        const traceData = Sentry.getTraceData();
        const traceId =
          const traceId =
          getTraceIdFromTraceHeader(traceData['sentry-trace']) ||
          getTraceIdFromTraceHeader(rawTrace) ||
          crypto.randomUUID().replace(/-/g, '');
        
        const context: RequestTraceContext = {
          traceId,
          sentryTrace: traceData['sentry-trace'] || rawTrace,
          baggage: traceData['baggage'] || rawBaggage,
        };

        // Attach to Fastify request for fast in-handler access
        (req as unknown as { traceContext: RequestTraceContext }).traceContext = context;

        // Run remaining request lifecycle within AsyncLocalStorage
        requestTraceStorage.run(context, () => {
          done();
        });
      }
    );
  });

  // 2. Unhandled Fastify error interception with Zero-PII sanitization
  fastify.addHook(
    'onError',
    (req: FastifyRequest, _reply: FastifyReply, error: Error, done: () => void) => {
      if (process.env['SENTRY_DSN']) {
        const traceCtx =
          (req as unknown as { traceContext?: RequestTraceContext }).traceContext ||
          getCurrentTraceContext();

        Sentry.withScope((scope) => {
          if (traceCtx?.sentryTrace) {
            scope.setTag('sentry_trace', traceCtx.sentryTrace);
          }
          if (traceCtx?.traceId) {
            scope.setTag('trace_id', traceCtx.traceId);
          }
          scope.setTag('http.method', req.method);
          scope.setTag('http.url', req.url.split('?')[0] || req.url);

          scope.setExtra('sanitized_query', deepScrubPii(req.query));
          scope.setExtra('sanitized_params', deepScrubPii(req.params));

          Sentry.captureException(error);
        });
      }
      done();
    }
  );
}

/**
 * Capture an exception with active request trace context and scrubbed extra metadata
 */
export function captureException(
  error: unknown,
  additionalContext?: Record<string, unknown>
): string {
  const currentCtx = getCurrentTraceContext();
  if (process.env['SENTRY_DSN']) {
    return Sentry.withScope((scope) => {
      if (currentCtx?.sentryTrace) {
        scope.setTag('sentry_trace', currentCtx.sentryTrace);
      }
      if (currentCtx?.traceId) {
        scope.setTag('trace_id', currentCtx.traceId);
      }
      if (additionalContext) {
        scope.setExtra('additional_context', deepScrubPii(additionalContext));
      }
      return Sentry.captureException(error);
    });
  }
  return 'sentry_disabled_stub_id';
}

/**
 * Structured Logger utility wrapping Sentry breadcrumbs & logs with Zero-PII scrubbing
 */
export const sentryLogger = {
  info(message: string, context?: Record<string, unknown>): void {
    const scrubbedMsg = sanitizeString(message);
    const scrubbedCtx = context ? deepScrubPii(context) : undefined;
    Sentry.addBreadcrumb({
      level: 'info',
      message: scrubbedMsg,
      data: scrubbedCtx,
      category: 'app.info',
    });
    if (isInitialized) {
      Sentry.logger.info(scrubbedMsg, scrubbedCtx);
    }
  },
  warn(message: string, context?: Record<string, unknown>): void {
    const scrubbedMsg = sanitizeString(message);
    const scrubbedCtx = context ? deepScrubPii(context) : undefined;
    Sentry.addBreadcrumb({
      level: 'warning',
      message: scrubbedMsg,
      data: scrubbedCtx,
      category: 'app.warn',
    });
    if (isInitialized) {
      Sentry.logger.warn(scrubbedMsg, scrubbedCtx);
    }
  },
  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    const scrubbedMsg = sanitizeString(message);
    const scrubbedCtx = context ? deepScrubPii(context) : {};
    if (isInitialized) {
      Sentry.logger.error(scrubbedMsg, scrubbedCtx);
    }
    Sentry.withScope((scope) => {
      scope.setExtra('context', scrubbedCtx);
      scope.setExtra('log_message', scrubbedMsg);
      if (error) {
        Sentry.captureException(error);
      } else {
        Sentry.captureMessage(scrubbedMsg, 'error');
      }
    });
  },
};

/**
 * Re-export native Sentry logger for direct usage
 */
export const logger = Sentry.logger;
