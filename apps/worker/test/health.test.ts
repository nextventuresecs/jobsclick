import { describe, it, expect } from 'vitest';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { getWorkerHealthStatus, reportWorkerError } from '../src/health.js';
import { QUEUE_NAMES, scheduleRepeatableJobs, startWorkerCluster } from '../src/main.js';

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

  it.skipIf(process.env['RUN_LIVE_REDIS'] !== 'true')('starts only MVP workers in staging by default', async () => {
    const connection = new IORedis(process.env['REDIS_URL']!, { maxRetriesPerRequest: null });
    const registry = startWorkerCluster({ NODE_ENV: 'production', APP_ENV: 'staging', REDIS_URL: process.env['REDIS_URL']! }, connection, false);
    try {
      await registry.waitUntilReady();
      await scheduleRepeatableJobs(registry);
      registry.start();
      expect(registry.isRunning()).toBe(true);
      expect(registry.importWorker.isRunning()).toBe(true);
      expect(registry.inviteWorker.isRunning()).toBe(true);
      expect(registry.pdfWorker.isRunning()).toBe(true);
      expect([
        registry.broadcastWorker, registry.alertsWorker, registry.reconcileWorker,
        registry.expireWorker, registry.refundWorker, registry.invoiceOutboxWorker,
      ].filter(Boolean)).toHaveLength(0);
    } finally {
      await registry.close();
    }
  });

  it.skipIf(process.env['RUN_LIVE_REDIS'] !== 'true')('enables staging consumers only for the groups explicitly selected', async () => {
    const redisUrl = process.env['REDIS_URL']!;
    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    const registry = startWorkerCluster({
      NODE_ENV: 'production', APP_ENV: 'staging', REDIS_URL: redisUrl,
      ENABLE_P2_JOB_ALERTS: 'true', ENABLE_P2_PAYMENTS: 'true',
    }, connection, false);
    try {
      await registry.waitUntilReady();
      expect([
        registry.alertsWorker, registry.reconcileWorker, registry.expireWorker, registry.refundWorker, registry.invoiceOutboxWorker,
      ].filter(Boolean)).toHaveLength(5);
      expect(Boolean(registry.broadcastWorker)).toBe(false);
    } finally {
      await registry.close();
    }
  });

  it.skipIf(process.env['RUN_LIVE_REDIS'] !== 'true')('converges to one schedule after a restart and preserves unrelated schedules', async () => {
    const connection = new IORedis(process.env['REDIS_URL']!, { maxRetriesPerRequest: null });
    const queue = new Queue(QUEUE_NAMES.BROADCAST, { connection, prefix: `health:${crypto.randomUUID()}` });
    const repeat = { every: 15 * 60 * 1000 };
    try {
      await queue.upsertJobScheduler('broadcast-watchdog', repeat, { name: 'broadcast-watchdog' });
      await queue.add('broadcast-watchdog', { staleHours: 6 }, { jobId: 'broadcast-watchdog' });
      await queue.upsertJobScheduler('unrelated', repeat, { name: 'unrelated' });
      await scheduleRepeatableJobs({ broadcastQueue: queue });
      await scheduleRepeatableJobs({ broadcastQueue: queue });
      expect((await queue.getJobSchedulers()).map(({ key }) => key).sort()).toEqual(['broadcast-watchdog', 'unrelated']);
      expect(await queue.getJobState('broadcast-watchdog')).toBe('unknown');
    } finally {
      await queue.obliterate({ force: true });
      await queue.close();
      await connection.quit();
    }
  });
});
