import crypto from 'node:crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import IORedis from 'ioredis';
import { startWorkerCluster } from '../src/main.js';
import { importProcessor } from '../src/processors/import.processor.js';

const runLiveRedis = process.env['RUN_LIVE_REDIS'] === 'true';

describe.skipIf(!runLiveRedis)('Worker Cluster & BullMQ Queue Integration (Ticket T-07)', () => {
  const liveRedisUrl = () => process.env['REDIS_URL'] || 'redis://127.0.0.1:6379';

  beforeEach(() => {
    // Isolate BullMQ+Redis cluster tests from external Supabase network calls
    importProcessor.setSupabaseClient(null);
  });

  it('processes queued bulk-import job and triggers worker completion', async () => {
    const prefix = `cluster:${crypto.randomUUID()}`;
    const connection = new IORedis(liveRedisUrl(), { maxRetriesPerRequest: null });
    const reg = startWorkerCluster({
      NODE_ENV: 'test',
      REDIS_URL: liveRedisUrl(),
      USE_MOCK_REDIS: 'false',
    }, connection, true, prefix);

    try {
      await reg.waitUntilReady();
      const csv = `name,phone\nAnita,9876543210\nRahul,9876543211`;

      const completedPromise = new Promise<{ validRows: number }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Job completion timed out')), 8000);
        reg.importWorker.on('completed', (_job, result) => {
          clearTimeout(timer);
          resolve(result);
        });
        reg.importWorker.on('failed', (_job, err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      await reg.importQueue.add('import-test', {
        batchId: 'batch_cluster_test_1',
        source: 'MSME',
        csvContent: csv,
      });

      const result = await completedPromise;
      expect(result.validRows).toBe(2);
    } finally {
      await reg.close();
    }
  });

  it('retries failed jobs up to 3 times with backoff before recovery (Acceptance Criteria #2)', async () => {
    const prefix = `cluster:${crypto.randomUUID()}`;
    const connection = new IORedis(liveRedisUrl(), { maxRetriesPerRequest: null });
    const reg = startWorkerCluster({
      NODE_ENV: 'test',
      REDIS_URL: liveRedisUrl(),
      USE_MOCK_REDIS: 'false',
    }, connection, true, prefix);

    try {
      await reg.waitUntilReady();
      const csv = `name,phone\nRavi,9876543210`;
      let failedAttempts = 0;

      reg.importWorker.on('failed', () => {
        failedAttempts++;
      });

      const recoveryPromise = new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Retry recovery timed out')), 8000);
        reg.importWorker.on('completed', (job) => {
          clearTimeout(timer);
          resolve(job.attemptsMade);
        });
      });

      await reg.importQueue.add(
        'fail-test-recover',
        {
          batchId: 'batch_recover_cluster',
          source: 'MSME',
          csvContent: csv,
          shouldSimulateFailure: true,
        },
        {
          attempts: 3,
          backoff: { type: 'fixed', delay: 100 },
        },
      );

      const totalAttempts = await recoveryPromise;
      expect(totalAttempts).toBe(3);
      expect(failedAttempts).toBe(2);
    } finally {
      await reg.close();
    }
  });

  it('processes queued resume PDF generation and propagates invite error cleanly', async () => {
    const prefix = `cluster:${crypto.randomUUID()}`;
    const connection = new IORedis(liveRedisUrl(), { maxRetriesPerRequest: null });
    const reg = startWorkerCluster({
      NODE_ENV: 'test',
      REDIS_URL: liveRedisUrl(),
      USE_MOCK_REDIS: 'false',
    }, connection, true, prefix);

    try {
      await reg.waitUntilReady();

      // PDF processing
      const pdfPromise = new Promise<{ bufferLength: number }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('PDF job timed out')), 8000);
        reg.pdfWorker.on('completed', (_job, result) => {
          clearTimeout(timer);
          resolve(result);
        });
        reg.pdfWorker.on('failed', (_job, err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      await reg.pdfQueue.add('pdf-cluster-test', {
        seekerId: 'seeker_cluster_1',
        fullName: 'Amit Kumar',
        seekerType: 'student',
        city: 'Bhopal',
        skills: ['Tally', 'Hindi Typing'],
      });

      const pdfResult = await pdfPromise;
      expect(pdfResult.bufferLength).toBeGreaterThan(0);

      // Invite wave processing fails closed without DB backing
      const inviteFailedPromise = new Promise<Error>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Invite job failure propagation timed out')), 8000);
        reg.inviteWorker.on('failed', (_job, err) => {
          clearTimeout(timer);
          resolve(err);
        });
      });

      await reg.inviteQueue.add(
        'invite-cluster-test',
        {
          waveId: 'wave_cluster_1',
          batchId: 'batch_cluster_1',
          waveSize: 10,
          costPerSmsInr: 0.2,
        },
        { attempts: 1 },
      );

      const inviteErr = await inviteFailedPromise;
      expect(inviteErr.message).toMatch(/INVITE_(DATABASE_UNAVAILABLE|WAVE_BATCH_MISMATCH)/);
    } finally {
      await reg.close();
    }
  });
});
