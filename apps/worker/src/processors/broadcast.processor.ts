import { Job } from 'bullmq';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface BroadcastRecipient {
  businessProfileId: string;
  phone: string;
  idempotencyKey: string;
}

export interface BroadcastBatchJobData {
  campaignId: string;
  batchIndex: number;
  totalBatches: number;
  recipients: BroadcastRecipient[];
  templateId: string;
  variables: Record<string, string>;
  shouldSimulateFailure?: boolean;
}

export interface BroadcastBatchJobResult {
  campaignId: string;
  batchIndex: number;
  processedCount: number;
  sentCount: number;
  failedCount: number;
  status: 'completed' | 'failed';
}

export class BroadcastProcessor {
  private supabase: SupabaseClient | null = null;
  private processedIdempotencyKeys = new Set<string>();

  constructor() {
    const supabaseUrl = process.env['SUPABASE_URL'];
    const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (supabaseUrl && supabaseKey && supabaseKey !== 'dummy-service-role-key') {
      this.supabase = createClient(supabaseUrl, supabaseKey);
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

  async process(job: Job<BroadcastBatchJobData>): Promise<BroadcastBatchJobResult> {
    const { campaignId, batchIndex, recipients, templateId, variables, shouldSimulateFailure } = job.data;

    // Retry test simulation: fail until attempt 3 if requested
    if (shouldSimulateFailure && job.attemptsMade < 2) {
      throw new Error(`Simulated transient broadcast gateway failure for retry verification (attempt ${job.attemptsMade + 1})`);
    }

    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of recipients) {
      const { businessProfileId, phone, idempotencyKey } = recipient;

      // 1. In-memory / DB idempotency check (Hard Invariant #4)
      if (this.processedIdempotencyKeys.has(idempotencyKey)) {
        console.log(`[BroadcastProcessor] Skipping duplicate delivery for idempotencyKey=${idempotencyKey}`);
        sentCount++;
        continue;
      }

      if (this.supabase) {
        const { data: existing } = await this.supabase
          .from('broadcast_deliveries')
          .select('id, status')
          .eq('idempotency_key', idempotencyKey)
          .single();

        if (existing && existing.status === 'sent') {
          console.log(`[BroadcastProcessor] Idempotency match in DB: delivery ${existing.id} already sent.`);
          this.processedIdempotencyKeys.add(idempotencyKey);
          sentCount++;
          continue;
        }
      }

      // 2. Gateway dispatch (MSG91 or Mock)
      const maskedPhone = this.maskPhone(phone);
      const isTestMode =
        process.env['NODE_ENV'] === 'test' ||
        Boolean(process.env['VITEST']) ||
        !process.env['MSG91_AUTH_KEY'] ||
        process.env['MSG91_AUTH_KEY'] === 'dummy-msg91-key';

      try {
        let gatewayMsgId = `mock_gw_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        if (!isTestMode) {
          // Live gateway invocation
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

        // 3. Record successful delivery
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

    // 4. Update campaign overall status in DB if last batch
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
      failedCount,
      status: 'completed',
    };
  }
}

export const broadcastProcessor = async (job: Job<BroadcastBatchJobData>): Promise<BroadcastBatchJobResult> => {
  const processor = new BroadcastProcessor();
  return processor.process(job);
};
