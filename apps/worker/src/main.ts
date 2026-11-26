import './instrument.js';
import { Worker, Queue, ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { isStaging } from '@indian-job-portal/validation';
import { createWorkerReadiness } from './health.js';
import { validateEnv, EnvConfig } from './config/env.js';
import {
  initSentry,
  captureException,
  wrapBullMQProcessor,
  handleWorkerJobFailure,
} from './config/sentry.js';
import {
  bulkImportProcessor,
  BulkImportJobData,
  BulkImportJobResult,
} from './processors/import.processor.js';
import {
  inviteWaveProcessor,
  InviteWaveJobData,
  InviteWaveJobResult,
} from './processors/invite.processor.js';
import {
  pdfGeneratorProcessor,
  PdfJobData,
  PdfJobResult,
} from './processors/pdf.processor.js';
import {
  broadcastProcessor,
  BroadcastBatchJobData,
  BroadcastBatchJobResult,
} from './processors/broadcast.processor.js';
import {
  alertsProcessor,
  AlertsJobData,
  AlertsJobResult,
} from './processors/alerts.processor.js';
import {
  reconcileProcessor,
  ReconcileJobData,
  ReconcileJobResult,
} from './payments/reconcile.processor.js';
import {
  expireOrdersProcessor,
  ExpireOrdersJobData,
  ExpireOrdersJobResult,
} from './payments/expire-orders.processor.js';
import {
  refundProcessor,
  RefundJobData,
  RefundJobResult,
} from './payments/refund.processor.js';
import {
  invoiceOutboxProcessor,
  InvoiceOutboxJobData,
  InvoiceOutboxJobResult,
} from './payments/invoice-outbox.processor.js';

export const QUEUE_NAMES = {
  BULK_IMPORT: 'bulk-import',
  INVITE_WAVE: 'invite-wave',
  PDF_GENERATOR: 'pdf-generator',
  BROADCAST: 'broadcast-queue',
  ALERTS: 'alerts-queue',
  PAYMENTS_RECONCILE: 'payments-reconcile',
  PAYMENTS_EXPIRE: 'payments-expire',
  PAYMENTS_REFUND: 'payments-refund',
  PAYMENTS_INVOICE_OUTBOX: 'payments-invoice-outbox',
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

export const PAYMENTS_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
  removeOnComplete: { age: 86400, count: 1000 },
  removeOnFail: { age: 604800 },
};

export function getRedisConnection(env: EnvConfig): IORedis {
  if (env.USE_MOCK_REDIS === 'true' || env.NODE_ENV === 'test') {
    const IORedisMock = require('ioredis-mock') as typeof IORedis;
    return new IORedisMock() as unknown as IORedis;
  }

  const redisUrl = env.REDIS_URL || 'redis://localhost:6379';
  const isTls = redisUrl.startsWith('rediss://');

  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: isTls ? {} : undefined,
    retryStrategy(times) {
      // Exponential backoff with a cap of 5000ms
      return Math.min(times * 200, 5000);
    },
  });
}

export interface WorkerInstanceRegistry {
  importWorker: Worker<BulkImportJobData, BulkImportJobResult>;
  inviteWorker: Worker<InviteWaveJobData, InviteWaveJobResult>;
  pdfWorker: Worker<PdfJobData, PdfJobResult>;
  broadcastWorker: Worker<BroadcastBatchJobData, BroadcastBatchJobResult>;
  alertsWorker: Worker<AlertsJobData, AlertsJobResult>;
  reconcileWorker: Worker<ReconcileJobData, ReconcileJobResult>;
  expireWorker: Worker<ExpireOrdersJobData, ExpireOrdersJobResult>;
  refundWorker: Worker<RefundJobData, RefundJobResult>;
  invoiceOutboxWorker: Worker<InvoiceOutboxJobData, InvoiceOutboxJobResult>;
  importQueue: Queue;
  inviteQueue: Queue;
  pdfQueue: Queue;
  broadcastQueue: Queue;
  alertsQueue: Queue;
  reconcileQueue: Queue;
  expireQueue: Queue;
  refundQueue: Queue;
  invoiceOutboxQueue: Queue;
  connection: IORedis;
  waitUntilReady: () => Promise<void>;
  isRunning: () => boolean;
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

  const alertsQueue = new Queue(QUEUE_NAMES.ALERTS, {
    connection: connOptions,
    defaultJobOptions: DEFAULT_RETRY_OPTIONS,
  });

