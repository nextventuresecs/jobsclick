import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { paymentSettlementResultSchema, type PaymentSettlementResult, type VerifiedPaymentSettlementInput } from '@indian-job-portal/validation';
import type { PaymentGrantRow } from '@indian-job-portal/database';
import { Injectable, Inject, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PaymentRow } from '@indian-job-portal/database';
import { SUPABASE_CLIENT, PersistentDatabaseStore } from '../supabase.provider.js';
import { captureException } from '../../config/sentry.js';

@Injectable()
export class PaymentRepository {
  private persistentStore = PersistentDatabaseStore.getInstance();
  private isTestMode =
    process.env['NODE_ENV'] !== 'production' &&
    (process.env['NODE_ENV'] === 'test' ||
      !process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
      process.env['SUPABASE_SERVICE_ROLE_KEY'] === 'dummy-service-role-key');

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient<Database>) {}

  async settleCapturedPayment(input: VerifiedPaymentSettlementInput, testTransaction: () => Promise<PaymentSettlementResult>): Promise<PaymentSettlementResult> {
    if (this.isTestMode) return this.persistentStore.withFinancialTransaction(testTransaction);
    const { data, error } = await this.supabase.rpc('rpc_settle_payment', { p_order: input.order_id, p_gateway: input.id,
      p_amount_paise: input.amount, p_currency: input.currency, p_invoice: input.invoice, p_signature: input.signature ?? null, p_processed_by: input.processedBy });
    if (error) {
      if (/^(?:PAYMENT_[A-Z_]+|SPONSORSHIP_[A-Z_]+|DUPLICATE_PAYMENT_CLAIM)$/.test(error.message)) throw new BadRequestException(error.message);
      throw new ServiceUnavailableException('PAYMENT_TRANSACTION_UNAVAILABLE');
    }
    return paymentSettlementResultSchema.parse(data);
  }
  findTestPaymentGrant(paymentId: string): PaymentGrantRow | undefined {
    if (!this.isTestMode) throw new Error('TEST_ADAPTER_ONLY');
    return this.persistentStore.getTable<PaymentGrantRow>('payment_grants')[paymentId];
  }
  saveTestPaymentGrant(row: PaymentGrantRow): void {
    if (!this.isTestMode) throw new Error('TEST_ADAPTER_ONLY');
    this.persistentStore.setRow('payment_grants', row.payment_id, row);
  }

  async create(record: PaymentRow): Promise<PaymentRow> {
    if (this.isTestMode) {
      this.persistentStore.setRow('payments', record.id, record);
      return record;
    }

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
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('payments')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (error) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        return (data as unknown as PaymentRow) || null;
      } catch (err) {
        if (process.env['NODE_ENV'] === 'production' || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
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

        if (error) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        return (data as unknown as PaymentRow) || null;
      } catch (err) {
        if (process.env['NODE_ENV'] === 'production' || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
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

        if (error) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        return (data as unknown as PaymentRow) || null;
      } catch (err) {
        if (process.env['NODE_ENV'] === 'production' || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
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

        if (error) {
          throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
        }
        return (data as unknown as PaymentRow[]) || [];
      } catch (err) {
        if (process.env['NODE_ENV'] === 'production' || err instanceof InternalServerErrorException) {
          throw err instanceof InternalServerErrorException ? err : new InternalServerErrorException('DATABASE_ERROR');
        }
      }
    }

    const table = this.persistentStore.getTable<PaymentRow>('payments');
    return Object.values(table)
      .filter((p) => p.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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
    return this.persistentStore.withLock(`payment_${id}`, async () => {
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

      const updatedRow: PaymentRow = {
        ...existing,
        gateway_payment_id: updates.gateway_payment_id,
        gateway_signature: updates.gateway_signature ?? existing.gateway_signature,
        invoice_number: updates.invoice_number,
        status: 'captured',
        processed_at: updates.processed_at,
        processed_by: updates.processed_by,
        metadata: updates.metadata ?? existing.metadata,
        updated_at: new Date().toISOString(),
      };

      // 1. Supabase conditional update WHERE id = id AND (status = 'created' OR status = 'authorized')
      if (!this.isTestMode) {
        try {
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
              updated_at: updatedRow.updated_at,
            })
            .eq('id', id)
            .in('status', ['created', 'authorized'])
            .select()
            .maybeSingle();

          if (error || !data) {
            // Check if it was captured concurrently
            const refetched = await this.findById(id);
            return {
              updated: null,
              alreadyCaptured: refetched?.status === 'captured',
              payment: refetched,
            };
          }
        } catch (err) {
          if (process.env['NODE_ENV'] === 'production') {
            throw new InternalServerErrorException(`Database error during payment capture: ${(err as Error).message}`);
          }
        }
      }

      // 2. Synchronize to persistent store in test mode
      if (this.isTestMode) {
        this.persistentStore.setRow('payments', id, updatedRow);
      }
      return { updated: updatedRow, alreadyCaptured: false, payment: updatedRow };
    });
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

    if (this.isTestMode) {
      this.persistentStore.setRow('payments', id, updated);
      return updated;
    }

    const { error } = await this.supabase.from('payments').update(updates).eq('id', id);
    if (error) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
    }

    return updated;
  }
}
