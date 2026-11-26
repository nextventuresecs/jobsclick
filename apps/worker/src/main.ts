import './instrument.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker, Queue, ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import {
  isStaging,
  isTestEnv,
  QUEUE_NAMES,
  DEFAULT_BULLMQ_RETRY_OPTIONS,
  PAYMENTS_BULLMQ_JOB_OPTIONS,
} from '@indian-job-portal/validation';
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

export { QUEUE_NAMES };
export const DEFAULT_RETRY_OPTIONS = DEFAULT_BULLMQ_RETRY_OPTIONS;
export const PAYMENTS_JOB_OPTIONS = PAYMENTS_BULLMQ_JOB_OPTIONS;

export function getRedisConnection(env: EnvConfig): IORedis {
  if (env.USE_MOCK_REDIS === 'true' || (env.USE_MOCK_REDIS !== 'false' && env.NODE_ENV === 'test')) {
    const IORedisMock = require('ioredis-mock') as typeof IORedis;
    return new IORedisMock() as unknown as IORedis;
  }

  const redisUrl = env.REDIS_URL_BULLMQ || env.REDIS_URL || 'redis://localhost:6379';
  const isTls = redisUrl.startsWith('rediss://');

  const client = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: isTls ? {} : undefined,
    retryStrategy(times) {
      // Exponential backoff with a cap of 5000ms
      return Math.min(times * 200, 5000);
    },
  });

  client.on('error', (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Worker Redis] Connection warning:', msg);
  });

  return client;
}

export interface WorkerInstanceRegistry {
  importWorker: Worker<BulkImportJobData, BulkImportJobResult>;
  inviteWorker: Worker<InviteWaveJobData, InviteWaveJobResult>;
  pdfWorker: Worker<PdfJobData, PdfJobResult>;
  broadcastWorker?: Worker<BroadcastBatchJobData, BroadcastBatchJobResult>;
  alertsWorker?: Worker<AlertsJobData, AlertsJobResult>;
  reconcileWorker?: Worker<ReconcileJobData, ReconcileJobResult>;
  expireWorker?: Worker<ExpireOrdersJobData, ExpireOrdersJobResult>;
  refundWorker?: Worker<RefundJobData, RefundJobResult>;
  invoiceOutboxWorker?: Worker<InvoiceOutboxJobData, InvoiceOutboxJobResult>;
  importQueue: Queue;
  inviteQueue: Queue;
  pdfQueue: Queue;
  broadcastQueue?: Queue;
  alertsQueue?: Queue;
  reconcileQueue?: Queue;
  expireQueue?: Queue;
  refundQueue?: Queue;
  invoiceOutboxQueue?: Queue;
  connection: IORedis;
  waitUntilReady: () => Promise<void>;
  start: () => void;
  isRunning: () => boolean;
  checkReadiness: () => Promise<boolean>;
  close: () => Promise<void>;
}

