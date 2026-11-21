import { Injectable, Inject, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PaymentRow } from '@indian-job-portal/database';
import { SUPABASE_CLIENT } from '../supabase.provider.js';

export type SettlePaymentStatus =
  | 'settled'
  | 'already_settled'
  | 'duplicate_capture'
  | 'duplicate_event'
  | 'amount_mismatch'
  | 'unknown_order'
  | 'precondition_failed';

export interface SettlePaymentResult {
  status: SettlePaymentStatus;
  payment_id?: string;
  purpose?: string;
}

@Injectable()
export class PaymentRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient<Database>) {}

  async create(record: Partial<PaymentRow> & {
    user_id: string;
    gateway_order_id: string;
    amount_paise: number;
    purpose: string;
  }): Promise<PaymentRow> {
    const insertPayload: Record<string, unknown> = {
      id: record.id || crypto.randomUUID(),
      user_id: record.user_id,
      gateway_order_id: record.gateway_order_id,
      gateway_payment_id: record.gateway_payment_id ?? null,
      gateway_signature: record.gateway_signature ?? null,
      pack_id: record.pack_id ?? null,
      credits_added: record.credits_added ?? 0,
      credits_to_grant: record.credits_to_grant ?? 0,
      amount_paise: record.amount_paise,
      amount_inr: record.amount_inr ?? Number((record.amount_paise / 100).toFixed(2)),
      currency: record.currency ?? 'INR',
      purpose: record.purpose,
      order_snapshot: record.order_snapshot ?? {},
      billing_state_code: record.billing_state_code ?? null,
      terms_version: record.terms_version ?? null,
      status: record.status ?? 'created',
      metadata: record.metadata ?? {},
      created_at: record.created_at ?? new Date().toISOString(),
      updated_at: record.updated_at ?? new Date().toISOString(),
    };

    const { data, error } = await this.supabase
      .from('payments')
      .insert(insertPayload as unknown as PaymentRow)
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        `Database persistence failure for payment: ${error?.message || 'unknown error'}`,
      );
    }

    return data as unknown as PaymentRow;
  }

  async findById(id: string): Promise<PaymentRow | null> {
    const { data, error } = await this.supabase
      .from('payments')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
    }
    return (data as unknown as PaymentRow) || null;
  }

  async findByGatewayOrderId(orderId: string): Promise<PaymentRow | null> {
    const { data, error } = await this.supabase
      .from('payments')
      .select('*')
      .eq('gateway_order_id', orderId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
    }
    return (data as unknown as PaymentRow) || null;
  }

  async findByGatewayPaymentId(paymentId: string): Promise<PaymentRow | null> {
    const { data, error } = await this.supabase
      .from('payments')
      .select('*')
      .eq('gateway_payment_id', paymentId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
    }
    return (data as unknown as PaymentRow) || null;
  }

  async updateStatus(
    orderId: string,
    status: PaymentRow['status'],
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const existing = await this.findByGatewayOrderId(orderId);
    if (!existing) return;
    const mergedMeta = { ...(existing.metadata ?? {}), ...(metadata ?? {}) };
    await this.supabase
      .from('payments')
      .update({
        status,
        metadata: mergedMeta,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  }

  async findByUserId(userId: string): Promise<PaymentRow[]> {
    const { data, error } = await this.supabase
      .from('payments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
    }
    return (data as unknown as PaymentRow[]) || [];
  }

  async findInvoicesByPaymentIds(
    paymentIds: string[],
  ): Promise<Database['public']['Tables']['invoices']['Row'][]> {
    if (paymentIds.length === 0) return [];
    const { data, error } = await this.supabase
      .from('invoices')
      .select('*')
      .in('payment_id', paymentIds)
      .order('issued_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
    }
    return data || [];
  }

  /**
   * Invokes public.rpc_apply_refund with server-verified refund facts.
   */
  async applyRefund(params: {
    gatewayPaymentId: string;
    gatewayRefundId: string;
    refundPaise: number;
    eventId?: string | null;
  }): Promise<Record<string, unknown> | null> {
    const { data, error } = await (this.supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>)(
      'rpc_apply_refund',
      {
        p_gateway_payment_id: params.gatewayPaymentId,
        p_gateway_refund_id: params.gatewayRefundId,
        p_refund_paise: params.refundPaise,
        p_event_id: params.eventId ?? null,
      },
    );

    if (error) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
    }
    return data;
  }

  /**
   * Invokes public.rpc_record_dispute to log anomaly DISPUTE_OPENED.
   */
  async recordDispute(params: {
    gatewayPaymentId: string;
    disputeId: string;
    amountPaise: number;
    reason?: string | null;
    eventId?: string | null;
  }): Promise<Record<string, unknown> | null> {
    const { data, error } = await (this.supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>)(
      'rpc_record_dispute',
      {
        p_gateway_payment_id: params.gatewayPaymentId,
        p_dispute_id: params.disputeId,
        p_amount_paise: params.amountPaise,
        p_reason: params.reason ?? null,
        p_event_id: params.eventId ?? null,
      },
    );

    if (error) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
    }
    return data;
  }

  /**
   * Invokes public.rpc_settle_payment with server-verified payment facts.
   * Atomic settlement and idempotency enforced at PostgreSQL transaction level.
   */
  async settlePayment(params: {
    gatewayOrderId: string;
    gatewayPaymentId: string;
    amountPaise: number;
    currency: string;
    method: string;
    eventId?: string | null;
    source: string;
  }): Promise<SettlePaymentResult> {
    const { data, error } = await (this.supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: SettlePaymentResult | null; error: { message: string } | null }>)(
      'rpc_settle_payment',
      {
        p_gateway_order_id: params.gatewayOrderId,
        p_gateway_payment_id: params.gatewayPaymentId,
        p_amount_paise: params.amountPaise,
        p_currency: params.currency,
        p_method: params.method,
        p_event_id: params.eventId ?? null,
        p_source: params.source,
      },
    );

    if (error) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
    }

    if (!data || typeof data !== 'object') {
      throw new InternalServerErrorException('DATABASE_ERROR: Invalid response from settlement RPC');
    }

    return data;
  }
}
