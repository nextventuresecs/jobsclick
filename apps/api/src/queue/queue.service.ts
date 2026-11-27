import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Queue, ConnectionOptions, Job, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import {
  QUEUE_NAMES,
  DEFAULT_BULLMQ_RETRY_OPTIONS,
  PAYMENTS_BULLMQ_JOB_OPTIONS,
} from '@indian-job-portal/validation';
import { getTracePropagationHeaders } from '../config/sentry.js';
import { isStrictEnv } from '../config/env.js';

export { QUEUE_NAMES };
export const DEFAULT_JOB_OPTIONS = DEFAULT_BULLMQ_RETRY_OPTIONS;

const DEFAULT_QUEUE_PUBLISH_TIMEOUT_MS = 3000;
const DEFAULT_QUEUE_CONNECT_WAIT_MS = 1500;

export interface QueueMetric {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  status?: 'healthy' | 'unavailable';
  error?: string;
}

export interface LiveQueueStatusResponse {
  provider: 'bullmq';
  status: 'healthy' | 'degraded' | 'unavailable';
  queues: QueueMetric[];
  uiPath: string;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  public readonly isMock: boolean;
  public readonly connection: IORedis;
  public readonly bulkImportQueue: Queue;
  public readonly inviteWaveQueue: Queue;
  public readonly pdfGeneratorQueue: Queue;
  public readonly broadcastQueue: Queue;
  public readonly alertsQueue: Queue;
  public readonly reconcileQueue?: Queue;
  public readonly expireQueue?: Queue;
  public readonly refundQueue?: Queue;
  public readonly invoiceOutboxQueue?: Queue;
  private readonly managedQueues: Array<{ name: string; instance: Queue }>;
  public readonly serverAdapter: FastifyAdapter;

  private mockCounters: Record<string, { waiting: number; active: number; completed: number; failed: number; delayed: number }> = {
    [QUEUE_NAMES.BULK_IMPORT]: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
    [QUEUE_NAMES.INVITE_WAVE]: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
    [QUEUE_NAMES.PDF_GENERATOR]: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
    [QUEUE_NAMES.BROADCAST]: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
    [QUEUE_NAMES.ALERTS]: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
  };

  private incrementMockWaiting(queueName: string): void {
    const entry = this.mockCounters[queueName];
    if (entry) {
      entry.waiting += 1;
    } else {
      this.mockCounters[queueName] = { waiting: 1, active: 0, completed: 0, failed: 0, delayed: 0 };
    }
  }

  constructor() {
    if (isStrictEnv()) {
      if (process.env['USE_MOCK_REDIS'] === '1' || process.env['USE_MOCK_REDIS'] === 'true' || Boolean(process.env['VITEST'])) {
        throw new Error('Mock Redis and test runners are strictly forbidden in strict/production environments');
      }
      this.isMock = false;
    } else {
      this.isMock = process.env['NODE_ENV'] === 'test' || Boolean(process.env['VITEST']) || process.env['USE_MOCK_REDIS'] === 'true';
    }
    const redisUrl = process.env['REDIS_URL_BULLMQ'] || process.env['REDIS_URL'] || 'redis://localhost:6379';

    if (this.isMock) {
      const IORedisMock = require('ioredis-mock') as typeof IORedis;
      this.connection = new IORedisMock() as unknown as IORedis;
    } else {
      const isTls = redisUrl.startsWith('rediss://');
      this.connection = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        tls: isTls ? {} : undefined,
        retryStrategy(times) {
          return Math.min(times * 200, 5000);
        },
      });

