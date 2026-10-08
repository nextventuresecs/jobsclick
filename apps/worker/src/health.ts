import { captureException } from './config/sentry.js';

export function getWorkerHealthStatus(): { status: string; uptime: number; timestamp: string } {
  return {
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };
}

export function reportWorkerError(error: unknown): string {
  return captureException(error);
}