  const reconcileQueue = new Queue(QUEUE_NAMES.PAYMENTS_RECONCILE, {
    connection: connOptions,
    defaultJobOptions: PAYMENTS_JOB_OPTIONS,
  });

  const expireQueue = new Queue(QUEUE_NAMES.PAYMENTS_EXPIRE, {
    connection: connOptions,
    defaultJobOptions: PAYMENTS_JOB_OPTIONS,
  });

  const refundQueue = new Queue(QUEUE_NAMES.PAYMENTS_REFUND, {
    connection: connOptions,
    defaultJobOptions: PAYMENTS_JOB_OPTIONS,
  });

  const invoiceOutboxQueue = new Queue(QUEUE_NAMES.PAYMENTS_INVOICE_OUTBOX, {
    connection: connOptions,
    defaultJobOptions: PAYMENTS_JOB_OPTIONS,
  });

  // 1. Bulk Import Processor Worker (Streaming CSV & User Creation)
  const importWorker = new Worker<BulkImportJobData, BulkImportJobResult>(
    QUEUE_NAMES.BULK_IMPORT,
    wrapBullMQProcessor(QUEUE_NAMES.BULK_IMPORT, async (job) => {
      console.log(`[Worker - ${QUEUE_NAMES.BULK_IMPORT}] Starting Job ${job.id} (Attempt ${job.attemptsMade + 1}/3)...`);
      return bulkImportProcessor(job);
    }),
    {
      connection: connOptions,
      concurrency: 5,
    },
  );

  // 2. Invite Wave Processor Worker (SMS Dispatch with Cost Preview)
  const inviteWorker = new Worker<InviteWaveJobData, InviteWaveJobResult>(
    QUEUE_NAMES.INVITE_WAVE,
    wrapBullMQProcessor(QUEUE_NAMES.INVITE_WAVE, async (job) => {
      console.log(`[Worker - ${QUEUE_NAMES.INVITE_WAVE}] Starting Job ${job.id} (Attempt ${job.attemptsMade + 1}/3)...`);
      return inviteWaveProcessor(job);
    }),
    {
      connection: connOptions,
      concurrency: 5,
    },
  );

  // 3. PDF Generator Processor Worker (Resume Vector Rendering)
  const pdfWorker = new Worker<PdfJobData, PdfJobResult>(
    QUEUE_NAMES.PDF_GENERATOR,
    wrapBullMQProcessor(QUEUE_NAMES.PDF_GENERATOR, async (job) => {
      console.log(`[Worker - ${QUEUE_NAMES.PDF_GENERATOR}] Starting Job ${job.id} (Attempt ${job.attemptsMade + 1}/3)...`);
      return pdfGeneratorProcessor(job);
    }),
    {
      connection: connOptions,
      concurrency: 10,
    },
  );

  // 4. Broadcast Processor Worker (MSME Department Bulk SMS Dispatch)
  const broadcastWorker = new Worker<BroadcastBatchJobData, BroadcastBatchJobResult>(
    QUEUE_NAMES.BROADCAST,
    wrapBullMQProcessor(QUEUE_NAMES.BROADCAST, async (job) => {
      console.log(`[Worker - ${QUEUE_NAMES.BROADCAST}] Starting Job ${job.id} (Attempt ${job.attemptsMade + 1}/3)...`);
      return broadcastProcessor(job);
    }),
    {
      connection: connOptions,
      concurrency: 5,
    },
  );

  // 5. Alerts Processor Worker (Saved Job Alerts & Daily Digest Email)
  const alertsWorker = new Worker<AlertsJobData, AlertsJobResult>(
    QUEUE_NAMES.ALERTS,
    wrapBullMQProcessor(QUEUE_NAMES.ALERTS, async (job) => {
      console.log(`[Worker - ${QUEUE_NAMES.ALERTS}] Starting Job ${job.id} (Attempt ${job.attemptsMade + 1}/3)...`);
      return alertsProcessor(job);
    }),
    {
      connection: connOptions,
      concurrency: 5,
    },
  );

  // 6. Payments Reconcile Processor Worker
  const reconcileWorker = new Worker<ReconcileJobData, ReconcileJobResult>(
    QUEUE_NAMES.PAYMENTS_RECONCILE,
    wrapBullMQProcessor(QUEUE_NAMES.PAYMENTS_RECONCILE, async (job) => {
      console.log(`[Worker - ${QUEUE_NAMES.PAYMENTS_RECONCILE}] Starting Job ${job.id}...`);
      return reconcileProcessor(job);
    }),
    {
      connection: connOptions,
      concurrency: 2,
    },
  );