      // Attach error handler to prevent unhandled EventEmitter error events from crashing Node
      this.connection.on('error', (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[QueueService] Redis connection warning:', msg);
      });
    }

    const connOptions = this.connection as unknown as ConnectionOptions;

    this.bulkImportQueue = new Queue(QUEUE_NAMES.BULK_IMPORT, {
      connection: connOptions,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });

    this.inviteWaveQueue = new Queue(QUEUE_NAMES.INVITE_WAVE, {
      connection: connOptions,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });

    this.pdfGeneratorQueue = new Queue(QUEUE_NAMES.PDF_GENERATOR, {
      connection: connOptions,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });

    this.broadcastQueue = new Queue(QUEUE_NAMES.BROADCAST, {
      connection: connOptions,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });

    this.alertsQueue = new Queue(QUEUE_NAMES.ALERTS, {
      connection: connOptions,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });

    this.managedQueues = [
      { name: QUEUE_NAMES.BULK_IMPORT, instance: this.bulkImportQueue },
      { name: QUEUE_NAMES.INVITE_WAVE, instance: this.inviteWaveQueue },
      { name: QUEUE_NAMES.PDF_GENERATOR, instance: this.pdfGeneratorQueue },
      { name: QUEUE_NAMES.BROADCAST, instance: this.broadcastQueue },
      { name: QUEUE_NAMES.ALERTS, instance: this.alertsQueue },
    ];

    if (process.env['ENABLE_P2_PAYMENTS'] === 'true') {
      this.reconcileQueue = new Queue(QUEUE_NAMES.PAYMENTS_RECONCILE, {
        connection: connOptions,
        defaultJobOptions: PAYMENTS_BULLMQ_JOB_OPTIONS,
      });
      this.expireQueue = new Queue(QUEUE_NAMES.PAYMENTS_EXPIRE, {
        connection: connOptions,
        defaultJobOptions: PAYMENTS_BULLMQ_JOB_OPTIONS,
      });
      this.refundQueue = new Queue(QUEUE_NAMES.PAYMENTS_REFUND, {
        connection: connOptions,
        defaultJobOptions: PAYMENTS_BULLMQ_JOB_OPTIONS,
      });
      this.invoiceOutboxQueue = new Queue(QUEUE_NAMES.PAYMENTS_INVOICE_OUTBOX, {
        connection: connOptions,
        defaultJobOptions: PAYMENTS_BULLMQ_JOB_OPTIONS,
      });
      this.managedQueues.push(
        { name: QUEUE_NAMES.PAYMENTS_RECONCILE, instance: this.reconcileQueue },
        { name: QUEUE_NAMES.PAYMENTS_EXPIRE, instance: this.expireQueue },
        { name: QUEUE_NAMES.PAYMENTS_REFUND, instance: this.refundQueue },
        { name: QUEUE_NAMES.PAYMENTS_INVOICE_OUTBOX, instance: this.invoiceOutboxQueue },
      );
      this.mockCounters[QUEUE_NAMES.PAYMENTS_RECONCILE] = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
      this.mockCounters[QUEUE_NAMES.PAYMENTS_EXPIRE] = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
      this.mockCounters[QUEUE_NAMES.PAYMENTS_REFUND] = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
      this.mockCounters[QUEUE_NAMES.PAYMENTS_INVOICE_OUTBOX] = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
    }

    // Guard BullMQ queues against unhandled EventEmitter errors during startup
    this.managedQueues.forEach(({ instance: q }) => {
      q.on('error', (err: Error) => {
        console.warn(`[QueueService] ${q.name} queue connection warning: ${err.message}`);
      });
    });

    // Mount Bull-Board dashboard
    this.serverAdapter = new FastifyAdapter();
    this.serverAdapter.setBasePath('/admin/queues/ui');

    /* eslint-disable @typescript-eslint/no-explicit-any */
    createBullBoard({
      queues: this.managedQueues.map(({ instance }) => new BullMQAdapter(instance) as any),
      serverAdapter: this.serverAdapter,
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  private enrichJobData<T extends Record<string, unknown>>(data: T): T & {
    _traceContext?: { sentryTrace?: string; baggage?: string; traceId?: string };
  } {
    const traceHeaders = getTracePropagationHeaders();
    if (traceHeaders.sentryTrace || traceHeaders.traceId) {
      return {
        ...data,
        _traceContext: traceHeaders,
      };
    }
    return data;
  }

  private async ensureConnectionReady(timeoutMs = DEFAULT_QUEUE_CONNECT_WAIT_MS): Promise<void> {
    const status = (this.connection as { status?: string }).status;
    if (typeof status !== 'string' || status === 'ready') {
      return;
    }
    if (status === 'end') {
      throw new Error('Redis connection closed');
    }
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const onReady = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.connection.off?.('end', onEnd);
        resolve();
      };
      const onEnd = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.connection.off?.('ready', onReady);
        reject(new Error('Redis connection ended'));
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.connection.off?.('ready', onReady);
        this.connection.off?.('end', onEnd);
        reject(new Error(`Redis not ready within ${timeoutMs}ms (status: ${status})`));
      }, timeoutMs);
      this.connection.once?.('ready', onReady);
      this.connection.once?.('end', onEnd);
    });
  }

  private async enqueue(queue: Queue, name: string, data: object, options: JobsOptions = DEFAULT_JOB_OPTIONS): Promise<Job> {
    const publishTimeoutMs = Number(process.env['QUEUE_PUBLISH_TIMEOUT_MS']) || DEFAULT_QUEUE_PUBLISH_TIMEOUT_MS;
    try {
      await this.ensureConnectionReady();
      return await withTimeout(
        queue.add(name, data, options),
        publishTimeoutMs,
        `BullMQ publish timeout after ${publishTimeoutMs}ms`,
      );
    } catch {
      this.logger.error(`BullMQ did not acknowledge publication to ${queue.name}`);
      throw new ServiceUnavailableException({ code: 'QUEUE_UNAVAILABLE' });
    }
  }

  async publishBulkImportJob(data: {
    batchId: string;
    source: string;
    entityType?: 'student' | 'employer';
    csvContent?: string;
    storagePath?: string;
    shouldSimulateFailure?: boolean;
    institutionId?: string | null;
    _traceContext?: { sentryTrace?: string; baggage?: string; traceId?: string };
  }) {
    const jobData = this.enrichJobData(data);
    if (this.isMock) {
      this.incrementMockWaiting(QUEUE_NAMES.BULK_IMPORT);
      return { id: randomUUID(), name: 'bulk-import', data: jobData } as unknown as Job;
    }
    return this.enqueue(this.bulkImportQueue, 'bulk-import', jobData);
  }

  async publishInviteWaveJob(data: {
    waveId: string;
    batchId: string;
    waveSize: number;
    costPerSmsInr?: number;
    shouldSimulateFailure?: boolean;
    _traceContext?: { sentryTrace?: string; baggage?: string; traceId?: string };
  }) {
    const jobData = this.enrichJobData(data);
    const uniqueJobId = `wave-${data.waveId}-${randomUUID()}`;
    if (this.isMock) {
      this.incrementMockWaiting(QUEUE_NAMES.INVITE_WAVE);
      return { id: uniqueJobId, name: 'invite-wave', data: jobData } as unknown as Job;
    }
    return this.enqueue(this.inviteWaveQueue, 'invite-wave', jobData, {
      ...DEFAULT_JOB_OPTIONS,
      jobId: uniqueJobId,
    });
  }

  async publishPdfJob(data: {
    seekerId: string;
    fullName: string;
    seekerType: string;
    city: string;
    skills: string[];
    updatedAt?: number;
    shouldSimulateFailure?: boolean;
    _traceContext?: { sentryTrace?: string; baggage?: string; traceId?: string };
  }) {
    const jobData = this.enrichJobData(data);
    if (this.isMock) {
      this.incrementMockWaiting(QUEUE_NAMES.PDF_GENERATOR);
      return { id: randomUUID(), name: 'generate-pdf', data: jobData } as unknown as Job;
    }
    return this.enqueue(this.pdfGeneratorQueue, 'generate-pdf', jobData, {
      ...DEFAULT_JOB_OPTIONS,
      // All requests for a seeker write the same private object. BullMQ releases this key at terminal state.
      deduplication: { id: `resume-${data.seekerId}` },
    });
  }

  async publishBroadcastJob(data: {
    campaignId: string;
    batchIndex: number;
    totalBatches: number;
    recipients: Array<{
      businessProfileId: string;
      phone: string;
      idempotencyKey: string;
    }>;
    templateId: string;
    variables: Record<string, string>;
    shouldSimulateFailure?: boolean;
    _traceContext?: { sentryTrace?: string; baggage?: string; traceId?: string };
  }) {
    const jobData = this.enrichJobData(data);
    if (this.isMock) {
      this.incrementMockWaiting(QUEUE_NAMES.BROADCAST);
      return { id: randomUUID(), name: 'broadcast-batch', data: jobData } as unknown as Job;
    }
    return this.enqueue(this.broadcastQueue, 'broadcast-batch', jobData);
  }

  async publishAlertsJob(data: {
    timeframeHours?: number;
    candidateId?: string;
    _traceContext?: { sentryTrace?: string; baggage?: string; traceId?: string };
  }): Promise<Job> {
    const jobName = `search-alerts-${randomUUID()}`;
    const jobData = this.enrichJobData(data);
    if (this.isMock) {
      this.incrementMockWaiting(QUEUE_NAMES.ALERTS);
      return { id: jobName, name: jobName, data: jobData } as unknown as Job;
    }
    return this.enqueue(this.alertsQueue, jobName, jobData);
  }

  async checkReadiness(): Promise<{ ok: boolean; mode: 'mock' | 'redis'; reason?: string }> {
    if (this.isMock) {
      return { ok: true, mode: 'mock' };
    }
    const status = (this.connection as { status?: string }).status;
    if (typeof status === 'string' && status !== 'ready') {
      return { ok: false, mode: 'redis', reason: `REDIS_STATUS_${status.toUpperCase()}` };
    }
    try {
      await withTimeout(
        this.connection.eval(
          "return redis.call('EXISTS', KEYS[1])",
          1,
          this.bulkImportQueue.toKey('meta'),
        ),
        2000,
        'QUEUE_REDIS_PROBE_TIMEOUT',
      );
      return { ok: true, mode: 'redis' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('CROSSSLOT') || msg.includes('CLUSTER')) {
        return { ok: false, mode: 'redis', reason: 'REDIS_CLUSTER_UNSUPPORTED' };
      }
      if (msg.includes('TIMEOUT')) {
        return { ok: false, mode: 'redis', reason: 'REDIS_TIMEOUT' };
      }
      return { ok: false, mode: 'redis', reason: 'REDIS_UNAVAILABLE' };
    }
  }

  async getLiveQueueMetrics(): Promise<LiveQueueStatusResponse> {
    const metrics: QueueMetric[] = await Promise.all(
      this.managedQueues.map(async ({ name, instance }) => {
        if (this.isMock) {
          const counts = this.mockCounters[name] ?? { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
          return {
            name,
            waiting: counts.waiting,
            active: counts.active,
            completed: counts.completed,
            failed: counts.failed,
            delayed: counts.delayed,
            status: 'healthy',
          };
        }
        try {
          const counts = await withTimeout(
            instance.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
            2000,
            'QUEUE_METRICS_TIMEOUT',
          );
          return {
            name,
            waiting: counts.waiting || 0,
            active: counts.active || 0,
            completed: counts.completed || 0,
            failed: counts.failed || 0,
            delayed: counts.delayed || 0,
            status: 'healthy',
          };
        } catch {
          return {
            name,
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
            delayed: 0,
            status: 'unavailable',
            error: 'REDIS_UNAVAILABLE',
          };
        }
      }),
    );

    const unavailableCount = metrics.filter((m) => m.status === 'unavailable').length;
    const status: LiveQueueStatusResponse['status'] =
      unavailableCount === 0
        ? 'healthy'
        : unavailableCount === metrics.length
          ? 'unavailable'
          : 'degraded';

    return {
      provider: 'bullmq',
      status,
      queues: metrics,
      uiPath: '/admin/queues/ui',
    };
  }

  async onModuleDestroy() {
    try {
      await Promise.allSettled(this.managedQueues.map(({ instance }) => instance.close()));
      if (typeof this.connection.quit === 'function') {
        await withTimeout(this.connection.quit(), 1000, 'QUEUE_REDIS_QUIT_TIMEOUT').catch(() => undefined);
      }
    } catch {
      // Ignore connection shutdown error
    }
  }
}
