import { validateEnv } from './config/env.js';
import { getWorkerHealthStatus } from './health.js';
import { initSentry } from './config/sentry.js';

async function main() {
  const env = validateEnv();
  initSentry(env.SENTRY_DSN);
  console.log(`[Worker] Started in ${env.NODE_ENV} mode.`);

  setInterval(() => {
    const health = getWorkerHealthStatus();
    console.log(`[Worker Heartbeat] ${health.timestamp} - Status: ${health.status}, Uptime: ${health.uptime.toFixed(1)}s`);
  }, 10000);
}

main();
