import { Job } from 'bullmq';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@indian-job-portal/database';
import { captureException, captureMessage } from '../config/sentry.js';
import type { RazorpayGateway } from './gateway.js';

export interface ReconcileJobData {
  runDailySummary?: boolean;
  minAgeMinutes?: number;
  maxAgeHours?: number;
}

export interface ReconcileJobResult {
  checkedOrders: number;
  settledOrders: number;
  anomaliesLogged: number;
  errors: number;
}

export class ReconcileService {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly gateway: RazorpayGateway,
  ) {}

  /**
   * Reconcile stuck created payments: checks gateway for captured payments
   * and invokes rpc_settle_payment with source = 'reconcile'.
   */
  async reconcileCreatedPayments(options: {
    minAgeMinutes?: number;
    maxAgeHours?: number;
  } = {}): Promise<{ checked: number; settled: number; anomalies: number; errors: number }> {
    const minAge = options.minAgeMinutes ?? 15;
    const maxAge = options.maxAgeHours ?? 48;

    const minDate = new Date(Date.now() - minAge * 60 * 1000).toISOString();
    const maxDate = new Date(Date.now() - maxAge * 60 * 60 * 1000).toISOString();

    const { data: payments, error } = await this.supabase
      .from('payments')
      .select('id, gateway_order_id, amount_paise, created_at, status')
      .eq('status', 'created')
      .lte('created_at', minDate)
      .gte('created_at', maxDate);

    if (error) {
      captureException(new Error(`Reconciliation query failed: ${error.message}`));
      throw new Error(`Database query failed: ${error.message}`);
    }

    let checked = 0;
    let settled = 0;
    let anomalies = 0;
    let errors = 0;

    for (const payment of payments || []) {
      checked++;
      try {
        const orderPayments = await this.gateway.listOrderPayments(payment.gateway_order_id);
        const captured = orderPayments.find((p) => p.status === 'captured');

        if (captured) {
          // Fetch full payment details from gateway
          const pDetails = await this.gateway.fetchPayment(captured.id);

          // Alert if order is older than 20 minutes and had captured payment at gateway
          const orderAgeMs = Date.now() - new Date(payment.created_at).getTime();
          if (orderAgeMs > 20 * 60 * 1000) {
            captureMessage(
              `Alert: Order ${payment.gateway_order_id} captured at gateway but unsettled for >20m`,
              'warning',
            );
          }

          // Atomic settlement via DB RPC
          const { data: rpcRes, error: rpcErr } = await (this.supabase.rpc as unknown as (
            fn: string,
            args: Record<string, unknown>,
          ) => Promise<{ data: { status: string; payment_id?: string } | null; error: { message: string } | null }>)(
            'rpc_settle_payment',
            {
              p_gateway_order_id: payment.gateway_order_id,
              p_gateway_payment_id: pDetails.id,
              p_amount_paise: pDetails.amountPaise,
              p_currency: pDetails.currency,
              p_method: pDetails.method,
              p_event_id: null,
              p_source: 'reconcile',
            },
          );

          if (rpcErr) {
            errors++;
            captureException(new Error(`Reconciliation settlement RPC failed: ${rpcErr.message}`));
          } else if (rpcRes?.status === 'settled') {
            settled++;
            console.log(
              JSON.stringify({
                event: 'reconciliation_settled',
                paymentId: payment.id,
                orderId: payment.gateway_order_id,
                source: 'reconcile',
                status: 'settled',
              }),
            );
          } else if (rpcRes?.status === 'already_settled') {
            // Already settled by concurrent webhook or verify
          } else {
            anomalies++;
          }
        }
      } catch (err) {
        errors++;
        captureException(err instanceof Error ? err : new Error(String(err)));
      }
    }

    return { checked, settled, anomalies, errors };
  }

  /**
   * Daily reconciliation check: sum of captured per day locally vs gateway report.
   * Logs anomaly RECONCILIATION_MISMATCH if different.
   */
  async checkDailyReconciliation(
    dateStr?: string,
    gatewayReportTotalPaise?: number,
  ): Promise<boolean> {
    const targetDate = dateStr ? new Date(dateStr) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0)).toISOString();
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999)).toISOString();

    const { data, error } = await this.supabase
      .from('payments')
      .select('amount_paise')
      .in('status', ['captured', 'partially_refunded', 'refunded'])
      .gte('settled_at', startOfDay)
      .lte('settled_at', endOfDay);

    if (error) {
      captureException(new Error(`Daily reconciliation query failed: ${error.message}`));
      return false;
    }

    const localTotalPaise = (data || []).reduce((acc, row) => acc + Number(row.amount_paise || 0), 0);

    if (gatewayReportTotalPaise !== undefined && localTotalPaise !== gatewayReportTotalPaise) {
      const delta = localTotalPaise - gatewayReportTotalPaise;
      captureMessage(`Daily reconciliation mismatch detected: delta ${delta} paise`, 'error');

      // Record anomaly
      await (this.supabase.from as unknown as (table: string) => {
        insert: (row: Record<string, unknown>) => Promise<unknown>;
      })('payment_anomalies').insert({
        kind: 'RECONCILIATION_MISMATCH',
        details: {
          date: startOfDay.slice(0, 10),
          local_total_paise: localTotalPaise,
          gateway_total_paise: gatewayReportTotalPaise,
          delta_paise: delta,
        },
      });

      return false;
    }

    return true;
  }
}

export async function reconcileProcessor(
  job: Job<ReconcileJobData>,
  customGateway?: RazorpayGateway,
): Promise<ReconcileJobResult> {
  const supabaseUrl = process.env['SUPABASE_URL'] || 'http://127.0.0.1:54321';
  const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] || process.env['SUPABASE_KEY'] || '';
  const supabase = createClient<Database>(supabaseUrl, supabaseKey);

  // Lazy-require or default gateway
  const gateway: RazorpayGateway = customGateway || {
    keyId: process.env['RAZORPAY_KEY_ID'] || '',
    async createOrder() {
      throw new Error('Not implemented in worker');
    },
    async fetchPayment() {
      throw new Error('Gateway not configured');
    },
    async listOrderPayments() {
      return [];
    },
    async fetchRefund() {
      throw new Error('Gateway not configured');
    },
  };

  const service = new ReconcileService(supabase, gateway);
  const { checked, settled, anomalies, errors } = await service.reconcileCreatedPayments({
    minAgeMinutes: job.data.minAgeMinutes,
    maxAgeHours: job.data.maxAgeHours,
  });

  if (job.data.runDailySummary) {
    await service.checkDailyReconciliation();
  }

  return {
    checkedOrders: checked,
    settledOrders: settled,
    anomaliesLogged: anomalies,
    errors,
  };
}
