import { Injectable, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PaymentRow } from '@indian-job-portal/database';
import { SUPABASE_CLIENT, PersistentDatabaseStore } from '../supabase.provider.js';

@Injectable()
export class PaymentRepository {
  private persistentStore = PersistentDatabaseStore.getInstance();
  private isTestMode =
    process.env['NODE_ENV'] === 'test' ||
    !process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
    process.env['SUPABASE_SERVICE_ROLE_KEY'] === 'dummy-service-role-key';

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient<Database>) {}

  async create(record: PaymentRow): Promise<PaymentRow> {
    // 1. Persist to local store
    this.persistentStore.setRow('payments', record.id, record);

    // 2. Persist to Supabase if live credentials available
    if (!this.isTestMode) {
      try {
        await this.supabase.from('payments').insert({
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
          created_at: record.created_at,
          updated_at: record.updated_at ?? record.created_at,
        });
      } catch {
        // Fallback maintained in persistentStore
      }
    }

    return record;
  }

  async findById(id: string): Promise<PaymentRow | null> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('payments')
          .select('*')
          .eq('id', id)
          .single();

        if (!error && data) {
          return data as unknown as PaymentRow;
        }
      } catch {
        // Fallback
      }
    }

    const table = this.persistentStore.getTable<PaymentRow>('payments');
    return table[id] ?? null;
  }

  async findByGatewayOrderId(orderId: string): Promise<PaymentRow | null> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('payments')
          .select('*')
          .eq('gateway_order_id', orderId)
          .maybeSingle();

        if (!error && data) {
          return data as unknown as PaymentRow;
        }
      } catch {
        // Fallback
      }
    }

    const table = this.persistentStore.getTable<PaymentRow>('payments');
    const match = Object.values(table).find((p) => p.gateway_order_id === orderId);
    return match ?? null;
  }

  async findByGatewayPaymentId(paymentId: string): Promise<PaymentRow | null> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('payments')
          .select('*')
          .eq('gateway_payment_id', paymentId)
          .maybeSingle();

        if (!error && data) {
          return data as unknown as PaymentRow;
        }
      } catch {
        // Fallback
      }
    }

    const table = this.persistentStore.getTable<PaymentRow>('payments');
    const match = Object.values(table).find((p) => p.gateway_payment_id === paymentId);
    return match ?? null;
  }

  async findByUserId(userId: string): Promise<PaymentRow[]> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('payments')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          return data as unknown as PaymentRow[];
        }
      } catch {
        // Fallback
      }
    }

    const table = this.persistentStore.getTable<PaymentRow>('payments');
    return Object.values(table)
      .filter((p) => p.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  async update(id: string, updates: Partial<PaymentRow>): Promise<PaymentRow> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error(`Payment with ID ${id} not found`);
    }

    const updated: PaymentRow = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    this.persistentStore.setRow('payments', id, updated);

    if (!this.isTestMode) {
      try {
        await this.supabase.from('payments').update(updates).eq('id', id);
      } catch {
        // Fallback
      }
    }

    return updated;
  }
}
