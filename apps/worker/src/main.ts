import { validateEnv } from './config/env.js';
import { getWorkerHealthStatus } from './health.js';

async function main() {
  const env = validateEnv();
  console.log(`[Worker] Started in ${env.NODE_ENV} mode.`);

  setInterval(() => {
    const health = getWorkerHealthStatus();
    console.log(`[Worker Heartbeat] ${health.timestamp} - Status: ${health.status}, Uptime: ${health.uptime.toFixed(1)}s`);
  }, 10000);
}

main();
