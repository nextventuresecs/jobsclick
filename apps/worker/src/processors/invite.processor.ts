import { Job } from 'bullmq';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
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
  status: 'completed' | 'queued' | 'failed';
}

export class InviteProcessor {
  private supabase: SupabaseClient | null = null;
  private smsService = new WorkerSmsService();

  constructor() {
    const supabaseUrl = process.env['SUPABASE_URL'];
    const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (supabaseUrl && supabaseKey && supabaseKey !== 'dummy-service-role-key') {
      this.supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
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

    if (currentWave.status === 'paused' || currentWave.status === 'queued') {
      console.log(`[InviteProcessor] Wave ${waveId} is currently paused/queued. Skipping dispatch.`);
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

    await this.supabase
      .from('invite_waves')
      .update({
        status: 'processing',
        total_cost_inr: totalCostInr,
      })
      .eq('id', waveId);

    // 2. Select strictly pending invitations scoped to this batchId
    // Never fall back to global users or synthetic phone numbers (P0-6 fix)
    const { data: invitations, error: invitationError } = await this.supabase
      .from('invitations')
      .select('id, phone')
      .eq('batch_id', batchId)
      .eq('status', 'pending')
      .not('phone', 'is', null)
      .limit(waveSize);

    if (invitationError || !invitations) throw new Error('INVITE_RECIPIENT_LOOKUP_FAILED');

    const recipients = invitations
      .filter((inv) => Boolean(inv.phone))
      .map((inv) => ({
        id: inv.id as string,
        phone: inv.phone as string,
        language: 'en' as const,
      }));

    let sentCount = 0;
    let failedCount = 0;

    // 3. Send SMS 1:1 per recipient with per-recipient status tracking
    for (let i = 0; i < recipients.length && i < waveSize; i++) {
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
  }
}

export const inviteProcessor = new InviteProcessor();
export const inviteWaveProcessor = (job: Job<InviteWaveJobData>) => inviteProcessor.process(job);
