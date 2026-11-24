import { Job } from 'bullmq';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@indian-job-portal/database';
import { captureException } from '../config/sentry.js';
import type { RazorpayGateway } from './gateway.js';

export interface ExpireOrdersJobData {
  olderThanHours?: number;
}

export interface ExpireOrdersJobResult {
  expiredCount: number;
}

export class ExpireOrdersService {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly gateway: RazorpayGateway,
  ) {}

  /**
   * Finds orders where status='created' and created_at < 48 hours ago with no captured payment.
   * Marks them 'expired'.
   */
  async expireOldCreatedOrders(olderThanHours = 48): Promise<number> {
    const cutoffDate = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();

    const { data: orders, error } = await this.supabase
      .from('payments')
      .select('id, gateway_order_id, user_id, created_at')
      .eq('status', 'created')
      .lt('created_at', cutoffDate);

    if (error) {
      captureException(new Error(`Expire orders query failed: ${error.message}`));
      throw new Error(`Database query failed: ${error.message}`);
    }

    let expiredCount = 0;

    for (const order of orders || []) {
      try {
        const payments = await this.gateway.listOrderPayments(order.gateway_order_id);
        const captured = payments.find((p) => p.status === 'captured');

        // Only expire if no captured payment exists
        if (!captured) {
          const { error: updateErr } = await this.supabase
            .from('payments')
            .update({ status: 'expired' })
            .eq('id', order.id)
            .eq('status', 'created');

          if (!updateErr) {
            expiredCount++;
            // Audit log
            await this.supabase.from('audit_logs').insert({
              actor_id: order.user_id,
              action: 'ORDER_EXPIRED',
              entity_type: 'payment',
              entity_id: order.id,
              metadata: { gateway_order_id: order.gateway_order_id },
              meta: { gateway_order_id: order.gateway_order_id },
            });
          }
        }
      } catch (err) {
        captureException(err instanceof Error ? err : new Error(String(err)));
      }
    }

    return expiredCount;
  }
}

export async function expireOrdersProcessor(
  job: Job<ExpireOrdersJobData>,
  customGateway?: RazorpayGateway,
): Promise<ExpireOrdersJobResult> {
  const supabaseUrl = process.env['SUPABASE_URL'] || 'http://127.0.0.1:54321';
  const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] || process.env['SUPABASE_KEY'] || '';
  const supabase = createClient<Database>(supabaseUrl, supabaseKey);

  const gateway: RazorpayGateway = customGateway || {
    keyId: process.env['RAZORPAY_KEY_ID'] || '',
    async createOrder() {
      throw new Error('Not implemented');
    },
    async fetchPayment() {
      throw new Error('Not implemented');
    },
    async listOrderPayments() {
      return [];
    },
    async fetchRefund() {
      throw new Error('Not implemented');
    },
  };

  const service = new ExpireOrdersService(supabase, gateway);
  const count = await service.expireOldCreatedOrders(job.data.olderThanHours);
  return { expiredCount: count };
}
