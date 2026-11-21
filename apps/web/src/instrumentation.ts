import * as Sentry from '@sentry/nextjs';

async function configurePostHogLogs() {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!token || !host) {
    if (process.env.NODE_ENV !== 'production') {
      if (!token) {
        console.warn(
          'NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured'
        );
      }
      if (!host) {
        console.warn(
          'NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured'
        );
      }
    }
    return;
  }

  const [
    { BatchLogRecordProcessor, LoggerProvider },
    { OTLPLogExporter },
    { SeverityNumber },
    { resourceFromAttributes },
  ] = await Promise.all([
    import('@opentelemetry/sdk-logs'),
    import('@opentelemetry/exporter-logs-otlp-http'),
    import('@opentelemetry/api-logs'),
    import('@opentelemetry/resources'),
  ]);

  const loggerProvider = new LoggerProvider({
    resource: resourceFromAttributes({
      'service.name': 'indian-job-portal-web',
      'deployment.environment': process.env.NODE_ENV ?? 'development',
    }),
    processors: [
      new BatchLogRecordProcessor(
        new OTLPLogExporter({
          url: `${host.replace(/\/$/, '')}/i/v1/logs`,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeoutMillis: 3000,
        })
      ),
    ],
  });

  const logger = loggerProvider.getLogger('posthog-integration');
  logger.emit({
    severityNumber: SeverityNumber.INFO,
    body: 'PostHog log exporter initialized',
    attributes: {
      event: 'posthog_log_exporter_initialized',
      runtime: 'nodejs',
    },
  });

  process.once('beforeExit', () => {
    void loggerProvider.shutdown().catch(() => undefined);
  });

  return { logger, severityNumber: SeverityNumber };
}

/**
 * Next.js native instrumentation registration hook
 * Dynamically loads server or edge configuration based on runtime.
 * Guarantees zero execution overhead during static build phases (SSG).
 */
export async function register() {
  // Prevent execution during build/static evaluation phases
  if (process.env['NEXT_PHASE'] === 'phase-production-build') {
    return;
  }

  if (process.env['NEXT_RUNTIME'] === 'nodejs') {
    const posthogLogs = await configurePostHogLogs();

    // @ts-expect-error Next.js resolves TS file at build time
    await import('../sentry.server.config');

    posthogLogs?.logger.emit({
      severityNumber: posthogLogs.severityNumber.INFO,
      body: 'Server instrumentation initialized',
      attributes: {
        event: 'server_instrumentation_initialized',
        instrumentation: 'sentry',
      },
    });
  }

  if (process.env['NEXT_RUNTIME'] === 'edge') {
    // @ts-expect-error Next.js resolves TS file at build time
    await import('../sentry.edge.config');
  }
}

/**
 * Native Next.js server error capture hook (Next.js 15+ and @sentry/nextjs >= 8.28.0)
 * Automatically captures unhandled exceptions in Server Components and Route Handlers.
 */
export const onRequestError = Sentry.captureRequestError;
