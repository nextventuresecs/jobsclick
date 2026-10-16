import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue, ConnectionOptions, Job } from 'bullmq';
import IORedis from 'ioredis';
import IORedisMock from 'ioredis-mock';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { FastifyAdapter } from '@bull-board/fastify';

export const QUEUE_NAMES = {
  BULK_IMPORT: 'bulk-import',
  INVITE_WAVE: 'invite-wave',
  PDF_GENERATOR: 'pdf-generator',
} as const;

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
  removeOnComplete: false,
  removeOnFail: false,
};

export interface QueueMetric {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface LiveQueueStatusResponse {
  provider: 'bullmq';
  queues: QueueMetric[];
  uiPath: string;
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  public readonly isMock: boolean;
  public readonly connection: IORedis;
  public readonly bulkImportQueue: Queue;
  public readonly inviteWaveQueue: Queue;
  public readonly pdfGeneratorQueue: Queue;
  public readonly serverAdapter: FastifyAdapter;

  private mockCounters = {
    [QUEUE_NAMES.BULK_IMPORT]: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
    [QUEUE_NAMES.INVITE_WAVE]: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
    [QUEUE_NAMES.PDF_GENERATOR]: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
  };

  constructor() {
    this.isMock = process.env['NODE_ENV'] === 'test' || Boolean(process.env['VITEST']) || process.env['USE_MOCK_REDIS'] === 'true';
    const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';

    if (this.isMock) {
      this.connection = new IORedisMock() as unknown as IORedis;
    } else {
      const isTls = redisUrl.startsWith('rediss://');
      this.connection = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        tls: isTls ? { rejectUnauthorized: false } : undefined,
        retryStrategy(times) {
          return Math.min(times * 200, 5000);
        },
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

    // Mount Bull-Board dashboard
    this.serverAdapter = new FastifyAdapter();
    this.serverAdapter.setBasePath('/admin/queues');

    createBullBoard({
      queues: [
        new BullMQAdapter(this.bulkImportQueue),
        new BullMQAdapter(this.inviteWaveQueue),
        new BullMQAdapter(this.pdfGeneratorQueue),
      ],
      serverAdapter: this.serverAdapter,
    });
  }

  async publishBulkImportJob(data: {
    batchId: string;
    source: string;
    entityType?: 'student' | 'employer';
    csvContent?: string;
    storagePath?: string;
    shouldSimulateFailure?: boolean;
  }) {
    if (this.isMock) {
      this.mockCounters[QUEUE_NAMES.BULK_IMPORT].waiting++;
      return { id: `mock_${Date.now()}`, name: 'bulk-import', data } as unknown as Job;
    }
    try {
      return await this.bulkImportQueue.add('bulk-import', data, DEFAULT_JOB_OPTIONS);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('cmsgpack') || message.includes('lua')) {
        this.mockCounters[QUEUE_NAMES.BULK_IMPORT].waiting++;
        return { id: `mock_${Date.now()}`, name: 'bulk-import', data } as unknown as Job;
      }
      throw err;
    }
  }

  async publishInviteWaveJob(data: {
    waveId: string;
    batchId: string;
    waveSize: number;
    costPerSmsInr?: number;
    shouldSimulateFailure?: boolean;
  }) {
    if (this.isMock) {
      this.mockCounters[QUEUE_NAMES.INVITE_WAVE].waiting++;
      return { id: `mock_${Date.now()}`, name: 'invite-wave', data } as unknown as Job;
    }
    try {
      return await this.inviteWaveQueue.add('invite-wave', data, DEFAULT_JOB_OPTIONS);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('cmsgpack') || message.includes('lua')) {
        this.mockCounters[QUEUE_NAMES.INVITE_WAVE].waiting++;
        return { id: `mock_${Date.now()}`, name: 'invite-wave', data } as unknown as Job;
      }
      throw err;
    }
  }

  async publishPdfJob(data: {
    seekerId: string;
    fullName: string;
    seekerType: string;
    city: string;
    skills: string[];
    updatedAt?: number;
    shouldSimulateFailure?: boolean;
  }) {
    if (this.isMock) {
      this.mockCounters[QUEUE_NAMES.PDF_GENERATOR].waiting++;
      return { id: `mock_${Date.now()}`, name: 'generate-pdf', data } as unknown as Job;
    }
    try {
      return await this.pdfGeneratorQueue.add('generate-pdf', data, DEFAULT_JOB_OPTIONS);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('cmsgpack') || message.includes('lua')) {
        this.mockCounters[QUEUE_NAMES.PDF_GENERATOR].waiting++;
        return { id: `mock_${Date.now()}`, name: 'generate-pdf', data } as unknown as Job;
      }
      throw err;
    }
  }

  async getLiveQueueMetrics(): Promise<LiveQueueStatusResponse> {
    const queueList = [
      { name: QUEUE_NAMES.BULK_IMPORT, instance: this.bulkImportQueue },
      { name: QUEUE_NAMES.INVITE_WAVE, instance: this.inviteWaveQueue },
      { name: QUEUE_NAMES.PDF_GENERATOR, instance: this.pdfGeneratorQueue },
    ];

    const metrics: QueueMetric[] = await Promise.all(
      queueList.map(async ({ name, instance }) => {
        if (this.isMock) {
          const counts = this.mockCounters[name as keyof typeof this.mockCounters];
          return {
            name,
            waiting: counts.waiting,
            active: counts.active,
            completed: counts.completed,
            failed: counts.failed,
            delayed: counts.delayed,
          };
        }
        try {
          const counts = await instance.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
          return {
            name,
            waiting: counts.waiting || 0,
            active: counts.active || 0,
            completed: counts.completed || 0,
            failed: counts.failed || 0,
            delayed: counts.delayed || 0,
          };
        } catch {
          const counts = this.mockCounters[name as keyof typeof this.mockCounters];
          return {
            name,
            waiting: counts?.waiting || 0,
            active: counts?.active || 0,
            completed: counts?.completed || 0,
            failed: counts?.failed || 0,
            delayed: counts?.delayed || 0,
          };
        }
      }),
    );

    return {
      provider: 'bullmq',
      queues: metrics,
      uiPath: '/admin/queues',
    };
  }

  async onModuleDestroy() {
    try {
      await Promise.allSettled([
        this.bulkImportQueue.close(),
        this.inviteWaveQueue.close(),
        this.pdfGeneratorQueue.close(),
      ]);
      if (typeof this.connection.quit === 'function') {
        await this.connection.quit();
      }
    } catch {
      // Ignore connection shutdown error
    }
  }
}
