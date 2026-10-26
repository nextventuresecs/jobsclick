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

  // Hard Invariant #7 & WAL-01: Balance is dynamically calculated from ledger entries via PostgreSQL aggregate (STF-10)
  async calculateBalance(userId: string): Promise<{ balance: number; creditsAdded: number; creditsUsed: number }> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await (this.supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{
          data: { balance: number; credits_added: number; credits_used: number } | null;
          error: { message: string } | null;
        }>)('get_user_credit_balance', { p_user_id: userId });

        if (!error && data) {
          return {
            balance: Number(data.balance ?? 0),
            creditsAdded: Number(data.credits_added ?? 0),
            creditsUsed: Number(data.credits_used ?? 0),
          };
        }
      } catch {
        // Fall back to persistent local store if remote DB unreachable
      }
    }

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

  // WAL-02 & Hard Invariant #7: Atomic job application credit deduction with TOCTOU lock
  async deductApplicationCreditAtomically(params: {
    applicantId: string;
    jobId: string;
    jobTitle?: string;
    cost: number;
    isSponsored?: boolean;
  }): Promise<{ success: boolean; remainingBalance: number; isSponsored: boolean }> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await (this.supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>)(
          'deduct_application_credit_with_ledger',
          {
            p_applicant_id: params.applicantId,
            p_job_id: params.jobId,
            p_job_title: params.jobTitle || params.jobId,
            p_cost: params.cost,
          },
        );

        if (error) {
          if (error.message.includes('INSUFFICIENT_CREDITS')) {
            throw new BadRequestException({
              statusCode: 400,
              code: 'INSUFFICIENT_CREDITS',
              message: 'Insufficient credits. Please recharge your credit wallet to continue applying.',
            });
          }
          throw new BadRequestException(error.message);
        }

        const res = data as { success: boolean; remaining_balance: number; is_sponsored: boolean };
        return {
          success: res.success,
          remainingBalance: res.remaining_balance,
          isSponsored: res.is_sponsored,
        };
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        // Fall back to local persistent store concurrency lock
      }
    }

    // Atomic execution with concurrency lock for local/test store (WAL-01 & Hard Invariant #7)
    return this.persistentStore.withLock(`wallet_${params.applicantId}`, async () => {
      const { balance } = await this.calculateBalance(params.applicantId);

      if (params.isSponsored) {
        return {
          success: true,
          remainingBalance: balance,
          isSponsored: true,
        };
      }

      if (balance < params.cost) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'INSUFFICIENT_CREDITS',
          message: 'Insufficient credits. Please recharge your credit wallet to continue applying.',
        });
      }

      const id = `cld_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const now = new Date().toISOString();
      const debitRow: CreditLedgerRow = {
        id,
        user_id: params.applicantId,
        amount: -params.cost,
        reason: `Job application: ${params.jobTitle || params.jobId}`,
        actor_id: params.applicantId,
        created_at: now,
      };

      await this.append(debitRow);

      return {
        success: true,
        remainingBalance: balance - params.cost,
        isSponsored: false,
      };
    });
  }

  // Atomic employer candidate contact unlock (WAL-04, Invariant #7)
  async unlockContactAtomically(params: {
    employerId: string;
    seekerId: string;
    cost: number;
  }): Promise<{ success: boolean; cost: number; remainingBalance: number; seekerId: string }> {
    if (!this.isTestMode) {
      try {
        const { data, error } = await (this.supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>)(
          'unlock_contact_with_ledger',
          {
            p_employer_id: params.employerId,
            p_seeker_id: params.seekerId,
            p_cost: params.cost,
          },
        );

        if (error) {
          if (error.message.includes('INSUFFICIENT_CREDITS')) {
            throw new BadRequestException({
              statusCode: 400,
              code: 'INSUFFICIENT_CREDITS',
              message: 'Insufficient credits to unlock candidate contact. Please recharge your wallet.',
            });
          }
          throw new BadRequestException(error.message);
        }

        const res = data as {
          success: boolean;
          cost: number;
          remaining_balance: number;
          seeker_id: string;
        };
        return {
          success: res.success,
          cost: res.cost,
          remainingBalance: res.remaining_balance,
          seekerId: res.seeker_id,
        };
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        // Fall back to local persistent store concurrency lock
      }
    }

    // Atomic execution with concurrency lock for local/test store (WAL-04 & Hard Invariant #7)
    return this.persistentStore.withLock(`wallet_${params.employerId}`, async () => {
      const { balance } = await this.calculateBalance(params.employerId);

      if (balance < params.cost) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'INSUFFICIENT_CREDITS',
          message: 'Insufficient credits to unlock candidate contact. Please recharge your wallet.',
        });
      }

      const id = `cld_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const now = new Date().toISOString();
      const debitRow: CreditLedgerRow = {
        id,
        user_id: params.employerId,
        amount: -params.cost,
        reason: `Candidate contact unlock: ${params.seekerId}`,
        actor_id: params.employerId,
        created_at: now,
      };

      await this.append(debitRow);

      return {
        success: true,
        cost: params.cost,
        remainingBalance: balance - params.cost,
        seekerId: params.seekerId,
      };
    });
  }

  // Atomic Credit Deduction preventing TOCTOU Overdrafts (Hard Invariant #7)
  async atomicDeduct(
    userId: string,
    amountToDeduct: number,
    reason: string,
    actorId?: string,
  ): Promise<{ success: boolean; remainingBalance: number; row: CreditLedgerRow }> {
    if (amountToDeduct <= 0) {
      throw new BadRequestException('Deduction amount must be strictly positive');
    }

    return this.persistentStore.withLock(`credit_ledger_${userId}`, async () => {
      const { balance } = await this.calculateBalance(userId);

      if (balance < amountToDeduct) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'INSUFFICIENT_CREDITS',
          message: 'Insufficient credits. Please recharge your credit wallet to continue applying.',
        });
      }

      const now = new Date().toISOString();
      const id = `cld_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const row: CreditLedgerRow = {
        id,
        user_id: userId,
        amount: -amountToDeduct,
        reason,
        actor_id: actorId ?? userId,
        created_at: now,
      };

      await this.append(row);

      return {
        success: true,
        remainingBalance: balance - amountToDeduct,
        row,
      };
    });
  }

  // Hard Invariant #7: Ledger entries are immutable (no UPDATE or DELETE)
  async update(_id: string, _updates: Partial<CreditLedgerRow>): Promise<never> {
    throw new BadRequestException('Credit ledger entries are immutable and cannot be updated or deleted');
  }

  async delete(_id: string): Promise<never> {
    throw new BadRequestException('Credit ledger entries are immutable and cannot be updated or deleted');
  }
}
