import fs from 'node:fs';
import { initSentry } from './config/sentry.js';

// Pre-load local environment file if running outside a container / CI
if (!process.env['SENTRY_DSN'] && typeof process.loadEnvFile === 'function') {
  const envCandidates = ['.env.local', '../../.env.local', '.env', '../../.env'];
  for (const envFile of envCandidates) {
    if (fs.existsSync(envFile)) {
      try {
        process.loadEnvFile(envFile);
        break;
      } catch {
        // Ignore parsing errors
      }
    }
  }
}

// Early initialization of Sentry before requiring other modules
// This enables automatic OpenTelemetry instrumentation for HTTP, Fastify, IORedis, and Postgres
initSentry(process.env['SENTRY_DSN']);

export {};