  // 7. Payments Expire Orders Processor Worker
  const expireWorker = new Worker<ExpireOrdersJobData, ExpireOrdersJobResult>(
    QUEUE_NAMES.PAYMENTS_EXPIRE,
    wrapBullMQProcessor(QUEUE_NAMES.PAYMENTS_EXPIRE, async (job) => {
      console.log(`[Worker - ${QUEUE_NAMES.PAYMENTS_EXPIRE}] Starting Job ${job.id}...`);
      return expireOrdersProcessor(job);
    }),
    {
      connection: connOptions,
      concurrency: 2,
    },
  );

  // 8. Payments Refund Processor Worker
  const refundWorker = new Worker<RefundJobData, RefundJobResult>(
    QUEUE_NAMES.PAYMENTS_REFUND,
    wrapBullMQProcessor(QUEUE_NAMES.PAYMENTS_REFUND, async (job) => {
      console.log(`[Worker - ${QUEUE_NAMES.PAYMENTS_REFUND}] Starting Job ${job.id}...`);
      return refundProcessor(job);
    }),
    {
      connection: connOptions,
      concurrency: 5,
    },
  );

  // 9. Payments Invoice Outbox Processor Worker
  const invoiceOutboxWorker = new Worker<InvoiceOutboxJobData, InvoiceOutboxJobResult>(
    QUEUE_NAMES.PAYMENTS_INVOICE_OUTBOX,
    wrapBullMQProcessor(QUEUE_NAMES.PAYMENTS_INVOICE_OUTBOX, async (job) => {
      console.log(`[Worker - ${QUEUE_NAMES.PAYMENTS_INVOICE_OUTBOX}] Starting Job ${job.id}...`);
      return invoiceOutboxProcessor(job);
    }),
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
    { name: QUEUE_NAMES.ALERTS, instance: alertsWorker },
    { name: QUEUE_NAMES.PAYMENTS_RECONCILE, instance: reconcileWorker },
    { name: QUEUE_NAMES.PAYMENTS_EXPIRE, instance: expireWorker },
    { name: QUEUE_NAMES.PAYMENTS_REFUND, instance: refundWorker },
    { name: QUEUE_NAMES.PAYMENTS_INVOICE_OUTBOX, instance: invoiceOutboxWorker },
  ];

