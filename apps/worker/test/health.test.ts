import IORedis from 'ioredis';
import { startWorkerCluster } from '../src/main.js';
import { describe, it, expect } from 'vitest';
import { getWorkerHealthStatus, reportWorkerError } from '../src/health.js';

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

  it.skipIf(process.env['RUN_LIVE_REDIS'] !== 'true')('waits for Redis and all BullMQ workers', async () => {
    const connection = new IORedis(process.env['REDIS_URL']!, { maxRetriesPerRequest: null });
    const registry = startWorkerCluster({ NODE_ENV: 'test', REDIS_URL: process.env['REDIS_URL']!, USE_MOCK_REDIS: 'false' }, connection);
    try {
      await registry.waitUntilReady();
      expect(registry.isRunning()).toBe(true);
    } finally {
      await registry.close();
      expect(registry.isRunning()).toBe(false);
    }
  });
});
