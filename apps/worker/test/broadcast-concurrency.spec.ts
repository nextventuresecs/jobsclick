import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import IORedisMock from 'ioredis-mock';
import type IORedis from 'ioredis';
import { BroadcastProcessor, BroadcastBatchJobData } from '../src/processors/broadcast.processor.js';
import type { Job } from 'bullmq';

/**
 * Simulates a legacy N-1 Worker instance running in an old pod during a rolling update.
 * Crucially, N-1 lacks the distributed Redis set deduplication check, but obeys
 * the database transactional unique invariant barrier.
 */
class LegacyWorkerNMinus1 {
  private dbClaims: Set<string>;
  public executedSideEffects: string[] = [];

  constructor(sharedDbClaims: Set<string>) {
    this.dbClaims = sharedDbClaims;
  }

  async process(jobData: BroadcastBatchJobData) {
    for (const recipient of jobData.recipients) {
      // Simulates DB unique constraint on idempotency_key
      if (this.dbClaims.has(recipient.idempotencyKey)) {
        // Skipped at DB transaction boundary
        continue;
      }
      this.dbClaims.add(recipient.idempotencyKey);
      this.executedSideEffects.push(recipient.idempotencyKey);
    }
  }
}

describe('Mixed Cluster (N vs N-1) Dual-Worker Rolling Deployment Invariance', () => {
  let mockRedis: IORedis;
  let sharedDbClaims: Set<string>;

  beforeEach(() => {
    mockRedis = new (IORedisMock as unknown as typeof IORedis)() as IORedis;
    sharedDbClaims = new Set<string>();
  });

  afterEach(async () => {
    await mockRedis.flushall();
  });

  it('guarantees 0 duplicate deliveries when N and N-1 workers consume identical batches concurrently under load', async () => {
    const executedDispatchesN: string[] = [];
    const legacyWorker = new LegacyWorkerNMinus1(sharedDbClaims);

    // Mock Supabase client providing DB-level atomic uniqueness simulation
    const mockSupabase = {
      from: (_table: string) => ({
        select: () => ({
          eq: (_col: string, val: string) => ({
            maybeSingle: async () => {
              if (sharedDbClaims.has(val)) {
                return { data: { id: `del_${val}`, status: 'sent' }, error: null };
              }
              return { data: null, error: null };
            },
          }),
        }),
        upsert: async (record: { idempotency_key: string; status: string }) => {
          if (record.status === 'sent') {
            sharedDbClaims.add(record.idempotency_key);
            executedDispatchesN.push(record.idempotency_key);
          }
          return { data: record, error: null };
        },
        update: () => ({
          eq: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    } as unknown as import('@supabase/supabase-js').SupabaseClient;

    const newWorker = new BroadcastProcessor(mockRedis, mockSupabase);

    // 100 synthetic recipients delivered across overlapping/retried jobs
    const recipients = Array.from({ length: 100 }, (_, i) => ({
      businessProfileId: `biz_prof_${i}`,
      phone: `987654${(1000 + i).toString()}`,
      idempotencyKey: `idemp_shared_token_${i}`,
    }));

    // Split recipients into overlapping batches simulating duplicate BullMQ delivery
    const batchDataLegacy: BroadcastBatchJobData = {
      campaignId: 'camp_rolling_test_01',
      batchIndex: 0,
      totalBatches: 2,
      recipients,
      templateId: 'DLT_MSME_NOTICE_EN',
      variables: { notice: 'Cluster Alert' },
    };

    const batchDataNew: BroadcastBatchJobData = {
      version: 2,
      campaignId: 'camp_rolling_test_01',
      batchIndex: 0,
      totalBatches: 2,
      targetDistricts: ['Bhopal', 'Indore'],
      batchSize: 100,
      recipients,
      templateId: 'DLT_MSME_NOTICE_EN',
      variables: { notice: 'Cluster Alert' },
    };

    const mockJobN = {
      id: 'job_bullmq_new_pod_1',
      data: batchDataNew,
      attemptsMade: 0,
      updateProgress: async () => {},
    } as unknown as Job<BroadcastBatchJobData>;

    // Interleave execution concurrently: both N-1 and N workers process the jobs simultaneously
    const [resultNew] = await Promise.all([
      newWorker.process(mockJobN),
      legacyWorker.process(batchDataLegacy),
    ]);

    // Combine all executed dispatches across both pods
    const allDispatches = [...legacyWorker.executedSideEffects, ...executedDispatchesN];

    // Assert absolute uniqueness: exactly 100 dispatches, 0 duplicates
    const uniqueDispatches = new Set(allDispatches);
    expect(allDispatches.length).toBe(100);
    expect(uniqueDispatches.size).toBe(100);

    // Assert that the new worker reported completed status and processed count accurately
    expect(resultNew.status).toBe('completed');
    expect(resultNew.processedCount).toBe(100);
  });

  it('gracefully handles payload schema evolution (N version 2 and N-1 legacy unversioned payloads)', async () => {
    const worker = new BroadcastProcessor(mockRedis);

    const legacyPayload: BroadcastBatchJobData = {
      campaignId: 'camp_legacy_v1',
      batchIndex: 0,
      totalBatches: 1,
      recipients: [
        { businessProfileId: 'b1', phone: '9876543210', idempotencyKey: 'idemp_v1_01' },
      ],
      templateId: 'DLT_NOTICE',
      variables: {},
    };

    const newPayload: BroadcastBatchJobData = {
      version: 2,
      campaignId: 'camp_new_v2',
      batchIndex: 0,
      totalBatches: 1,
      targetDistricts: ['Gwalior'],
      recipients: [
        { businessProfileId: 'b2', phone: '9876543211', idempotencyKey: 'idemp_v2_01' },
      ],
      templateId: 'DLT_NOTICE',
      variables: {},
    };

    const res1 = await worker.process({ id: 'j1', data: legacyPayload, attemptsMade: 0, updateProgress: async () => {} } as unknown as Job<BroadcastBatchJobData>);
    const res2 = await worker.process({ id: 'j2', data: newPayload, attemptsMade: 0, updateProgress: async () => {} } as unknown as Job<BroadcastBatchJobData>);

    expect(res1.status).toBe('completed');
    expect(res1.sentCount).toBe(1);
    expect(res2.status).toBe('completed');
    expect(res2.sentCount).toBe(1);
  });
});
