import { Job } from 'bullmq';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@indian-job-portal/database';
import { captureException, captureMessage } from '../config/sentry.js';

export interface RefundJobData {
  gatewayPaymentId: string;
  gatewayRefundId: string;
  refundPaise: number;
  eventId?: string;
  isDispute?: boolean;
  disputeId?: string;
  disputeReason?: string;
}

export interface RefundJobResult {
  status: string;
  refundId?: string;
  paymentId?: string;
}

export class RefundService {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async processRefund(data: RefundJobData): Promise<RefundJobResult> {
    // If it's a dispute event
    if (data.isDispute && data.disputeId) {
      captureMessage(`Dispute opened on payment ${data.gatewayPaymentId}: ${data.disputeId}`, 'warning');

      const { data: rpcRes, error } = await (this.supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: { status: string; dispute_id: string } | null; error: { message: string } | null }>)(
        'rpc_record_dispute',
        {
          p_gateway_payment_id: data.gatewayPaymentId,
          p_dispute_id: data.disputeId,
          p_amount_paise: data.refundPaise,
          p_reason: data.disputeReason ?? null,
          p_event_id: data.eventId ?? null,
        },
      );

      if (error) {
        captureException(new Error(`Dispute RPC failed: ${error.message}`));
        throw new Error(error.message);
      }

      return { status: rpcRes?.status || 'dispute_recorded' };
    }

    // Process regular refund
    const { data: rpcRes, error } = await (this.supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: {
        status: string;
        refund_id?: string;
        payment_id?: string;
        credits_reversed?: number;
        unrecovered_credits?: number;
      } | null;
      error: { message: string } | null;
    }>)('rpc_apply_refund', {
      p_gateway_payment_id: data.gatewayPaymentId,
      p_gateway_refund_id: data.gatewayRefundId,
      p_refund_paise: data.refundPaise,
      p_event_id: data.eventId ?? null,
    });

    if (error) {
      captureException(new Error(`Refund RPC failed: ${error.message}`));
      throw new Error(error.message);
    }

    if (!rpcRes) {
      throw new Error('Empty response from rpc_apply_refund');
    }

    if (rpcRes.status === 'applied') {
      console.log(
        JSON.stringify({
          event: 'refund_applied',
          paymentId: rpcRes.payment_id,
          refundId: rpcRes.refund_id,
          creditsReversed: rpcRes.credits_reversed,
          unrecoveredCredits: rpcRes.unrecovered_credits,
        }),
      );
    }

    return {
      status: rpcRes.status,
      refundId: rpcRes.refund_id,
      paymentId: rpcRes.payment_id,
    };
  }
}

export async function refundProcessor(job: Job<RefundJobData>): Promise<RefundJobResult> {
  const supabaseUrl = process.env['SUPABASE_URL'] || 'http://127.0.0.1:54321';
  const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] || process.env['SUPABASE_KEY'] || '';
  const supabase = createClient<Database>(supabaseUrl, supabaseKey);

  const service = new RefundService(supabase);
  return service.processRefund(job.data);
}
