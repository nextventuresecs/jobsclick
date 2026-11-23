import { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import IORedis from 'ioredis';
import IORedisMock from 'ioredis-mock';
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
        this.redis = new (IORedisMock as unknown as typeof IORedis)() as IORedis;
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
          // Bounded total wait tracking via Redis counter
          const delayKey = `lock:invite-batch-delays:${batchId}:${lockToken}`;
          const delayAttempts = await this.redis.incr(delayKey);
          await this.redis.expire(delayKey, 600);

          const MAX_DELAY_ATTEMPTS = 5;
          if (delayAttempts > MAX_DELAY_ATTEMPTS) {
            console.error(`[InviteProcessor] Bounded wait exceeded for batch ${batchId} (attempt ${delayAttempts}/${MAX_DELAY_ATTEMPTS}). Failing.`);
            throw new Error(`INVITE_BATCH_LOCK_TIMEOUT: Maximum wait exceeded while waiting for batch ${batchId} lock`);
          }

          console.log(`[InviteProcessor] Batch ${batchId} is currently locked by another active wave job. Delaying job ${lockToken} (attempt ${delayAttempts}/${MAX_DELAY_ATTEMPTS}).`);
          const jobWithDelayed = job as unknown as { moveToDelayed?: (timestamp: number, token?: string) => Promise<void>; token?: string };
          if (typeof jobWithDelayed?.moveToDelayed === 'function') {
            try {
              await jobWithDelayed.moveToDelayed(Date.now() + 5000, jobWithDelayed.token);
            } catch {
              // best-effort
            }
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
        if (redisErr instanceof Error && (redisErr.message.includes('INVITE_BATCH_LOCK_TIMEOUT') || redisErr.message.includes('INVITE_REDIS_LOCK_UNAVAILABLE'))) {
          throw redisErr;
        }
        if (isStrictEnv()) throw redisErr;
        console.warn('[InviteProcessor] Redis batch lock error:', redisErr);
      }
    }

    try {
      await this.supabase
        .from('invite_waves')
        .update({
          status: 'processing',
          total_cost_inr: totalCostInr,
        })
        .eq('id', waveId);

    const alreadySent = currentWave.sent_count || 0;
    const remainingWaveSize = Math.max(0, waveSize - alreadySent);

    if (remainingWaveSize === 0) {
      await this.supabase
        .from('invite_waves')
        .update({
          status: 'completed',
          sent_count: alreadySent,
          failed_count: currentWave.failed_count || 0,
          completed_at: new Date().toISOString(),
        })
        .eq('id', waveId);

      return {
        waveId,
        batchId,
        waveSize,
        sentCount: alreadySent,
        failedCount: currentWave.failed_count || 0,
        totalCostInr,
        status: 'completed',
      };
    }

    // 2. Select strictly pending invitations scoped to this batchId
    // Never fall back to global users or synthetic phone numbers (P0-6 fix)
    const { data: invitations, error: invitationError } = await this.supabase
      .from('invitations')
      .select('id, phone')
      .eq('batch_id', batchId)
      .eq('status', 'pending')
      .not('phone', 'is', null)
      .limit(remainingWaveSize);

    if (invitationError || !invitations) throw new Error('INVITE_RECIPIENT_LOOKUP_FAILED');

    const recipients = invitations
      .filter((inv) => Boolean(inv.phone))
      .map((inv) => ({
        id: inv.id as string,
        phone: inv.phone as string,
        language: 'en' as const,
      }));

    let sentCount = alreadySent;
    let failedCount = currentWave.failed_count || 0;

    // 3. Send SMS 1:1 per recipient with per-recipient status tracking
    for (let i = 0; i < recipients.length && sentCount < waveSize; i++) {
      if (lockLost) {
        console.warn(`[InviteProcessor] Lock lost mid-run for batch ${batchId}, wave ${waveId}. Aborting wave.`);
        await this.supabase
          .from('invite_waves')
          .update({
            status: 'failed',
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
          status: 'failed',
        };
      }
      // Re-read wave status and lock ownership between sends (every 5 items) to stop if wave was paused/cancelled or lock lost
      if (i > 0 && (i % 5 === 0 || i % 25 === 0)) {
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

      const recipient = recipients[i]!;
      const smsResult = await this.smsService.sendInviteSms({
        phone: recipient.phone,
        language: recipient.language,
      });

      if (smsResult.success) {
        sentCount++;
        if (this.supabase && recipient.id) {
          try {
            await this.supabase
              .from('invitations')
              .update({ status: 'sent' })
              .eq('id', recipient.id);
          } catch {
            // best-effort
          }
        }
      } else {
        failedCount++;
        if (this.supabase && recipient.id) {
          try {
            await this.supabase
              .from('invitations')
              .update({ status: 'failed' })
              .eq('id', recipient.id);
          } catch {
            // best-effort
          }
        }
      }

      if (typeof job.updateProgress === 'function' && (i % 25 === 0 || i === recipients.length - 1)) {
        await job.updateProgress({
          dispatched: sentCount,
          total: waveSize,
          percent: Math.round(((sentCount + failedCount) / waveSize) * 100),
        });
      }
    }

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
          totalCostInr,
          status: finalCheck.status,
        };
      }
    }

    // 4. Update invite_waves row with final counts and status
    await this.supabase
      .from('invite_waves')
      .update({
        status: 'completed',
        sent_count: sentCount,
        failed_count: failedCount,
        completed_at: new Date().toISOString(),
      })
      .eq('id', waveId);

    if (typeof job.updateProgress === 'function') {
      await job.updateProgress(100);
    }

      return {
        waveId,
        batchId,
        waveSize,
        sentCount,
        failedCount,
        totalCostInr,
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
