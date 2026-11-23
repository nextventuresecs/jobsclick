import { randomUUID } from 'node:crypto';
import { Job } from 'bullmq';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import IORedis from 'ioredis';
import IORedisMock from 'ioredis-mock';
import { isStaging, isStrictEnv, isTestEnv } from '@indian-job-portal/validation';

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
export const BROADCAST_SKIPS_TTL_SECONDS = 7 * 86400; // >= 7 days (604,800s)

export class BroadcastProcessor {
  private static globalProcessedKeys = new Set<string>();
  private supabase: SupabaseClient | null = null;
  private redis: IORedis | null = null;
  private processedIdempotencyKeys: Set<string>;

  public static resetState(): void {
    BroadcastProcessor.globalProcessedKeys.clear();
  }

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
      const isTest = !isStrictEnv() && (isTestEnv() || Boolean(process.env['VITEST']) || process.env['USE_MOCK_REDIS'] === 'true');

      if (isTest) {
        this.redis = new (IORedisMock as unknown as typeof IORedis)() as IORedis;
      } else if (redisUrl) {
        try {
          const isTls = redisUrl.startsWith("rediss://");
          this.redis = new IORedis(redisUrl, {
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            lazyConnect: true,
            tls: isTls ? {} : undefined,
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
        skippedCount++;
        continue;
      }

      // 2. Staging safety allowlist gate (checked before acquiring Redis lease)
      const maskedPhone = this.maskPhone(phone);
      if (isStaging()) {
        const cleanPhone = phone.replace(/\D/g, '').slice(-10);
        const allowlistRaw = process.env['STAGING_SMS_ALLOWLIST'] || '';
        const allowlist = allowlistRaw
          .split(',')
          .map((s) => s.trim().replace(/\D/g, '').slice(-10))
          .filter(Boolean);

        if (allowlist.length === 0 || !allowlist.includes(cleanPhone)) {
          console.log(`[Broadcast Staging Gate] Broadcast SMS to ${maskedPhone} skipped: blocked_by_allowlist`);
          skippedCount++;

          if (!this.redis) {
            throw new Error('Redis connection is required for broadcast skip accounting');
          }
          const redisSkippedKey = `dedupe:broadcast:${this.sanitizeKey(campaignId)}:skipped_keys`;
          await this.redis.sadd(redisSkippedKey, idempotencyKey);
          await this.redis.expire(redisSkippedKey, BROADCAST_SKIPS_TTL_SECONDS);
          continue;
        }
      }

      // 3. Distributed Redis Lease Gate (Tier 1 Deduplication)
      // Prevents concurrent duplicate dispatches when rolling pods (N and N-1) run side-by-side
      const redisDedupeKey = `dedupe:broadcast:${this.sanitizeKey(campaignId)}:${idempotencyKey}`;
      let acquiredRedisLock = false;
      if (this.redis) {
        try {
          const res = await this.redis.set(redisDedupeKey, 'locked', 'EX', DEFAULT_DEDUPE_TTL_SECONDS, 'NX');
          if (!res) {
            console.log(`[BroadcastProcessor] Duplicate detected via distributed Redis lease: ${idempotencyKey}`);
            skippedCount++;
            continue;
          }
          acquiredRedisLock = true;
        } catch (redisErr) {
          if (isStrictEnv()) {
            throw redisErr;
          }
          console.warn('[BroadcastProcessor] Redis dedupe check failed, relying on DB transaction gate:', redisErr);
        }
      } else if (isStrictEnv()) {
        throw new Error('Redis connection is required for broadcast deduplication in strict environment');
      }

      // 4. Database Invariant Gate (Tier 2 Deduplication)
      // Transactional boundary: if already sent in DB, skip
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
            skippedCount++;
            continue;
          }
        } catch (dbErr) {
          console.warn('[BroadcastProcessor] DB idempotency pre-check error:', dbErr);
        }
      }

