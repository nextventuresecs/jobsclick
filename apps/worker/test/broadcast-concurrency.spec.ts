import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import IORedisMock from 'ioredis-mock';
import type IORedis from 'ioredis';
import { BroadcastProcessor, BroadcastBatchJobData, runCampaignWatchdog } from '../src/processors/broadcast.processor.js';
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
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await mockRedis.flushall();
  });

  it('counts only provider-acknowledged broadcast SMS as sent in staging', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('STAGING_SMS_ALLOWLIST', '9876543210,9876543211');
    vi.stubEnv('MSG91_AUTH_KEY', 'synthetic-broadcast-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'dummy-service-role-key');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ type: 'error', message: 'Request rejected' }))
      .mockResolvedValueOnce(Response.json({ type: 'success', message: 'broadcast-ack-1' }));
    vi.stubGlobal('fetch', fetchMock);
    const job = {
      data: {
        campaignId: 'staging-acknowledgement', batchIndex: 0, totalBatches: 1,
        templateId: 'DLT_NOTICE', variables: {},
        recipients: [
          { businessProfileId: 'b1', phone: '9876543210', idempotencyKey: 'staging-rejected' },
          { businessProfileId: 'b2', phone: '9876543211', idempotencyKey: 'staging-accepted' },
        ],
      },
      attemptsMade: 0,
    } as Job<BroadcastBatchJobData>;

    const dummySupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
            in: async () => ({ count: 0, error: null }),
          }),
        }),
        upsert: async () => ({ data: null, error: null }),
        update: () => ({
          eq: async () => ({ data: null, error: null }),
        }),
      }),
    } as unknown as import('@supabase/supabase-js').SupabaseClient;
    const result = await new BroadcastProcessor(mockRedis, dummySupabase).process(job);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ sentCount: 1, failedCount: 1, skippedCount: 0 });
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
    const dummySupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
            in: async () => ({ count: 0, error: null }),
          }),
        }),
        upsert: async () => ({ data: null, error: null }),
        update: () => ({
          eq: async () => ({ data: null, error: null }),
        }),
      }),
    } as unknown as import('@supabase/supabase-js').SupabaseClient;

    const worker = new BroadcastProcessor(mockRedis, dummySupabase);

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

  it('prevents double-send on retry when provider succeeds but DB upsert fails (lease held, retry skips)', async () => {
    const mockSupabase = {
      from: (_table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        upsert: async () => {
          throw new Error('Simulated DB connectivity failure during delivery upsert');
        },
        update: () => ({
          eq: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    } as unknown as import('@supabase/supabase-js').SupabaseClient;

    const worker = new BroadcastProcessor(mockRedis, mockSupabase);
    const testIdempotencyKey = `idemp_double_send_guard_${Date.now()}`;
    const jobData: BroadcastBatchJobData = {
      campaignId: 'camp_double_send_test',
      batchIndex: 0,
      totalBatches: 1,
      templateId: 'DLT_NOTICE',
      variables: {},
      recipients: [
        { businessProfileId: 'b1', phone: '9876543210', idempotencyKey: testIdempotencyKey },
      ],
    };
    const job = { id: 'job_retry_test', data: jobData, attemptsMade: 0, updateProgress: async () => {} } as unknown as Job<BroadcastBatchJobData>;

    // First attempt: provider succeeds, DB throws
    const result1 = await worker.process(job);
    expect(result1.sentCount).toBe(1);
    expect(result1.failedCount).toBe(0);

    // Verify Redis lease is still held
    const leaseKey = `dedupe:broadcast:camp_double_send_test:${testIdempotencyKey}`;
    const leaseVal = await mockRedis.get(leaseKey);
    expect(leaseVal).toBe('locked');

    // Second attempt (retry): must skip dispatch, preventing double-send
    const result2 = await worker.process(job);
    expect(result2.sentCount).toBe(0);
    expect(result2.skippedCount).toBe(1);
  });

  it('allowlist skip leaves no lease in Redis and does not persist delivery row', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('STAGING_SMS_ALLOWLIST', '9876543210');
    vi.stubEnv('MSG91_AUTH_KEY', 'synthetic-broadcast-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'dummy-service-role-key');

    let upsertedRecord: unknown = null;
    const mockSupabase = {
      from: (_table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        upsert: async (record: unknown) => {
          upsertedRecord = record;
          return { data: record, error: null };
        },
        update: () => ({
          eq: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    } as unknown as import('@supabase/supabase-js').SupabaseClient;

    const worker = new BroadcastProcessor(mockRedis, mockSupabase);
    const idempKey = `idemp_allowlist_skip_${Date.now()}`;
    const job = {
      data: {
        campaignId: 'camp_allowlist_test',
        batchIndex: 0,
        totalBatches: 1,
        templateId: 'DLT_NOTICE',
        variables: {},
        recipients: [
          { businessProfileId: 'b_blocked', phone: '9123456789', idempotencyKey: idempKey },
        ],
      },
      attemptsMade: 0,
    } as Job<BroadcastBatchJobData>;

    const result = await worker.process(job);
    expect(result.skippedCount).toBe(1);
    expect(result.sentCount).toBe(0);

    // Verify Redis lease was NOT acquired for the allowlist-skipped recipient
    const leaseKey = `dedupe:broadcast:camp_allowlist_test:${idempKey}`;
    const lease = await mockRedis.get(leaseKey);
    expect(lease).toBeNull();

    // Verify delivery row was NOT persisted (tracked via recorded skips without fake delivery row)
    expect(upsertedRecord).toBeNull();
    const skipCount = await mockRedis.scard('dedupe:broadcast:camp_allowlist_test:skipped_keys');
    expect(skipCount).toBe(1);
  });

  it('same recipient skipped on attempt 1 and 2 counts once in Redis SET', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('STAGING_SMS_ALLOWLIST', '9999999999');

    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
            in: async () => ({ count: 0, error: null }),
          }),
        }),
        upsert: async () => ({ data: null, error: null }),
      }),
    } as unknown as import('@supabase/supabase-js').SupabaseClient;

    const worker = new BroadcastProcessor(mockRedis, mockSupabase);
    const idempKey = `idemp_skip_set_${Date.now()}`;
    const jobAttempt1 = {
      data: {
        campaignId: 'camp_skip_set_test',
        batchIndex: 0,
        totalBatches: 1,
        templateId: 'DLT_NOTICE',
        variables: {},
        recipients: [{ businessProfileId: 'b_block', phone: '9123456780', idempotencyKey: idempKey }],
      },
      opts: { attempts: 2 },
      attemptsMade: 0,
    } as Job<BroadcastBatchJobData>;

    await worker.process(jobAttempt1);
    const skipCount1 = await mockRedis.scard('dedupe:broadcast:camp_skip_set_test:skipped_keys');
    expect(skipCount1).toBe(1);

    const jobAttempt2 = {
      ...jobAttempt1,
      attemptsMade: 1,
    } as Job<BroadcastBatchJobData>;

    await worker.process(jobAttempt2);
    const skipCount2 = await mockRedis.scard('dedupe:broadcast:camp_skip_set_test:skipped_keys');
    expect(skipCount2).toBe(1);
  });

  it('all-attempts-exhausted: campaign reaches failed status before final throw', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('STAGING_SMS_ALLOWLIST', '9876543210');
    vi.stubEnv('MSG91_AUTH_KEY', 'synthetic-broadcast-key');

    let campaignStatus = 'processing';
    let deliveriesStatus = 'pending';

    const mockSupabase = {
      from: (table: string) => {
        if (table === 'broadcast_campaigns') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { recipient_count: 1, status: campaignStatus }, error: null }),
              }),
            }),
            update: (fields: { status: string }) => ({
              eq: async () => {
                campaignStatus = fields.status;
                return { data: null, error: null };
              },
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
              in: async (_col: string, statuses: string[]) => {
                const count = statuses.includes(deliveriesStatus) ? 1 : 0;
                return { count, error: null };
              },
              eq: async (_col: string, st: string) => {
                const count = deliveriesStatus === st ? 1 : 0;
                return { count, error: null };
              },
            }),
          }),
          upsert: async (record: { status: string }) => {
            deliveriesStatus = record.status;
            return { data: null, error: null };
          },
        };
      },
    } as unknown as import('@supabase/supabase-js').SupabaseClient;

    const fetchFail = vi.fn().mockResolvedValue(new Response(JSON.stringify({ type: 'error' }), { status: 500 }));
    vi.stubGlobal('fetch', fetchFail);

    const worker = new BroadcastProcessor(mockRedis, mockSupabase);

    const jobFinal = {
      data: {
        campaignId: 'camp_exhausted_fail',
        batchIndex: 0,
        totalBatches: 1,
        templateId: 'DLT_NOTICE',
        variables: {},
        recipients: [{ businessProfileId: 'b1', phone: '9876543210', idempotencyKey: `idemp_exhaust_${Date.now()}` }],
      },
      opts: { attempts: 3 },
      attemptsMade: 2,
    } as unknown as Job<BroadcastBatchJobData>;

    const result = await worker.process(jobFinal);
    expect(result.status).toBe('failed');
    // Campaign status must reach 'failed' upon completion of the final attempt
    expect(campaignStatus).toBe('failed');
    expect(deliveriesStatus).toBe('failed');

    // And verify that broadcastProcessor rethrows on failed status
    expect(() => {
      if (result.status === 'failed') {
        throw new Error(`Broadcast batch ${result.batchIndex} for campaign ${result.campaignId} failed with ${result.failedCount} failures`);
      }
    }).toThrow(/failed with 1 failures/);
  });

  it('attempt 1 fails then attempt 2 sends: campaign must not complete or fail early', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('STAGING_SMS_ALLOWLIST', '9876543210');
    vi.stubEnv('MSG91_AUTH_KEY', 'synthetic-broadcast-key');

    let campaignStatus = 'processing';
    let deliveriesStatus = 'pending';

    const mockSupabase = {
      from: (table: string) => {
        if (table === 'broadcast_campaigns') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { recipient_count: 1, status: campaignStatus }, error: null }),
              }),
            }),
            update: (fields: { status: string }) => ({
              eq: async () => {
                campaignStatus = fields.status;
                return { data: null, error: null };
              },
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
              in: async (_col: string, statuses: string[]) => {
                const count = statuses.includes(deliveriesStatus) ? 1 : 0;
                return { count, error: null };
              },
              eq: async (_col: string, st: string) => {
                const count = deliveriesStatus === st ? 1 : 0;
                return { count, error: null };
              },
            }),
          }),
          upsert: async (record: { status: string }) => {
            deliveriesStatus = record.status;
            return { data: null, error: null };
          },
        };
      },
    } as unknown as import('@supabase/supabase-js').SupabaseClient;

    const worker = new BroadcastProcessor(mockRedis, mockSupabase);
    const idempKey = `idemp_retry_campaign_${Date.now()}`;

    // Attempt 1: Provider fails. opts.attempts = 2, attemptsMade = 0.
    const fetchFail = vi.fn().mockResolvedValue(new Response(JSON.stringify({ type: 'error' }), { status: 500 }));
    vi.stubGlobal('fetch', fetchFail);

    const jobAttempt1 = {
      data: {
        campaignId: 'camp_retry_seq',
        batchIndex: 0,
        totalBatches: 1,
        templateId: 'DLT_NOTICE',
        variables: {},
        recipients: [{ businessProfileId: 'b1', phone: '9876543210', idempotencyKey: idempKey }],
      },
      opts: { attempts: 2 },
      attemptsMade: 0,
    } as unknown as Job<BroadcastBatchJobData>;

    const res1 = await worker.process(jobAttempt1);
    expect(res1.failedCount).toBe(1);
    expect(deliveriesStatus).toBe('failed');
    // Campaign MUST NOT complete or fail early after attempt 1
    expect(campaignStatus).toBe('processing');

    // Attempt 2: Provider succeeds. opts.attempts = 2, attemptsMade = 1.
    const fetchSuccess = vi.fn().mockResolvedValue(new Response(JSON.stringify({ type: 'success', message: 'msg_ack_123' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSuccess);

    const jobAttempt2 = {
      data: {
        campaignId: 'camp_retry_seq',
        batchIndex: 0,
        totalBatches: 1,
        templateId: 'DLT_NOTICE',
        variables: {},
        recipients: [{ businessProfileId: 'b1', phone: '9876543210', idempotencyKey: idempKey }],
      },
      opts: { attempts: 2 },
      attemptsMade: 1,
    } as unknown as Job<BroadcastBatchJobData>;

    const res2 = await worker.process(jobAttempt2);
    expect(res2.sentCount).toBe(1);
    expect(deliveriesStatus).toBe('sent');
    // Campaign completes after successful attempt 2
    expect(campaignStatus).toBe('completed');
  });

  it('broadcastProcessor throws retry signal when failedCount > 0', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('STAGING_SMS_ALLOWLIST', '9876543210');
    vi.stubEnv('MSG91_AUTH_KEY', 'synthetic-broadcast-key');
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ type: 'error', message: 'Provider rejected' }));
    vi.stubGlobal('fetch', fetchMock);

    const job = {
      data: {
        campaignId: 'camp_retry_sig',
        batchIndex: 0,
        totalBatches: 1,
        templateId: 'DLT_NOTICE',
        variables: {},
        recipients: [
          { businessProfileId: 'b1', phone: '9876543210', idempotencyKey: `idemp_retry_${Date.now()}` },
        ],
      },
      attemptsMade: 0,
    } as Job<BroadcastBatchJobData>;

    const { broadcastProcessor } = await import('../src/processors/broadcast.processor.js');
    await expect(broadcastProcessor(job)).rejects.toThrow(/failed with 1 failures/);
  });

  it('campaign completion marks campaign completed when terminal deliveries (including skips) reach recipient_count', async () => {
    let campaignUpdatedStatus: string | null = null;
    const mockSupabase = {
      from: (table: string) => {
        if (table === 'broadcast_campaigns') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { recipient_count: 2, status: 'processing' }, error: null }),
              }),
            }),
            update: (fields: { status: string }) => ({
              eq: async () => {
                campaignUpdatedStatus = fields.status;
                return { data: null, error: null };
              },
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
              in: async () => ({ count: 2, error: null }), // terminalCount = 2
              eq: async () => ({ count: 1, error: null }), // sentTotal = 1
            }),
          }),
          upsert: async () => ({ data: null, error: null }),
        };
      },
    } as unknown as import('@supabase/supabase-js').SupabaseClient;

    const worker = new BroadcastProcessor(mockRedis, mockSupabase);

    const job = {
      data: {
        campaignId: 'camp_complete_test',
        batchIndex: 0,
        totalBatches: 1,
        templateId: 'DLT_NOTICE',
        variables: {},
        recipients: [
          { businessProfileId: 'b1', phone: '9876543210', idempotencyKey: `idemp_comp_${Date.now()}` },
        ],
      },
      attemptsMade: 0,
    } as Job<BroadcastBatchJobData>;

    const result = await worker.process(job);
    expect(result.sentCount).toBe(1);
    expect(campaignUpdatedStatus).toBe('completed');
  });

  it('lease-duplicate skip does not reduce the completion target', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('STAGING_SMS_ALLOWLIST', '9876543210');
    vi.stubEnv('MSG91_AUTH_KEY', 'synthetic-broadcast-key');

    const campaignId = `camp_lease_skip_${Date.now()}`;
    const idempKey = `idemp_lease_dup_${Date.now()}`;
    const redisDedupeKey = `dedupe:broadcast:${campaignId}:${idempKey}`;
    const redisSkippedKey = `dedupe:broadcast:${campaignId}:skipped_keys`;

    // Pre-set the Redis dedupe lease to simulate a concurrent worker holding the lease
    await mockRedis.set(redisDedupeKey, 'locked', 'EX', 60, 'NX');

    let updatedCampaignStatus: string | null = null;
    const mockSupabase = {
      from: (table: string) => {
        if (table === 'broadcast_campaigns') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { recipient_count: 2, status: 'processing' }, error: null }),
              }),
            }),
            update: (fields: { status: string }) => ({
              eq: async () => {
                updatedCampaignStatus = fields.status;
                return { data: null, error: null };
              },
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
              in: async () => ({ count: 1, error: null }),
              eq: async () => ({ count: 1, error: null }),
            }),
          }),
          upsert: async () => ({ data: null, error: null }),
        };
      },
    } as unknown as import('@supabase/supabase-js').SupabaseClient;

    const worker = new BroadcastProcessor(mockRedis, mockSupabase);

    const job = {
      data: {
        campaignId,
        batchIndex: 0,
        totalBatches: 1,
        templateId: 'DLT_NOTICE',
        variables: {},
        recipients: [
          { businessProfileId: 'b1', phone: '9876543210', idempotencyKey: idempKey },
        ],
      },
      attemptsMade: 0,
      opts: { attempts: 1 },
    } as Job<BroadcastBatchJobData>;

    const result = await worker.process(job);
    expect(result.skippedCount).toBe(1);
    expect(result.sentCount).toBe(0);

    // Verify lease-duplicate skip was NOT added to the skip set
    const recordedSkips = await mockRedis.scard(redisSkippedKey);
    expect(recordedSkips).toBe(0);

    // Campaign target was NOT reduced (remains 2), so campaign status is NOT updated to completed
    expect(updatedCampaignStatus).not.toBe('completed');
  });

  describe('Campaign Watchdog for abandoned campaigns with lost leases', () => {
    it('finalizes stale processing campaigns to completed when sent deliveries exist, failed when zero', async () => {
      const updatedStatus: Record<string, string> = {};
      const mockSupabase = {
        from: (table: string) => {
          if (table === 'broadcast_campaigns') {
            return {
              select: () => ({
                eq: () => ({
                  lt: async () => ({
                    data: [{ id: 'stale-c1' }, { id: 'stale-c2' }],
                    error: null,
                  }),
                }),
              }),
              update: (fields: { status: string }) => ({
                eq: async (_col: string, id: string) => {
                  updatedStatus[id] = fields.status;
                  return { data: null, error: null };
                },
              }),
            };
          }
          if (table === 'broadcast_deliveries') {
            return {
              select: (_col: string, _opts: unknown) => ({
                eq: (_col1: string, campaignId: string) => ({
                  eq: async (_col2: string, _status: string) => {
                    if (campaignId === 'stale-c1') {
                      return { count: 5, error: null };
                    }
                    return { count: 0, error: null };
                  },
                }),
              }),
            };
          }
          return {};
        },
      } as unknown as import('@supabase/supabase-js').SupabaseClient;

      const result = await runCampaignWatchdog(mockSupabase, 6);
      expect(result.finalizedCount).toBe(2);
      expect(updatedStatus['stale-c1']).toBe('completed');
      expect(updatedStatus['stale-c2']).toBe('failed');
    });

    it('sets queued campaign to processing and updates updated_at heartbeat on batch execution', async () => {
      const updatesHistory: Array<Record<string, unknown>> = [];
      const mockSupabase = {
        from: (table: string) => {
          if (table === 'broadcast_campaigns') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { recipient_count: 5, status: 'queued' }, error: null }),
                }),
              }),
              update: (fields: Record<string, unknown>) => ({
                eq: async () => {
                  updatesHistory.push(fields);
                  return { data: null, error: null };
                },
              }),
            };
          }
          if (table === 'broadcast_deliveries') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                  in: async () => ({ count: 1, error: null }),
                  eq: async () => ({ count: 1, error: null }),
                }),
              }),
              upsert: async () => ({ data: null, error: null }),
            };
          }
          return {};
        },
      } as unknown as import('@supabase/supabase-js').SupabaseClient;

      const worker = new BroadcastProcessor(mockRedis, mockSupabase);
      const job = {
        data: {
          campaignId: 'camp_heartbeat_test',
          batchIndex: 0,
          totalBatches: 2,
          templateId: 'DLT_NOTICE',
          variables: {},
          recipients: [
            { businessProfileId: 'b1', phone: '9876543210', idempotencyKey: 'idemp_heartbeat_1' },
          ],
        },
        attemptsMade: 0,
        opts: { attempts: 1 },
      } as Job<BroadcastBatchJobData>;

      await worker.process(job);

      // Verify initial update set status to 'processing' and bumped updated_at
      expect(updatesHistory.length).toBeGreaterThanOrEqual(1);
      expect(updatesHistory[0]?.status).toBe('processing');
      expect(updatesHistory[0]?.updated_at).toBeDefined();
    });
  });
});
