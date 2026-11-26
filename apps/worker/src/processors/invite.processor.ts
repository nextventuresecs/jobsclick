import { Job, DelayedError } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import IORedis from 'ioredis';
import { isStrictEnv, isTestEnv } from '@indian-job-portal/validation';
import { WorkerSmsService } from '../sms/sms.service.js';

export interface InviteWaveJobData {
  waveId: string;
  batchId: string;
  waveSize: number;
  costPerSmsInr?: number;
  shouldSimulateFailure?: boolean;
}

export interface InviteWaveJobResult {
  waveId: string;
  batchId: string;
  waveSize: number;
  sentCount: number;
  failedCount: number;
  totalCostInr: number;
  status: 'completed' | 'queued' | 'failed' | 'delayed';
}

export class InviteProcessor {
  private supabase: SupabaseClient | null = null;
  private redis: IORedis | null = null;
  private smsService = new WorkerSmsService();

  constructor(customRedis?: IORedis | null, customSupabase?: SupabaseClient | null) {
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
        const IORedisMock = require('ioredis-mock') as typeof IORedis;
        this.redis = new IORedisMock() as IORedis;
      } else if (redisUrl) {
        try {
          const isTls = redisUrl.startsWith('rediss://');
          this.redis = new IORedis(redisUrl, {
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            lazyConnect: true,
            tls: isTls ? {} : undefined,
          });
        } catch (err) {
          console.warn('[InviteProcessor] Failed initializing Redis connection:', err);
        }
      }
    }
  }

  /**
   * Reclaims stale 'sending' invitation rows older than `staleMinutes` back to 'pending'
   * so waves crashed mid-dispatch can recover without losing recipients.
   */
  async reclaimStaleSendingInvitations(batchId: string, staleMinutes = 15): Promise<number> {
    if (!this.supabase || typeof this.supabase.rpc !== 'function') {
      return 0;
    }
    const { data, error } = await this.supabase.rpc('reclaim_stale_sending_invitations', {
      p_batch_id: batchId,
      p_stale_minutes: staleMinutes,
    });
    if (error) {
      console.warn(`[InviteProcessor] Stale sending reaper failed for batch ${batchId}: ${error.message}`);
      return 0;
    }
    return Number(data ?? 0);
  }

  async process(job: Job<InviteWaveJobData>): Promise<InviteWaveJobResult> {
    const { waveId, batchId, waveSize, costPerSmsInr = 0.2, shouldSimulateFailure } = job.data;

    // Retry test simulation: fail until attempt 3 if requested
    if (shouldSimulateFailure && job.attemptsMade < 2) {
      throw new Error(`Simulated transient invite dispatch failure for retry check (attempt ${job.attemptsMade + 1})`);
    }

    const totalCostInr = Math.round(waveSize * costPerSmsInr * 100) / 100;

    if (!this.supabase) throw new Error('INVITE_DATABASE_UNAVAILABLE');

    // 1. Check wave existence and batch association
    const { data: currentWave, error: waveError } = await this.supabase
      .from('invite_waves')
      .select('*')
      .eq('id', waveId)
      .single();

    if (waveError || !currentWave || currentWave.batch_id !== batchId) {
      throw new Error('INVITE_WAVE_BATCH_MISMATCH');
    }

    if (currentWave.status === 'completed' || currentWave.status === 'failed') {
      return {
        waveId,
        batchId,
        waveSize,
        sentCount: currentWave.sent_count || 0,
        failedCount: currentWave.failed_count || 0,
        totalCostInr,
        status: currentWave.status,
      };
    }

    if (currentWave.status === 'queued') {
      console.log(`[InviteProcessor] Wave ${waveId} is currently queued. Skipping dispatch.`);
      return {
        waveId,
        batchId,
        waveSize,
        sentCount: currentWave.sent_count || 0,
        failedCount: 0,
        totalCostInr,
        status: 'queued',
      };
    }

    // Distributed Batch Lock: Prevents overlapping wave dispatches on the same batch
    const batchLockKey = `lock:invite-batch:${batchId}`;
    const BATCH_LOCK_TTL_SECONDS = 120; // 2 minutes initial TTL
    const lockToken = String(job?.id || randomUUID());
    let acquiredBatchLock = false;
    let renewalInterval: NodeJS.Timeout | null = null;
    let lockLost = false;

    if (!this.redis) {
      if (isStrictEnv()) {
        throw new Error('INVITE_REDIS_LOCK_UNAVAILABLE: Redis is required for batch concurrency locking in strict mode');
      }
      console.warn('[InviteProcessor] Redis unavailable, proceeding without distributed batch lock in non-strict mode');
    } else {
      try {
        const res = await this.redis.set(batchLockKey, lockToken, 'EX', BATCH_LOCK_TTL_SECONDS, 'NX');
        if (!res) {
          // Delay counter keyed by job id with 24h TTL
          const delayKey = `lock:invite-job-delays:${lockToken}`;
          const delayCount = await this.redis.incr(delayKey);
          await this.redis.expire(delayKey, 86400);

          // Lock wait: bound by wave age (config, default 6h), not attempt count
          const maxWaveAgeHours = Number(process.env['INVITE_WAVE_LOCK_MAX_HOURS'] || 6);
          const maxWaveAgeMs = maxWaveAgeHours * 3600 * 1000;
          const waveStartedAt = currentWave.started_at || (currentWave as { created_at?: string }).created_at;
          const waveCreatedAtMs = waveStartedAt ? new Date(waveStartedAt).getTime() : Date.now();
          const waveAgeMs = Date.now() - waveCreatedAtMs;

          if (waveAgeMs > maxWaveAgeMs) {
            console.error(`[InviteProcessor] Wave ${waveId} lock wait timed out after ${Math.round(waveAgeMs / 3600000)}h (max ${maxWaveAgeHours}h). Reverting wave to queued.`);
            if (this.supabase) {
              await this.supabase
                .from('invite_waves')
                .update({
                  status: 'queued',
                  failure_reason: 'INVITE_BATCH_LOCK_TIMEOUT',
                })
                .eq('id', waveId);
            }
            throw new Error(`INVITE_BATCH_LOCK_TIMEOUT: Maximum wave lock wait age (${maxWaveAgeHours}h) exceeded for wave ${waveId}`);
          }

          console.log(`[InviteProcessor] Batch ${batchId} is currently locked by another active wave job. Delaying job ${lockToken} (delay #${delayCount}, wave age ${Math.round(waveAgeMs / 1000)}s).`);
          const jobWithDelayed = job as unknown as { moveToDelayed?: (timestamp: number, token?: string) => Promise<void>; token?: string };
          if (typeof jobWithDelayed?.moveToDelayed === 'function') {
            try {
              await jobWithDelayed.moveToDelayed(Date.now() + 5000, jobWithDelayed.token);
            } catch {
              // best-effort
            }
            throw new DelayedError();
          }

          return {
            waveId,
            batchId,
            waveSize,
            sentCount: currentWave.sent_count || 0,
            failedCount: currentWave.failed_count || 0,
            totalCostInr,
            status: 'delayed',
          };
        }
        acquiredBatchLock = true;

        // TTL renewal every ~60s while running
        const renewalScript = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("expire", KEYS[1], ARGV[2])
          else
            return 0
          end
        `;
        renewalInterval = setInterval(async () => {
          try {
            if (this.redis && acquiredBatchLock) {
              const renewResult = await this.redis.eval(renewalScript, 1, batchLockKey, lockToken, BATCH_LOCK_TTL_SECONDS);
              if (Number(renewResult) === 0) {
                console.warn(`[InviteProcessor] Batch lock lost for batch ${batchId}. Aborting wave.`);
                lockLost = true;
              }
            }
          } catch (renewErr) {
            console.warn('[InviteProcessor] Failed renewing batch lock TTL:', renewErr);
          }
        }, 60000);
        if (typeof renewalInterval.unref === 'function') {
          renewalInterval.unref();
        }
      } catch (redisErr) {
        if (
          redisErr instanceof DelayedError ||
          (redisErr instanceof Error &&
            (redisErr.name === 'DelayedError' ||
              redisErr.message.includes('INVITE_BATCH_LOCK_TIMEOUT') ||
              redisErr.message.includes('INVITE_REDIS_LOCK_UNAVAILABLE')))
        ) {
          throw redisErr;
        }
        if (isStrictEnv()) throw redisErr;
        console.warn('[InviteProcessor] Redis batch lock error:', redisErr);
      }
    }

    try {
      if (typeof this.supabase.rpc === 'function') {
        await this.reclaimStaleSendingInvitations(batchId);
      }

      const startWaveRes = await this.supabase
        .from('invite_waves')
        .update({
          status: 'processing',
          total_cost_inr: totalCostInr,
        })
        .eq('id', waveId);
      if (startWaveRes && 'error' in startWaveRes && startWaveRes.error) {
        throw new Error(`INVITE_WAVE_WRITE_FAILED: ${startWaveRes.error.message}`);
      }

    const alreadySent = currentWave.sent_count || 0;
    const remainingWaveSize = Math.max(0, waveSize - alreadySent);

    if (remainingWaveSize === 0) {
      const actualCostInr = Math.round(alreadySent * costPerSmsInr * 100) / 100;
      const doneRes = await this.supabase
        .from('invite_waves')
        .update({
          status: 'completed',
          sent_count: alreadySent,
          failed_count: currentWave.failed_count || 0,
          total_cost_inr: actualCostInr,
          completed_at: new Date().toISOString(),
        })
        .eq('id', waveId);
      if (doneRes && 'error' in doneRes && doneRes.error) {
        throw new Error(`INVITE_WAVE_WRITE_FAILED: ${doneRes.error.message}`);
      }

      return {
        waveId,
        batchId,
        waveSize,
        sentCount: alreadySent,
        failedCount: currentWave.failed_count || 0,
        totalCostInr: actualCostInr,
        status: 'completed',
      };
    }

    // 2. Atomically claim pending invitations scoped to batchId (FOR UPDATE SKIP LOCKED via RPC)
    // Never fall back to global users or synthetic phone numbers (P0-6 fix)
    let batchFallbackLanguage: 'en' | 'hi' = 'en';
    try {
      const batchRes = await this.supabase
        .from('bulk_import_batches')
        .select('language')
        .eq('id', batchId)
        .maybeSingle();
      if (batchRes && 'data' in batchRes && (batchRes.data as { language?: string } | null)?.language === 'hi') {
        batchFallbackLanguage = 'hi';
      }
    } catch {
      // ignore on minimal unit-test mocks without bulk_import_batches
    }

    const useAtomicClaimRpc = typeof this.supabase.rpc === 'function';
    let fallbackRecipients: Array<{ id: string; phone: string; language: 'en' | 'hi' }> = [];

    if (!useAtomicClaimRpc) {
      const { data: invitations, error: invitationError } = await this.supabase
        .from('invitations')
        .select('id, phone')
        .eq('batch_id', batchId)
        .eq('status', 'pending')
        .not('phone', 'is', null)
        .limit(remainingWaveSize);

      if (invitationError || !invitations) throw new Error('INVITE_RECIPIENT_LOOKUP_FAILED');
      fallbackRecipients = (invitations as Array<{ id: string; phone: string; language?: string | null }>)
        .filter((inv) => Boolean(inv.phone))
        .map((inv) => ({
          id: inv.id as string,
          phone: inv.phone as string,
          language: (inv.language === 'hi' ? 'hi' : inv.language === 'en' ? 'en' : batchFallbackLanguage) as 'en' | 'hi',
        }));
    }

    let sentCount = alreadySent;
    let failedCount = currentWave.failed_count || 0;
    const maxIterations = useAtomicClaimRpc ? remainingWaveSize : fallbackRecipients.length;

    // 3. Claim-before-send & send SMS 1:1 per recipient with per-recipient status tracking
    for (let i = 0; i < maxIterations && sentCount < waveSize; i++) {
      if (lockLost) {
        console.warn(`[InviteProcessor] Lock lost mid-run for batch ${batchId}, wave ${waveId}. Aborting wave.`);
        const actualCostInr = Math.round(sentCount * costPerSmsInr * 100) / 100;
        await this.supabase
          .from('invite_waves')
          .update({
            status: 'failed',
            sent_count: sentCount,
            failed_count: failedCount,
            total_cost_inr: actualCostInr,
            updated_at: new Date().toISOString(),
          })
          .eq('id', waveId);

        return {
          waveId,
          batchId,
          waveSize,
          sentCount,
          failedCount,
          totalCostInr: actualCostInr,
          status: 'failed',
        };
      }
      // Re-read wave status and lock ownership between sends (every 5 items) to stop if wave was paused/cancelled or lock lost
      if (i > 0 && i % 5 === 0) {
        if (acquiredBatchLock && this.redis) {
          try {
            const currentHolder = await this.redis.get(batchLockKey);
            if (currentHolder !== lockToken) {
              console.warn(`[InviteProcessor] Batch lock ownership lost mid-run for batch ${batchId}. Aborting.`);
              lockLost = true;
            }
          } catch {
            // best-effort
          }
        }

        if (lockLost) {
          console.warn(`[InviteProcessor] Lock lost mid-run for batch ${batchId}, wave ${waveId}. Aborting wave.`);
          if (this.supabase) {
            await this.supabase
              .from('invite_waves')
              .update({
                status: 'failed',
                sent_count: sentCount,
                failed_count: failedCount,
                updated_at: new Date().toISOString(),
              })
              .eq('id', waveId);
          }

          return {
            waveId,
            batchId,
            waveSize,
            sentCount,
            failedCount,
            totalCostInr,
            status: 'failed',
          };
        }

        if (this.supabase) {
          const { data: waveCheck } = await this.supabase
            .from('invite_waves')
            .select('status')
            .eq('id', waveId)
            .maybeSingle();

          if (waveCheck && (waveCheck.status === 'failed' || waveCheck.status === 'queued')) {
            console.log(`[InviteProcessor] Wave ${waveId} transitioned to ${waveCheck.status}. Aborting further dispatch.`);
            await this.supabase
              .from('invite_waves')
              .update({
                sent_count: sentCount,
                failed_count: failedCount,
                updated_at: new Date().toISOString(),
              })
              .eq('id', waveId);

            return {
              waveId,
              batchId,
              waveSize,
              sentCount,
              failedCount,
              totalCostInr,
              status: waveCheck.status,
            };
          }
        }
      }

      let recipient: { id: string; phone: string; language: 'en' | 'hi' };
      if (useAtomicClaimRpc) {
        const { data: claimed, error: claimError } = await this.supabase.rpc('claim_pending_invitations', {
          p_batch_id: batchId,
          p_wave_id: waveId,
          p_limit: 1,
        });
        if (claimError || !Array.isArray(claimed)) {
          throw new Error(`INVITE_RECIPIENT_CLAIM_FAILED: ${claimError?.message ?? 'invalid rpc response'}`);
        }
        const row = claimed[0] as { id?: string; phone?: string; language?: string | null } | undefined;
        if (!row || !row.id || !row.phone) {
          break;
        }
        recipient = {
          id: row.id,
          phone: row.phone,
          language: row.language === 'hi' ? 'hi' : row.language === 'en' ? 'en' : batchFallbackLanguage,
        };
      } else {
        recipient = fallbackRecipients[i]!;
      }

      const smsResult = await this.smsService.sendInviteSms({
        phone: recipient.phone,
        language: recipient.language,
      });

      if (smsResult.success) {
        if (this.supabase && recipient.id) {
          const writeRes = await this.supabase
            .from('invitations')
            .update({
              status: 'sent',
              ...(smsResult.messageId ? { provider_message_id: smsResult.messageId } : {}),
            })
            .eq('id', recipient.id);
          if (writeRes && 'error' in writeRes && writeRes.error) {
            throw new Error(`INVITE_STATUS_WRITE_FAILED: ${writeRes.error.message}`);
          }
        }
        sentCount++;
      } else {
        if (this.supabase && recipient.id) {
          const writeRes = await this.supabase
            .from('invitations')
            .update({ status: 'failed' })
            .eq('id', recipient.id);
          if (writeRes && 'error' in writeRes && writeRes.error) {
            throw new Error(`INVITE_STATUS_WRITE_FAILED: ${writeRes.error.message}`);
          }
        }
        failedCount++;
      }

      if (typeof job.updateProgress === 'function' && (i % 25 === 0 || i === maxIterations - 1)) {
        await job.updateProgress({
          dispatched: sentCount,
          total: waveSize,
          percent: Math.round(((sentCount + failedCount) / waveSize) * 100),
        });
      }
    }

    const actualCostInr = Math.round(sentCount * costPerSmsInr * 100) / 100;

    // Verify wave wasn't failed or queued while processing the final chunk
    if (this.supabase) {
      const { data: finalCheck } = await this.supabase
        .from('invite_waves')
        .select('status')
        .eq('id', waveId)
        .maybeSingle();

      if (finalCheck && (finalCheck.status === 'failed' || finalCheck.status === 'queued')) {
        return {
          waveId,
          batchId,
          waveSize,
          sentCount,
          failedCount,
          totalCostInr: actualCostInr,
          status: finalCheck.status,
        };
      }
    }

    // 4. Update invite_waves row with final counts and status
    const finalWaveRes = await this.supabase
      .from('invite_waves')
      .update({
        status: 'completed',
        sent_count: sentCount,
        failed_count: failedCount,
        total_cost_inr: actualCostInr,
        completed_at: new Date().toISOString(),
      })
      .eq('id', waveId);
    if (finalWaveRes && 'error' in finalWaveRes && finalWaveRes.error) {
      throw new Error(`INVITE_WAVE_WRITE_FAILED: ${finalWaveRes.error.message}`);
    }

    if (typeof job.updateProgress === 'function') {
      await job.updateProgress(100);
    }

      return {
        waveId,
        batchId,
        waveSize,
        sentCount,
        failedCount,
        totalCostInr: actualCostInr,
        status: 'completed',
      };
    } finally {
      if (renewalInterval) {
        clearInterval(renewalInterval);
        renewalInterval = null;
      }
      if (acquiredBatchLock && this.redis) {
        const releaseScript = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        try {
          await this.redis.eval(releaseScript, 1, batchLockKey, lockToken);
        } catch (releaseErr) {
          console.warn('[InviteProcessor] Failed to release batch lock via Lua:', releaseErr);
        }
      }
    }
  }
}

export const inviteProcessor = new InviteProcessor();
export const inviteWaveProcessor = (job: Job<InviteWaveJobData>) => inviteProcessor.process(job);
