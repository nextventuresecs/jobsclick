import { Job } from 'bullmq';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import IORedis from 'ioredis';
import IORedisMock from 'ioredis-mock';

export interface BroadcastRecipient {
  businessProfileId: string;
  phone: string;
  idempotencyKey: string;
}

export interface BroadcastBatchJobData {
  version?: 1 | 2;
  campaignId: string;
  batchIndex: number;
  totalBatches: number;
  recipients: BroadcastRecipient[];
  templateId: string;
  variables: Record<string, string>;
  targetDistricts?: string[];
  batchSize?: number;
  shouldSimulateFailure?: boolean;
  traceId?: string;
}

export interface BroadcastBatchJobResult {
  campaignId: string;
  batchIndex: number;
  processedCount: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
  status: 'completed' | 'failed';
}

export const DEFAULT_DEDUPE_TTL_SECONDS = 86400; // 24-hour lease covering standard retry windows

export class BroadcastProcessor {
  private static globalProcessedKeys = new Set<string>();
  private supabase: SupabaseClient | null = null;
  private redis: IORedis | null = null;
  private processedIdempotencyKeys: Set<string>;

  constructor(customRedis?: IORedis | null, customSupabase?: SupabaseClient | null) {
    this.processedIdempotencyKeys = BroadcastProcessor.globalProcessedKeys;

    if (customSupabase) {
      this.supabase = customSupabase;
    } else {
      const supabaseUrl = process.env['SUPABASE_URL'];
      const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
      if (supabaseUrl && supabaseKey && supabaseKey !== 'dummy-service-role-key') {
        this.supabase = createClient(supabaseUrl, supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
      }
    }

    if (customRedis) {
      this.redis = customRedis;
    } else {
      const redisUrl = process.env['REDIS_URL'];
      const isTest = process.env['NODE_ENV'] === 'test' || Boolean(process.env['VITEST']) || process.env['USE_MOCK_REDIS'] === 'true';

      if (isTest) {
        this.redis = new (IORedisMock as unknown as typeof IORedis)() as IORedis;
      } else if (redisUrl) {
        try {
          this.redis = new IORedis(redisUrl, {
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            lazyConnect: true,
          });
        } catch (err) {
          console.warn('[BroadcastProcessor] Failed initializing Redis connection, falling back to memory/DB dedupe:', err);
        }
      }
    }
  }

  /**
   * Masks a phone number for DPDP and Invariant #1 privacy compliance: e.g. 9876543210 -> +91XXXXXX3210
   */
  private maskPhone(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    const last4 = cleaned.slice(-4);
    return `+91XXXXXX${last4}`;
  }

  private sanitizeKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9_-]/g, '');
  }

  async process(job: Job<BroadcastBatchJobData>): Promise<BroadcastBatchJobResult> {
    const { campaignId, batchIndex, recipients, templateId, variables, shouldSimulateFailure } = job.data;

    // Retry test simulation: fail until attempt 3 if requested
    if (shouldSimulateFailure && job.attemptsMade < 2) {
      throw new Error(`Simulated transient broadcast gateway failure for retry verification (attempt ${job.attemptsMade + 1})`);
    }

    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i]!;
      const { businessProfileId, phone, idempotencyKey } = recipient;

      // Renew job lock / heartbeat on BullMQ every 25 items for large batches
      if (i > 0 && i % 25 === 0 && job && typeof job.updateProgress === 'function') {
        try {
          await job.updateProgress(Math.floor((i / recipients.length) * 100));
        } catch {
          // Ignore progress update error in mock environments
        }
      }

      // 1. In-memory check (fast-path)
      if (this.processedIdempotencyKeys.has(idempotencyKey)) {
        console.log(`[BroadcastProcessor] Skipping duplicate delivery for idempotencyKey=${idempotencyKey}`);
        sentCount++;
        skippedCount++;
        continue;
      }

      // 2. Distributed Redis Lease Gate (Tier 1 Deduplication)
      // Prevents concurrent duplicate dispatches when rolling pods (N and N-1) run side-by-side
      const redisDedupeKey = `dedupe:broadcast:${this.sanitizeKey(campaignId)}:${idempotencyKey}`;
      let acquiredRedisLock = false;
      if (this.redis) {
        try {
          const res = await this.redis.set(redisDedupeKey, 'locked', 'EX', DEFAULT_DEDUPE_TTL_SECONDS, 'NX');
          if (!res) {
            console.log(`[BroadcastProcessor] Duplicate detected via distributed Redis lease: ${idempotencyKey}`);
            this.processedIdempotencyKeys.add(idempotencyKey);
            sentCount++;
            skippedCount++;
            continue;
          }
          acquiredRedisLock = true;
        } catch (redisErr) {
          console.warn('[BroadcastProcessor] Redis dedupe check failed, relying on DB transaction gate:', redisErr);
        }
      }

      // 3. Database Invariant Gate (Tier 2 Deduplication)
      // Transactional boundary: if already sent or claimed in DB, skip
      if (this.supabase) {
        try {
          const { data: existing } = await this.supabase
            .from('broadcast_deliveries')
            .select('id, status')
            .eq('idempotency_key', idempotencyKey)
            .maybeSingle();

          if (existing && existing.status === 'sent') {
            console.log(`[BroadcastProcessor] Idempotency match in DB: delivery ${existing.id} already sent.`);
            this.processedIdempotencyKeys.add(idempotencyKey);
            sentCount++;
            skippedCount++;
            continue;
          }
        } catch (dbErr) {
          console.warn('[BroadcastProcessor] DB idempotency pre-check error:', dbErr);
        }
      }

      // 4. Gateway dispatch (MSG91 or Mock)
      const maskedPhone = this.maskPhone(phone);
      const isTestMode =
        process.env['NODE_ENV'] === 'test' ||
        Boolean(process.env['VITEST']) ||
        !process.env['MSG91_AUTH_KEY'] ||
        process.env['MSG91_AUTH_KEY'] === 'dummy-msg91-key';

      try {
        let gatewayMsgId = `mock_gw_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        if (!isTestMode) {
          const authKey = process.env['MSG91_AUTH_KEY']!;
          const senderId = process.env['MSG91_SENDER_ID'] || 'INDIAN';
          const msg91Url = new URL('https://control.msg91.com/api/v5/flow');

          const response = await fetch(msg91Url.toString(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              authkey: authKey,
            },
            body: JSON.stringify({
              template_id: templateId,
              sender: senderId,
              short_url: '0',
              mobiles: `91${phone.replace(/\D/g, '').slice(-10)}`,
              ...variables,
            }),
          });

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`MSG91 broadcast failure: HTTP ${response.status} - ${errText}`);
          }

          const resData = (await response.json()) as { message?: string; request_id?: string };
          gatewayMsgId = resData.request_id || gatewayMsgId;
        }

        // 5. Record successful delivery
        this.processedIdempotencyKeys.add(idempotencyKey);
        sentCount++;

        if (this.supabase) {
          await this.supabase.from('broadcast_deliveries').upsert(
            {
              campaign_id: campaignId,
              business_profile_id: businessProfileId,
              phone_masked: maskedPhone,
              status: 'sent',
              gateway_message_id: gatewayMsgId,
              idempotency_key: idempotencyKey,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'idempotency_key' }
          );
        }
      } catch (dispatchErr) {
        console.error(`[BroadcastProcessor] Failed sending to ${maskedPhone}:`, dispatchErr);
        failedCount++;

        // Revert Redis lock if acquired so failed message can be retried cleanly
        if (acquiredRedisLock && this.redis) {
          try {
            await this.redis.del(redisDedupeKey);
          } catch {
            // Ignore redis deletion error
          }
        }

        if (this.supabase) {
          await this.supabase.from('broadcast_deliveries').upsert(
            {
              campaign_id: campaignId,
              business_profile_id: businessProfileId,
              phone_masked: maskedPhone,
              status: 'failed',
              idempotency_key: idempotencyKey,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'idempotency_key' }
          );
        }
      }
    }

    // 6. Update campaign overall status in DB if last batch
    if (this.supabase && batchIndex === job.data.totalBatches - 1) {
      await this.supabase
        .from('broadcast_campaigns')
        .update({
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaignId);
    }

    return {
      campaignId,
      batchIndex,
      processedCount: recipients.length,
      sentCount,
      skippedCount,
      failedCount,
      status: 'completed',
    };
  }
}

export const broadcastProcessor = async (job: Job<BroadcastBatchJobData>): Promise<BroadcastBatchJobResult> => {
  const processor = new BroadcastProcessor();
  return processor.process(job);
};
