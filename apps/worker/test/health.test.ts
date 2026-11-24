import { describe, it, expect } from 'vitest';
import IORedis from 'ioredis';
import { getWorkerHealthStatus, reportWorkerError } from '../src/health.js';
import { startWorkerCluster } from '../src/main.js';

describe('Worker Health Check & Observability', () => {
  it('returns healthy status and valid uptime', () => {
    const health = getWorkerHealthStatus();
    expect(health.status).toBe('healthy');
    expect(typeof health.uptime).toBe('number');
    expect(health.timestamp).toBeDefined();
  });

  it('captures exception for Sentry logging', () => {
    const errId = reportWorkerError(new Error('Test worker exception'));
    expect(errId).toBeDefined();
  });

  it.skipIf(process.env['RUN_LIVE_REDIS'] !== 'true')('reports readiness after Redis and the workers connect', async () => {
    const redisUrl = process.env['REDIS_URL'];
    if (!redisUrl) throw new Error('A disposable test Redis connection is required');
    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    const registry = startWorkerCluster({ NODE_ENV: 'test', REDIS_URL: redisUrl, USE_MOCK_REDIS: 'false' }, connection);
    try {
      await registry.waitUntilReady();
      expect(registry.isRunning()).toBe(true);
    } finally {
      await registry.close();
    }
    expect(registry.isRunning()).toBe(false);
  });
});