      // 5. Provider Dispatch (MSG91 or Mock)
      let gatewayMsgId: string = '';
      try {
        if (!isStrictEnv() && isTestEnv()) {
          gatewayMsgId = randomUUID();
        } else {
          const authKey = process.env['MSG91_AUTH_KEY'];
          if (!authKey || authKey === 'dummy-msg91-key') {
            throw new Error('MSG91 broadcast credentials are unavailable');
          }
          const senderId = process.env['MSG91_SENDER_ID'] || 'JOBSCK';
          const msg91Url = new URL('https://control.msg91.com/api/v5/flow');

          const response = await fetch(msg91Url.toString(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              authkey: authKey,
            },
            body: JSON.stringify({
              ...variables,
              template_id: templateId,
              sender: senderId,
              short_url: '0',
              mobiles: `91${phone.replace(/\D/g, '').slice(-10)}`,
            }),
            signal: AbortSignal.timeout(15_000),
          });

          if (!response.ok) {
            throw new Error(`MSG91 broadcast failure: HTTP ${response.status}`);
          }

          const result = (await response.json()) as { type?: unknown; message?: unknown };
          if (result.type !== 'success' || typeof result.message !== 'string' || !result.message.trim()) {
            throw new Error('MSG91 broadcast request was not acknowledged');
          }
          gatewayMsgId = result.message;
        }
      } catch (dispatchErr) {
        console.error(`[BroadcastProcessor] Failed sending to ${maskedPhone}:`, dispatchErr);
        failedCount++;

        // Only release the Redis lease if the provider call failed
        if (acquiredRedisLock && this.redis) {
          try {
            await this.redis.del(redisDedupeKey);
          } catch {
            // Ignore redis deletion error
          }
        }

        if (this.supabase) {
          try {
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
          } catch (dbErr) {
            console.warn('[BroadcastProcessor] Failed recording failed delivery:', dbErr);
          }
        }
        continue;
      }

      // 6. Record provider acceptance (lease is NEVER released, recipient is NEVER marked failed)
      this.processedIdempotencyKeys.add(idempotencyKey);
      sentCount++;

      if (this.supabase) {
        try {
          const { error } = await this.supabase.from('broadcast_deliveries').upsert(
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
          if (error) {
            console.error(`[BroadcastProcessor] Database error recording sent delivery for ${maskedPhone}:`, error);
          }
        } catch (dbErr) {
          console.error(`[BroadcastProcessor] Unexpected exception writing sent delivery for ${maskedPhone}:`, dbErr);
        }
      }
    }

    // 7. Update campaign overall status in DB if all deliveries terminal across batches
    if (this.supabase) {
      try {
        const { data: campaign } = await this.supabase
          .from('broadcast_campaigns')
          .select('recipient_count, status')
          .eq('id', campaignId)
          .maybeSingle();

        if (campaign && typeof campaign.recipient_count === 'number') {
          // Retrieve recorded skips (allowlist skips via Redis SET)
          if (!this.redis) {
            throw new Error('Redis connection is required to evaluate campaign completion');
          }
          const redisSkippedKey = `dedupe:broadcast:${this.sanitizeKey(campaignId)}:skipped_keys`;
          const recordedSkips = await this.redis.scard(redisSkippedKey);
          const effectiveTarget = Math.max(0, campaign.recipient_count - recordedSkips);

          // Final attempt check: count 'failed' as terminal ONLY on final attempt
          const maxAttempts = job.opts?.attempts || 1;
          const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;
          const terminalStatuses = isFinalAttempt ? ['sent', 'failed'] : ['sent'];

          const { count: terminalDeliveries, error: countErr } = await this.supabase
            .from('broadcast_deliveries')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', campaignId)
            .in('status', terminalStatuses);

          if (!countErr && typeof terminalDeliveries === 'number' && terminalDeliveries >= effectiveTarget) {
            const { count: sentTotal } = await this.supabase
              .from('broadcast_deliveries')
              .select('id', { count: 'exact', head: true })
              .eq('campaign_id', campaignId)
              .eq('status', 'sent');

            // Partial failure rule (constrained by broadcast_campaigns.status CHECK constraint:
            // 'queued', 'processing', 'completed', 'failed', 'cancelled'):
            // If sentTotal > 0, at least one message was delivered, so the campaign status is 'completed'.
            // If sentTotal === 0, zero messages were delivered (all failed or skipped), so status is 'failed'.
            const campaignStatus = sentTotal && sentTotal > 0 ? 'completed' : 'failed';
            await this.supabase
              .from('broadcast_campaigns')
              .update({
                status: campaignStatus,
                updated_at: new Date().toISOString(),
              })
              .eq('id', campaignId);
          }
        }
      } catch (campaignErr) {
        if (campaignErr instanceof Error && campaignErr.message.includes('Redis connection is required')) {
          throw campaignErr;
        }
        console.warn('[BroadcastProcessor] Failed checking campaign completion:', campaignErr);
      }
    }

    const status: 'completed' | 'failed' = failedCount > 0 ? 'failed' : 'completed';

    return {
      campaignId,
      batchIndex,
      processedCount: recipients.length,
      sentCount,
      skippedCount,
      failedCount,
      status,
    };
  }
}

export const broadcastProcessor = async (job: Job<BroadcastBatchJobData>): Promise<BroadcastBatchJobResult> => {
  const processor = new BroadcastProcessor();
  const result = await processor.process(job);
  if (result.status === 'failed') {
    throw new Error(`Broadcast batch ${result.batchIndex} for campaign ${result.campaignId} failed with ${result.failedCount} failures`);
  }
  return result;
};

/**
 * Watchdog that finalizes abandoned campaigns whose lease expired without delivery completion
 */
export async function runCampaignWatchdog(
  supabase: SupabaseClient,
  staleHours: number = 6,
): Promise<{ finalizedCount: number }> {
  const cutoff = new Date(Date.now() - staleHours * 3600 * 1000).toISOString();
  const { data: staleCampaigns } = await supabase
    .from('broadcast_campaigns')
    .select('id')
    .eq('status', 'processing')
    .lt('updated_at', cutoff);

  let finalizedCount = 0;
  for (const campaign of staleCampaigns || []) {
    const { count: sentCount } = await supabase
      .from('broadcast_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id)
      .eq('status', 'sent');

    const finalStatus = sentCount && sentCount > 0 ? 'completed' : 'failed';
    await supabase
      .from('broadcast_campaigns')
      .update({ status: finalStatus, updated_at: new Date().toISOString() })
      .eq('id', campaign.id);
    finalizedCount++;
  }
  return { finalizedCount };
}
