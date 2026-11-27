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

const WORKER_ERROR_WINDOW_MS = 30_000;
const HEALTHY_PROBE_INTERVAL_MS = 60_000;
const FAILED_PROBE_INTERVAL_MS = 10_000;
const PROBE_TIMEOUT_MS = 3_000;

export function createWorkerReadiness(isRunning: () => boolean, probeRedis: () => Promise<unknown>) {
  let lastWorkerErrorAt = -Infinity;
  let nextProbeAt = 0;
  let probePending = false;
  let lastProbeSucceeded = false;

  const canReportReady = () => isRunning() && Date.now() - lastWorkerErrorAt >= WORKER_ERROR_WINDOW_MS;

  return {
    recordWorkerError() {
      lastWorkerErrorAt = Date.now();
      lastProbeSucceeded = false;
      nextProbeAt = 0;
    },
    async check(): Promise<boolean> {
      if (!canReportReady()) {
        lastProbeSucceeded = false;
        nextProbeAt = 0;
        return false;
      }
      if (probePending) return false;
      if (Date.now() < nextProbeAt) return lastProbeSucceeded;

      probePending = true;
      const command = Promise.resolve().then(probeRedis).then(() => true, () => false);
      // The Redis client may still have the command queued after our deadline.
      void command.then(() => { probePending = false; });
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), PROBE_TIMEOUT_MS);
      });
      const responded = await Promise.race([command, deadline]);
      clearTimeout(timeout);
      lastProbeSucceeded = responded && canReportReady();
      nextProbeAt = Date.now() + (lastProbeSucceeded ? HEALTHY_PROBE_INTERVAL_MS : FAILED_PROBE_INTERVAL_MS);
      return lastProbeSucceeded;
    },
  };
}
