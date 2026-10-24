import { Worker, Queue, ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import IORedisMock from 'ioredis-mock';
import { validateEnv, EnvConfig } from './config/env.js';
import { getWorkerHealthStatus } from './health.js';
import { initSentry, captureException } from './config/sentry.js';
import { bulkImportProcessor } from './processors/import.processor.js';
import { inviteWaveProcessor } from './processors/invite.processor.js';
import { pdfGeneratorProcessor } from './processors/pdf.processor.js';
import { broadcastProcessor } from './processors/broadcast.processor.js';

export const QUEUE_NAMES = {
  BULK_IMPORT: 'bulk-import',
  INVITE_WAVE: 'invite-wave',
  PDF_GENERATOR: 'pdf-generator',
  BROADCAST: 'broadcast-queue',
} as const;

export const DEFAULT_RETRY_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
  removeOnComplete: false,
  removeOnFail: false,
};

export function getRedisConnection(env: EnvConfig): IORedis {
  if (env.USE_MOCK_REDIS === 'true' || env.NODE_ENV === 'test') {
    return new IORedisMock() as unknown as IORedis;
  }

  const redisUrl = env.REDIS_URL || 'redis://localhost:6379';
  const isTls = redisUrl.startsWith('rediss://');

  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: isTls ? { rejectUnauthorized: false } : undefined,
    retryStrategy(times) {
      // Exponential backoff with a cap of 5000ms
      return Math.min(times * 200, 5000);
    },
  });
}

export interface WorkerInstanceRegistry {
  importWorker: Worker;
  inviteWorker: Worker;
  pdfWorker: Worker;
  broadcastWorker: Worker;
  importQueue: Queue;
  inviteQueue: Queue;
  pdfQueue: Queue;
  broadcastQueue: Queue;
  connection: IORedis;
  close: () => Promise<void>;
}

