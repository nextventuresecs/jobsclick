import { describe, it, expect } from 'vitest';
import { startWorkerCluster } from '../src/main.js';

const runLiveRedis = process.env['RUN_LIVE_REDIS'] === 'true';

describe.skipIf(!runLiveRedis)('Worker Cluster & BullMQ Queue Integration (Ticket T-07)', () => {
  it('processes queued bulk-import job and triggers worker completion', async () => {
    const reg = startWorkerCluster({
      NODE_ENV: 'test',
      REDIS_URL: 'redis://localhost:6379',
      USE_MOCK_REDIS: 'true',
    });

    try {
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
    const reg = startWorkerCluster({
      NODE_ENV: 'test',
      REDIS_URL: 'redis://localhost:6379',
      USE_MOCK_REDIS: 'true',
    });

    try {
      const csv = `name,phone\nRavi,9876543210`;
      let failedAttempts = 0;

      reg.importWorker.on('failed', () => {
        failedAttempts++;
      });

      const recoveryPromise = new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Retry recovery timed out')), 8000);
        reg.importWorker.on('completed', (job) => {
          clearTimeout(timer);
          resolve(job.attemptsMade + 1);
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

      const successfulAttempt = await recoveryPromise;
      expect(successfulAttempt).toBe(3);
      expect(failedAttempts).toBe(2);
    } finally {
      await reg.close();
    }
  });

  it('processes queued resume PDF generation and invite wave dispatch', async () => {
    const reg = startWorkerCluster({
      NODE_ENV: 'test',
      REDIS_URL: 'redis://localhost:6379',
      USE_MOCK_REDIS: 'true',
    });

    try {
      // PDF processing
      const pdfPromise = new Promise<{ bufferLength: number }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('PDF job timed out')), 8000);
        reg.pdfWorker.on('completed', (_job, result) => {
          clearTimeout(timer);
          resolve(result);
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

      // Invite wave processing
      const invitePromise = new Promise<{ totalCostInr: number; sentCount: number }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Invite job timed out')), 8000);
        reg.inviteWorker.on('completed', (_job, result) => {
          clearTimeout(timer);
          resolve(result);
        });
      });

      await reg.inviteQueue.add('invite-cluster-test', {
        waveId: 'wave_cluster_1',
        batchId: 'batch_cluster_1',
        waveSize: 2500,
        costPerSmsInr: 0.2,
      });

      const inviteResult = await invitePromise;
      expect(inviteResult.totalCostInr).toBe(500);
      expect(inviteResult.sentCount).toBe(2500);
    } finally {
      await reg.close();
    }
  });
});
