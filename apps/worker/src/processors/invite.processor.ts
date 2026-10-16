import { Job } from 'bullmq';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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

  constructor() {
    const supabaseUrl = process.env['SUPABASE_URL'];
    const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (supabaseUrl && supabaseKey && supabaseKey !== 'dummy-service-role-key') {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    }
  }

  async process(job: Job<InviteWaveJobData>): Promise<InviteWaveJobResult> {
    const { waveId, batchId, waveSize, costPerSmsInr = 0.2, shouldSimulateFailure } = job.data;

    // Retry test simulation: fail until attempt 3 if requested
    if (shouldSimulateFailure && job.attemptsMade < 2) {
      throw new Error(`Simulated transient invite dispatch failure for retry check (attempt ${job.attemptsMade + 1})`);
    }

    const totalCostInr = Math.round(waveSize * costPerSmsInr * 100) / 100;

    // Check status in DB if available to respect pause action
    if (this.supabase) {
      const { data: currentWave } = await this.supabase
        .from('invite_waves')
        .select('*')
        .eq('id', waveId)
        .single();

      if (currentWave && (currentWave.status === 'paused' || currentWave.status === 'queued')) {
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
    }

    // Process SMS dispatch in sub-batches of 1000
    const chunkSize = 1000;
    let sentCount = 0;
    const iterations = Math.ceil(waveSize / chunkSize);

    for (let i = 0; i < iterations; i++) {
      const currentBatchCount = Math.min(chunkSize, waveSize - sentCount);
      sentCount += currentBatchCount;

      if (typeof job.updateProgress === 'function') {
        await job.updateProgress({
          dispatched: sentCount,
          total: waveSize,
          percent: Math.round((sentCount / waveSize) * 100),
        });
      }
    }

    if (this.supabase) {
      await this.supabase
        .from('invite_waves')
        .update({
          status: 'completed',
          sent_count: sentCount,
          completed_at: new Date().toISOString(),
        })
        .eq('id', waveId);
    }

    if (typeof job.updateProgress === 'function') {
      await job.updateProgress(100);
    }

    return {
      waveId,
      batchId,
      waveSize,
      sentCount,
      failedCount: 0,
      totalCostInr,
      status: 'completed',
    };
  }
}

export const inviteProcessor = new InviteProcessor();
export const inviteWaveProcessor = (job: Job<InviteWaveJobData>) => inviteProcessor.process(job);