export function startWorkerCluster(env: EnvConfig, customConnection?: IORedis): WorkerInstanceRegistry {
  const connection = customConnection || getRedisConnection(env);
  const connOptions = connection as unknown as ConnectionOptions;

  // Initialize Queues with standard 3x exponential retry options
  const importQueue = new Queue(QUEUE_NAMES.BULK_IMPORT, {
    connection: connOptions,
    defaultJobOptions: DEFAULT_RETRY_OPTIONS,
  });

  const inviteQueue = new Queue(QUEUE_NAMES.INVITE_WAVE, {
    connection: connOptions,
    defaultJobOptions: DEFAULT_RETRY_OPTIONS,
  });

  const pdfQueue = new Queue(QUEUE_NAMES.PDF_GENERATOR, {
    connection: connOptions,
    defaultJobOptions: DEFAULT_RETRY_OPTIONS,
  });

  const broadcastQueue = new Queue(QUEUE_NAMES.BROADCAST, {
    connection: connOptions,
    defaultJobOptions: DEFAULT_RETRY_OPTIONS,
  });

  // 1. Bulk Import Processor Worker (Streaming CSV & User Creation)
  const importWorker = new Worker(
    QUEUE_NAMES.BULK_IMPORT,
    async (job) => {
      console.log(`[Worker - ${QUEUE_NAMES.BULK_IMPORT}] Starting Job ${job.id} (Attempt ${job.attemptsMade + 1}/3)...`);
      return bulkImportProcessor(job);
    },
    {
      connection: connOptions,
      concurrency: 5,
    },
  );

  // 2. Invite Wave Processor Worker (SMS Dispatch with Cost Preview)
  const inviteWorker = new Worker(
    QUEUE_NAMES.INVITE_WAVE,
    async (job) => {
      console.log(`[Worker - ${QUEUE_NAMES.INVITE_WAVE}] Starting Job ${job.id} (Attempt ${job.attemptsMade + 1}/3)...`);
      return inviteWaveProcessor(job);
    },
    {
      connection: connOptions,
      concurrency: 5,
    },
  );

  // 3. PDF Generator Processor Worker (Resume Vector Rendering)
  const pdfWorker = new Worker(
    QUEUE_NAMES.PDF_GENERATOR,
    async (job) => {
      console.log(`[Worker - ${QUEUE_NAMES.PDF_GENERATOR}] Starting Job ${job.id} (Attempt ${job.attemptsMade + 1}/3)...`);
      return pdfGeneratorProcessor(job);
    },
    {
      connection: connOptions,
      concurrency: 10,
    },
  );

  // 4. Broadcast Processor Worker (MSME Department Bulk SMS Dispatch)
  const broadcastWorker = new Worker(
    QUEUE_NAMES.BROADCAST,
    async (job) => {
      console.log(`[Worker - ${QUEUE_NAMES.BROADCAST}] Starting Job ${job.id} (Attempt ${job.attemptsMade + 1}/3)...`);
      return broadcastProcessor(job);
    },
    {
      connection: connOptions,
      concurrency: 5,
    },
  );

  const workers = [
    { name: QUEUE_NAMES.BULK_IMPORT, instance: importWorker },
    { name: QUEUE_NAMES.INVITE_WAVE, instance: inviteWorker },
    { name: QUEUE_NAMES.PDF_GENERATOR, instance: pdfWorker },
    { name: QUEUE_NAMES.BROADCAST, instance: broadcastWorker },
  ];

  workers.forEach(({ name, instance }) => {
    instance.on('completed', (job, result) => {
      console.log(`[Worker - ${name}] Job ${job.id} COMPLETED successfully.`, typeof result === 'object' ? JSON.stringify(result) : result);
    });

    instance.on('failed', (job, err) => {
      console.error(`[Worker - ${name}] Job ${job?.id} FAILED (Attempt ${job?.attemptsMade}/${job?.opts.attempts}): ${err.message}`);
      captureException(err);
    });

    instance.on('error', (err) => {
      console.error(`[Worker - ${name}] Unhandled worker error: ${err.message}`);
      captureException(err);
    });
  });

  const close = async () => {
    console.log('[Worker] Shutting down workers and queues...');
    await Promise.allSettled([
      importWorker.close(),
      inviteWorker.close(),
      pdfWorker.close(),
      broadcastWorker.close(),
      importQueue.close(),
      inviteQueue.close(),
      pdfQueue.close(),
      broadcastQueue.close(),
    ]);
    if (typeof connection.quit === 'function') {
      try {
        await connection.quit();
      } catch {
        // Ignore connection close errors
      }
    }
  };

  return {
    importWorker,
    inviteWorker,
    pdfWorker,
    broadcastWorker,
    importQueue,
    inviteQueue,
    pdfQueue,
    broadcastQueue,
    connection,
    close,
  };
}

let activeRegistry: WorkerInstanceRegistry | null = null;

async function main() {
  const env = validateEnv();
  initSentry(env.SENTRY_DSN);
  console.log(`[Worker - BullMQ Mode] Starting worker cluster in ${env.NODE_ENV} mode...`);

  try {
    activeRegistry = startWorkerCluster(env);
    console.log(`[Worker - BullMQ Mode] Successfully connected to queues: ${Object.values(QUEUE_NAMES).join(', ')}`);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[Worker Startup Error] ${error.message}`);
    captureException(error);
  }

  setInterval(() => {
    const health = getWorkerHealthStatus();
    console.log(`[Worker Heartbeat] ${health.timestamp} - Status: ${health.status}, Uptime: ${health.uptime.toFixed(1)}s (BullMQ workers active)`);
  }, 10000);

  const shutdown = async () => {
    if (activeRegistry) {
      await activeRegistry.close();
    }
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Only auto-run main if not required/imported as module in tests
if (process.env['NODE_ENV'] !== 'test' && !process.env['VITEST']) {
  main();
}