  workers.forEach(({ name, instance }) => {
    instance.on('completed', (job, result) => {
      if (name === QUEUE_NAMES.BULK_IMPORT) {
        console.log(`[Worker - ${name}] Job ${job.id} COMPLETED successfully.`);
        return;
      }
      console.log(`[Worker - ${name}] Job ${job.id} COMPLETED successfully.`, typeof result === 'object' ? JSON.stringify(result) : result);
    });

    instance.on('failed', (job, err) => {
      handleWorkerJobFailure(name, job, err);
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
      alertsWorker.close(),
      reconcileWorker.close(),
      expireWorker.close(),
      refundWorker.close(),
      invoiceOutboxWorker.close(),
      importQueue.close(),
      inviteQueue.close(),
      pdfQueue.close(),
      broadcastQueue.close(),
      alertsQueue.close(),
      reconcileQueue.close(),
      expireQueue.close(),
      refundQueue.close(),
      invoiceOutboxQueue.close(),
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
    alertsWorker,
    reconcileWorker,
    expireWorker,
    refundWorker,
    invoiceOutboxWorker,
    importQueue,
    inviteQueue,
    pdfQueue,
    broadcastQueue,
    alertsQueue,
    reconcileQueue,
    expireQueue,
    refundQueue,
    invoiceOutboxQueue,
    connection,
    waitUntilReady: async () => {
      await Promise.all(workers.map(({ instance }) => instance.waitUntilReady()));
      await connection.ping();
    },
    isRunning: () => connection.status === 'ready' && workers.every(({ instance }) => instance.isRunning()),
    close,
  };
}

interface RepeatJobOptions {
  repeat: {
    every?: number;
    pattern?: string;
  };
  jobId?: string;
}

interface QueueWithRepeatSchedule {
  add: (name: string, data: Record<string, unknown>, opts: RepeatJobOptions) => Promise<unknown>;
  upsertJobScheduler?: (
    id: string,
    repeat: { every: number },
    template: { name: string; data: Record<string, unknown>; opts?: { jobId?: string } },
  ) => Promise<unknown>;
}

export async function scheduleRepeatableJobs(registry: WorkerInstanceRegistry): Promise<void> {
  const { reconcileQueue, expireQueue, invoiceOutboxQueue, broadcastQueue } = registry;

  const recQueue = reconcileQueue as unknown as QueueWithRepeatSchedule;
  const expQueue = expireQueue as unknown as QueueWithRepeatSchedule;
  const outQueue = invoiceOutboxQueue as unknown as QueueWithRepeatSchedule;
  const bcastQueue = broadcastQueue as unknown as QueueWithRepeatSchedule;

  if (typeof recQueue.upsertJobScheduler === 'function') {
    try {
      await recQueue.upsertJobScheduler(
        'reconcile-periodic',
        { every: 10 * 60 * 1000 },
        { name: 'reconcile-periodic', data: {}, opts: { jobId: 'reconcile-periodic' } },
      );
    } catch {
      // Fallback to queue.add if scheduler lua execution is unavailable
    }
  }
  await recQueue.add(
    'reconcile-periodic',
    {},
    {
      repeat: { every: 10 * 60 * 1000 },
      jobId: 'reconcile-periodic',
    },
  );

  if (typeof expQueue.upsertJobScheduler === 'function') {
    try {
      await expQueue.upsertJobScheduler(
        'expire-periodic',
        { every: 60 * 60 * 1000 },
        { name: 'expire-periodic', data: { olderThanHours: 48 }, opts: { jobId: 'expire-periodic' } },
      );
    } catch {
      // Fallback to queue.add if scheduler lua execution is unavailable
    }
  }
  await expQueue.add(
    'expire-periodic',
    { olderThanHours: 48 },
    {
      repeat: { every: 60 * 60 * 1000 },
      jobId: 'expire-periodic',
    },
  );

  if (typeof outQueue.upsertJobScheduler === 'function') {
    try {
      await outQueue.upsertJobScheduler(
        'outbox-periodic',
        { every: 60 * 1000 },
        { name: 'outbox-periodic', data: { batchLimit: 20 }, opts: { jobId: 'outbox-periodic' } },
      );
    } catch {
      // Fallback to queue.add if scheduler lua execution is unavailable
    }
  }
  await outQueue.add(
    'outbox-periodic',
    { batchLimit: 20 },
    {
      repeat: { every: 60 * 1000 },
      jobId: 'outbox-periodic',
    },
  );

  if (bcastQueue) {
    if (typeof bcastQueue.upsertJobScheduler === 'function') {
      try {
        await bcastQueue.upsertJobScheduler(
          'broadcast-watchdog',
          { every: 15 * 60 * 1000 },
          { name: 'broadcast-watchdog', data: { staleHours: 6 }, opts: { jobId: 'broadcast-watchdog' } },
        );
      } catch {
        // Fallback to queue.add if scheduler lua execution is unavailable
      }
    }
    await bcastQueue.add(
      'broadcast-watchdog',
      { staleHours: 6 },
      {
        repeat: { every: 15 * 60 * 1000 },
        jobId: 'broadcast-watchdog',
      },
    );
  }
}

let activeRegistry: WorkerInstanceRegistry | null = null;

async function main() {
  const env = validateEnv();
  initSentry(env.SENTRY_DSN);
  console.log(`[Worker - BullMQ Mode] Starting worker cluster in ${env.NODE_ENV} mode...`);

  const registry = startWorkerCluster(env);
  activeRegistry = registry;
  await registry.waitUntilReady();

  if (env.NODE_ENV !== 'test') {
    await scheduleRepeatableJobs(registry);
  }

  const heartbeat = () => {
    console.log(registry.isRunning() ? '[Worker Readiness] ready' : '[Worker Readiness] unavailable');
  };
  heartbeat();
  const readinessTimer = setInterval(heartbeat, 10_000);

  const shutdown = async () => {
    clearInterval(readinessTimer);
    console.log('[Worker Readiness] unavailable');
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
  void main().catch(async (err: unknown) => {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('[Worker Startup Error]', error.message);
    captureException(error);
    await activeRegistry?.close();
    process.exit(1);
  });
}
