import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, CreditLedgerRow } from '@indian-job-portal/database';
import { SUPABASE_CLIENT, PersistentDatabaseStore } from '../supabase.provider.js';

@Injectable()
export class CreditLedgerRepository {
  private persistentStore = PersistentDatabaseStore.getInstance();
  private isTestMode =
    process.env['NODE_ENV'] === 'test' ||
    !process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
    process.env['SUPABASE_SERVICE_ROLE_KEY'] === 'dummy-service-role-key';

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient<Database>) {}

  async append(record: CreditLedgerRow): Promise<CreditLedgerRow> {
    // 1. Always persist to resilient local state
    this.persistentStore.setRow('credit_ledgers', record.id, record);

    // 2. Persist to Supabase PostgreSQL table credit_ledgers
    if (!this.isTestMode) {
      try {
        await this.supabase.from('credit_ledgers').insert({
          id: record.id,
          user_id: record.user_id,
          amount: record.amount,
          reason: record.reason,
          actor_id: record.actor_id ?? null,
          created_at: record.created_at,
        });
      } catch {
        // Maintained in local persistent store if remote DB unreachable
      }
    }

    return record;
  }

  async findByUserId(userId: string): Promise<CreditLedgerRow[]> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await this.supabase
          .from('credit_ledgers')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          return data as unknown as CreditLedgerRow[];
        }
      } catch {
        // Fall back to persistent local store
      }
    }

    const table = this.persistentStore.getTable<CreditLedgerRow>('credit_ledgers');
    return Object.values(table)
      .filter((entry) => entry.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // Hard Invariant #7 & WAL-01: Balance is dynamically calculated from ledger entries
  async calculateBalance(userId: string): Promise<{ balance: number; creditsAdded: number; creditsUsed: number }> {
    const entries = await this.findByUserId(userId);

    let creditsAdded = 0;
    let creditsUsed = 0;

    for (const entry of entries) {
      if (entry.amount > 0) {
        creditsAdded += entry.amount;
      } else if (entry.amount < 0) {
        creditsUsed += Math.abs(entry.amount);
      }
    }

    const balance = creditsAdded - creditsUsed;

    return {
      balance,
      creditsAdded,
      creditsUsed,
    };
  }

  // Hard Invariant #7: Ledger entries are immutable (no UPDATE or DELETE)
  async update(_id: string, _updates: Partial<CreditLedgerRow>): Promise<never> {
    throw new BadRequestException('Credit ledger entries are immutable and cannot be updated or deleted');
  }

  async delete(_id: string): Promise<never> {
    throw new BadRequestException('Credit ledger entries are immutable and cannot be updated or deleted');
  }
}
