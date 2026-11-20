import { Injectable, Inject, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PaymentRow } from '@indian-job-portal/database';
import { SUPABASE_CLIENT } from '../supabase.provider.js';
import { captureException } from '../../config/sentry.js';

@Injectable()
export class PaymentRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient<Database>) {}

  async create(record: PaymentRow): Promise<PaymentRow> {
    const { error } = await this.supabase.from('payments').insert({
      id: record.id,
      user_id: record.user_id,
      gateway_order_id: record.gateway_order_id,
      gateway_payment_id: record.gateway_payment_id ?? null,
      gateway_signature: record.gateway_signature ?? null,
      pack_id: record.pack_id ?? null,
      credits_added: record.credits_added ?? 0,
      amount_inr: record.amount_inr,
      tax_amount_inr: record.tax_amount_inr ?? 0,
      currency: record.currency ?? 'INR',
      invoice_number: record.invoice_number ?? null,
      status: record.status,
      metadata: record.metadata ?? {},
      processed_at: record.processed_at ?? null,
      processed_by: record.processed_by ?? null,
      created_at: record.created_at,
      updated_at: record.updated_at ?? record.created_at,
    });

    if (error) {
      captureException(new Error(error.message));
      throw new InternalServerErrorException(`Database persistence failure for payment: ${error.message}`);
    }

    return record;
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

  async transitionToCaptured(
    id: string,
    updates: {
      gateway_payment_id: string;
      gateway_signature?: string | null;
      invoice_number: string;
      processed_at: string;
      processed_by: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<{ updated: PaymentRow | null; alreadyCaptured: boolean; payment: PaymentRow | null }> {
    const existing = await this.findById(id);
    if (!existing) {
      return { updated: null, alreadyCaptured: false, payment: null };
    }

    if (existing.status === 'captured') {
      return { updated: null, alreadyCaptured: true, payment: existing };
    }

    if (existing.status !== 'created' && existing.status !== 'authorized') {
      return { updated: null, alreadyCaptured: false, payment: existing };
    }

    const { data, error } = await this.supabase
      .from('payments')
      .update({
        gateway_payment_id: updates.gateway_payment_id,
        gateway_signature: updates.gateway_signature ?? existing.gateway_signature,
        invoice_number: updates.invoice_number,
        status: 'captured',
        processed_at: updates.processed_at,
        processed_by: updates.processed_by,
        metadata: updates.metadata ?? existing.metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .in('status', ['created', 'authorized'])
      .select()
      .maybeSingle();

    if (error || !data) {
      const refetched = await this.findById(id);
      return {
        updated: null,
        alreadyCaptured: refetched?.status === 'captured',
        payment: refetched,
      };
    }

    const updatedRow = data as unknown as PaymentRow;
    return { updated: updatedRow, alreadyCaptured: false, payment: updatedRow };
  }

  async update(id: string, updates: Partial<PaymentRow>): Promise<PaymentRow> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error(`Payment with ID ${id} not found`);
    }

    const { data, error } = await this.supabase
      .from('payments')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error || !data) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error?.message || 'Update failed'}`);
    }

    return data as unknown as PaymentRow;
  }
}
