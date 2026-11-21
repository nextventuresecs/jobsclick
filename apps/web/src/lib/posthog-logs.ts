import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

let loggerProvider: LoggerProvider | undefined;
let posthogLogger: ReturnType<LoggerProvider['getLogger']> | undefined;

if (!projectToken || !posthogHost) {
  if (process.env.NODE_ENV !== 'production') {
    if (!projectToken) {
      console.warn(
        'NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured'
      );
    }

    if (!posthogHost) {
      console.warn(
        'NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured'
      );
    }
  }
} else {
  loggerProvider = new LoggerProvider({
    resource: resourceFromAttributes({ 'service.name': 'jobsclick-web' }),
    processors: [
      new BatchLogRecordProcessor(
        new OTLPLogExporter({
          url: `${posthogHost.replace(/\/$/, '')}/i/v1/logs`,
          timeoutMillis: 2000,
          headers: {
            Authorization: `Bearer ${projectToken}`,
            'Content-Type': 'application/json',
          },
        })
      ),
    ],
  });
  posthogLogger = loggerProvider.getLogger('jobsclick.posthog');
}

export function getPostHogLogger() {
  return posthogLogger;
}

export async function flushPostHogLogs() {
  if (loggerProvider) {
    await loggerProvider.forceFlush().catch(() => {});
  }
}