export function startWorkerCluster(
  env: EnvConfig,
  customConnection?: IORedis,
  autorun = true,
  queuePrefix?: string,
): WorkerInstanceRegistry {
  const connection = customConnection || getRedisConnection(env);
  const connOptions = connection as unknown as ConnectionOptions;
  const prefixOpt = queuePrefix ? { prefix: queuePrefix } : {};

  const staging = isStaging({ APP_ENV: env.APP_ENV, NODE_ENV: env.NODE_ENV });
  const broadcastEnabled = !staging || env.ENABLE_P2_MSME_BROADCAST === 'true';
  const alertsEnabled = !staging || env.ENABLE_P2_JOB_ALERTS === 'true';
  const paymentsEnabled = !staging || env.ENABLE_P2_PAYMENTS === 'true';

  // Initialize Queues with standard 3x exponential retry options
  const importQueue = new Queue(QUEUE_NAMES.BULK_IMPORT, {
    connection: connOptions,
    ...prefixOpt,
    defaultJobOptions: DEFAULT_RETRY_OPTIONS,
  });

  const inviteQueue = new Queue(QUEUE_NAMES.INVITE_WAVE, {
    connection: connOptions,
    ...prefixOpt,
    defaultJobOptions: DEFAULT_RETRY_OPTIONS,
  });

  const pdfQueue = new Queue(QUEUE_NAMES.PDF_GENERATOR, {
    connection: connOptions,
    ...prefixOpt,
    defaultJobOptions: DEFAULT_RETRY_OPTIONS,
  });

  const broadcastQueue = broadcastEnabled ? new Queue(QUEUE_NAMES.BROADCAST, {
    connection: connOptions,
    ...prefixOpt,
    defaultJobOptions: DEFAULT_RETRY_OPTIONS,
  }) : undefined;

  const alertsQueue = alertsEnabled ? new Queue(QUEUE_NAMES.ALERTS, {
    connection: connOptions,
    ...prefixOpt,
    defaultJobOptions: DEFAULT_RETRY_OPTIONS,
  }) : undefined;

  const reconcileQueue = paymentsEnabled ? new Queue(QUEUE_NAMES.PAYMENTS_RECONCILE, {
    connection: connOptions,
    ...prefixOpt,
    defaultJobOptions: PAYMENTS_JOB_OPTIONS,
  }) : undefined;

  const expireQueue = paymentsEnabled ? new Queue(QUEUE_NAMES.PAYMENTS_EXPIRE, {
    connection: connOptions,
    ...prefixOpt,
    defaultJobOptions: PAYMENTS_JOB_OPTIONS,
  }) : undefined;

  const refundQueue = paymentsEnabled ? new Queue(QUEUE_NAMES.PAYMENTS_REFUND, {
    connection: connOptions,
    ...prefixOpt,
    defaultJobOptions: PAYMENTS_JOB_OPTIONS,
  }) : undefined;

  const invoiceOutboxQueue = paymentsEnabled ? new Queue(QUEUE_NAMES.PAYMENTS_INVOICE_OUTBOX, {
    connection: connOptions,
    ...prefixOpt,
    defaultJobOptions: PAYMENTS_JOB_OPTIONS,
  }) : undefined;

  // 1. Bulk Import Processor Worker (Streaming CSV & User Creation)
  const importWorker = new Worker<BulkImportJobData, BulkImportJobResult>(
    QUEUE_NAMES.BULK_IMPORT,
    wrapBullMQProcessor(QUEUE_NAMES.BULK_IMPORT, async (job) => {
      console.log(`[Worker - ${QUEUE_NAMES.BULK_IMPORT}] Starting Job ${job.id} (Attempt ${job.attemptsMade + 1}/3)...`);
      return bulkImportProcessor(job);
    }),
    {
      connection: connOptions,
      ...prefixOpt,
      autorun,
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
      ...prefixOpt,
      autorun,
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
      ...prefixOpt,
      autorun,
      concurrency: 10,
    },
  );

  // 4. Broadcast Processor Worker (MSME Department Bulk SMS Dispatch)
  const broadcastWorker = broadcastEnabled ? new Worker<BroadcastBatchJobData, BroadcastBatchJobResult>(
    QUEUE_NAMES.BROADCAST,
    wrapBullMQProcessor(QUEUE_NAMES.BROADCAST, async (job) => {
      console.log(`[Worker - ${QUEUE_NAMES.BROADCAST}] Starting Job ${job.id} (Attempt ${job.attemptsMade + 1}/3)...`);
      return broadcastProcessor(job);
    }),
    {
      connection: connOptions,
      ...prefixOpt,
      autorun,
      concurrency: 5,
    },
  ) : undefined;

  // 5. Alerts Processor Worker (Saved Job Alerts & Daily Digest Email)
  const alertsWorker = alertsEnabled ? new Worker<AlertsJobData, AlertsJobResult>(
    QUEUE_NAMES.ALERTS,
    wrapBullMQProcessor(QUEUE_NAMES.ALERTS, async (job) => {
      console.log(`[Worker - ${QUEUE_NAMES.ALERTS}] Starting Job ${job.id} (Attempt ${job.attemptsMade + 1}/3)...`);
      return alertsProcessor(job);
    }),
    {
      connection: connOptions,
      ...prefixOpt,
      autorun,
      concurrency: 5,
    },
  ) : undefined;

  // 6. Payments Reconcile Processor Worker
  const reconcileWorker = paymentsEnabled ? new Worker<ReconcileJobData, ReconcileJobResult>(
    QUEUE_NAMES.PAYMENTS_RECONCILE,
    wrapBullMQProcessor(QUEUE_NAMES.PAYMENTS_RECONCILE, async (job) => {
      console.log(`[Worker - ${QUEUE_NAMES.PAYMENTS_RECONCILE}] Starting Job ${job.id}...`);
      return reconcileProcessor(job);
    }),
    {
      connection: connOptions,
      ...prefixOpt,
      autorun,
      concurrency: 2,
    },
  ) : undefined;

  // 7. Payments Expire Orders Processor Worker
  const expireWorker = paymentsEnabled ? new Worker<ExpireOrdersJobData, ExpireOrdersJobResult>(
    QUEUE_NAMES.PAYMENTS_EXPIRE,
    wrapBullMQProcessor(QUEUE_NAMES.PAYMENTS_EXPIRE, async (job) => {
      console.log(`[Worker - ${QUEUE_NAMES.PAYMENTS_EXPIRE}] Starting Job ${job.id}...`);
      return expireOrdersProcessor(job);
    }),
    {
      connection: connOptions,
      ...prefixOpt,
      autorun,
      concurrency: 2,
    },
  ) : undefined;

  // 8. Payments Refund Processor Worker
  const refundWorker = paymentsEnabled ? new Worker<RefundJobData, RefundJobResult>(
    QUEUE_NAMES.PAYMENTS_REFUND,
    wrapBullMQProcessor(QUEUE_NAMES.PAYMENTS_REFUND, async (job) => {
      console.log(`[Worker - ${QUEUE_NAMES.PAYMENTS_REFUND}] Starting Job ${job.id}...`);
      return refundProcessor(job);
    }),
    {
      connection: connOptions,
      ...prefixOpt,
      autorun,
      concurrency: 5,
    },
  ) : undefined;

  // 9. Payments Invoice Outbox Processor Worker
  const invoiceOutboxWorker = paymentsEnabled ? new Worker<InvoiceOutboxJobData, InvoiceOutboxJobResult>(
    QUEUE_NAMES.PAYMENTS_INVOICE_OUTBOX,
    wrapBullMQProcessor(QUEUE_NAMES.PAYMENTS_INVOICE_OUTBOX, async (job) => {
      console.log(`[Worker - ${QUEUE_NAMES.PAYMENTS_INVOICE_OUTBOX}] Starting Job ${job.id}...`);
      return invoiceOutboxProcessor(job);
    }),
    {
      connection: connOptions,
      ...prefixOpt,
      autorun,
      concurrency: 1,
    },
  ) : undefined;

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
  ].flatMap(({ name, instance }) => instance ? [{ name, instance }] : []);

  const isRunning = () => connection.status === 'ready' && workers.every(({ instance }) => instance.isRunning());
  // PING can succeed while Redis refuses Lua scripts or runs in cluster mode (CROSSSLOT).
  const readiness = createWorkerReadiness(isRunning, () =>
    connection.eval(
      "return redis.call('EXISTS', KEYS[1]) + redis.call('EXISTS', KEYS[2])",
      2,
      importQueue.toKey('meta'),
      'worker:readiness:topology_probe',
    ),
  );

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
      readiness.recordWorkerError();
      console.error(`[Worker - ${name}] Unhandled worker error: ${err.message}`);
      captureException(err);
    });
  });

  const close = async () => {
    console.log('[Worker] Shutting down workers and queues...');
    await Promise.allSettled([
      ...workers.map(({ instance }) => instance.close()),
      importQueue.close(),
      inviteQueue.close(),
      pdfQueue.close(),
      broadcastQueue?.close(),
      alertsQueue?.close(),
      reconcileQueue?.close(),
      expireQueue?.close(),
      refundQueue?.close(),
      invoiceOutboxQueue?.close(),
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
    start: () => {
      console.log('[Worker] Active queues:', workers.map(({ name }) => name).join(', '));
      for (const { instance } of workers) {
        void instance.run().catch((error: Error) => instance.emit('error', error));
      }
    },
    waitUntilReady: async () => {
      await Promise.all(workers.map(({ instance }) => instance.waitUntilReady()));
      await connection.ping();
      if (!isTestEnv({ NODE_ENV: env.NODE_ENV, APP_ENV: env.APP_ENV })) {
        await connection.eval(
          "return redis.call('EXISTS', KEYS[1]) + redis.call('EXISTS', KEYS[2])",
          2,
          importQueue.toKey('meta'),
          'worker:readiness:topology_probe',
        );
      }
    },
    isRunning,
    checkReadiness: readiness.check,
    close,
  };
}

export async function scheduleRepeatableJobs(
  { reconcileQueue, expireQueue, invoiceOutboxQueue, broadcastQueue, connection }: Partial<Pick<
    WorkerInstanceRegistry, 'reconcileQueue' | 'expireQueue' | 'invoiceOutboxQueue' | 'broadcastQueue' | 'connection'
  >>,
): Promise<void> {
  const schedules = [
    { queue: reconcileQueue, name: 'reconcile-periodic', every: 10 * 60_000, data: {} },
    { queue: expireQueue, name: 'expire-periodic', every: 60 * 60_000, data: { olderThanHours: 48 } },
    { queue: invoiceOutboxQueue, name: 'outbox-periodic', every: 60_000, data: { batchLimit: 20 } },
    { queue: broadcastQueue, name: 'broadcast-watchdog', every: 15 * 60_000, data: { staleHours: 6 } },
  ];

  const lockKey = 'worker:scheduler-sync:lock';
  const lockToken = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let acquiredLock = false;
  if (connection && connection.status === 'ready') {
    const acquired = await connection.set(lockKey, lockToken, 'EX', 15, 'NX').catch(() => 'ERR');
    if (acquired === null) {
      // Another starting worker replica currently holds the scheduler registration lock.
      return;
    }
    acquiredLock = acquired === 'OK';
  }

  try {
    for (const { queue, name, every, data } of schedules) {
      if (!queue) continue;
      await queue.upsertJobScheduler(name, { every }, { name, data });

      // BullMQ 6 treated the former Queue.add({ repeat }) call as a one-off with this exact job ID.
      const previous = await queue.getJobState(name);
      if (previous === 'waiting' || previous === 'delayed') {
        await queue.remove(name, { removeChildren: false });
      }
    }
  } finally {
    if (acquiredLock && connection && connection.status === 'ready') {
      await connection.eval(
        "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
        1,
        lockKey,
        lockToken,
      ).catch(() => undefined);
    }
  }
}

let activeRegistry: WorkerInstanceRegistry | null = null;

async function main() {
  const env = validateEnv();
  initSentry(env.SENTRY_DSN);
  console.log(`[Worker - BullMQ Mode] Starting worker cluster in ${env.NODE_ENV} mode...`);

  const readyFile = process.env['WORKER_READY_FILE'] || path.join(os.tmpdir(), 'jobsclick-worker-ready');
  fs.rmSync(readyFile, { force: true });

  const registry = startWorkerCluster(env, undefined, false);
  activeRegistry = registry;
  await registry.waitUntilReady();
  console.log(`[Worker - BullMQ Mode] Successfully connected to queues: ${Object.values(QUEUE_NAMES).join(', ')}`);

  if (env.NODE_ENV !== 'test') {
    await scheduleRepeatableJobs(registry);
    console.log('[Worker - BullMQ Mode] Successfully registered repeatable jobs (reconcile: 10m, expire: 1h, outbox: 1m, broadcast-watchdog: 15m)');
  }

  registry.start();

  let shuttingDown = false;
  const heartbeat = async () => {
    const ready = await registry.checkReadiness();
    if (!shuttingDown) {
      if (ready) {
        try {
          fs.writeFileSync(readyFile, String(Date.now()));
        } catch {
          // Non-fatal if container rootfs restricts tmp write; log signal remains authoritative.
        }
      } else {
        fs.rmSync(readyFile, { force: true });
      }
      console.log(ready ? '[Worker Readiness] ready' : '[Worker Readiness] unavailable');
    }
  };
  void heartbeat();
  const readinessTimer = setInterval(() => void heartbeat(), 10_000);

  const shutdown = async () => {
    shuttingDown = true;
    clearInterval(readinessTimer);
    fs.rmSync(readyFile, { force: true });
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
    console.error(`[Worker Startup Error] ${error.message}`);
    captureException(error);
    await activeRegistry?.close();
    process.exit(1);
  });
}
