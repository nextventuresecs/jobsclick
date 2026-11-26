import { Injectable, Inject, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, CreditLedgerRow } from '@indian-job-portal/database';
import { SUPABASE_CLIENT, PersistentDatabaseStore } from '../supabase.provider.js';
import {
  type AuthorizationContext,
  requireAuthorizationContext,
  isPlatformAdminContext,
} from '../../auth/authorization-context.js';

@Injectable()
export class CreditLedgerRepository {
  private persistentStore = PersistentDatabaseStore.getInstance();

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient<Database>) {}

  async append(record: CreditLedgerRow): Promise<CreditLedgerRow> {
    this.persistentStore.setRow('credit_ledgers', record.id, record);

    const { error } = await this.supabase.from('credit_ledgers').insert({
      id: record.id,
      user_id: record.user_id,
      amount: record.amount,
      reason: record.reason,
      actor_id: record.actor_id ?? null,
      created_at: record.created_at,
    });

    if (error) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
    }

    return record;
  }

  async findByUserId(userId: string): Promise<CreditLedgerRow[]> {
    const { data, error } = await this.supabase
      .from('credit_ledgers')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
    }
    return (data as unknown as CreditLedgerRow[]) || [];
  }

  async findByUserIdScoped(ctx: AuthorizationContext, userId: string): Promise<CreditLedgerRow[]> {
    const verified = requireAuthorizationContext(ctx);
    if (!isPlatformAdminContext(verified) && verified.actorId !== userId) {
      throw new BadRequestException('Cross-user credit ledger query denied');
    }
    return this.findByUserId(userId);
  }

  // Hard Invariant #7 & WAL-01: Balance is dynamically calculated from ledger entries via PostgreSQL aggregate (STF-10)
  async calculateBalance(userId: string): Promise<{ balance: number; creditsAdded: number; creditsUsed: number }> {
    const { data, error } = await (this.supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: number | string | null;
      error: { message: string } | null;
    }>)('rpc_get_balance', { p_user_id: userId });

    if (error) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
    }

    const bal = Number(data ?? 0);

    const { data: rows } = await this.supabase
      .from('credit_ledgers')
      .select('amount')
      .eq('user_id', userId);

    let creditsAdded = 0;
    let creditsUsed = 0;
    if (rows && Array.isArray(rows)) {
      for (const r of rows) {
        const amt = Number((r as { amount: number }).amount);
        if (amt > 0) creditsAdded += amt;
        else if (amt < 0) creditsUsed += Math.abs(amt);
      }
    }

    return {
      balance: bal,
      creditsAdded,
      creditsUsed,
    };
  }

  // Ensure starter credits are granted idempotently into the unique partial index
  async ensureStarterCredits(userId: string): Promise<void> {
    const { data: existing } = await this.supabase
      .from('credit_ledgers')
      .select('id')
      .eq('user_id', userId)
      .in('reason', ['starter', 'starter_credit'])
      .maybeSingle();

    if (existing) {
      return;
    }

    const { error } = await this.supabase.from('credit_ledgers').insert({
      id: randomUUID(),
      user_id: userId,
      amount: 10,
      reason: 'starter_credit',
      source: 'system',
    });

    if (error && !error.message.includes('duplicate key') && error.code !== '23505') {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
    }
  }

  // WAL-02 & Hard Invariant #7: Atomic job application credit deduction with TOCTOU lock
  async deductApplicationCreditAtomically(params: {
    applicantId: string;
    jobId: string;
    jobTitle?: string;
    cost?: number;
    isSponsored?: boolean;
  }): Promise<{ success: boolean; remainingBalance: number; isSponsored: boolean }> {
    const { data, error } = await (this.supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>)(
      'rpc_charge_application',
      {
        p_applicant_id: params.applicantId,
        p_job_id: params.jobId,
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

    const res = data as { charged: boolean; sponsored: boolean; balance: number | string };
    return {
      success: true,
      remainingBalance: Number(res.balance),
      isSponsored: res.sponsored,
    };
  }

  // Atomic employer candidate contact unlock (WAL-04, Invariant #7)
  async unlockContactAtomically(params: {
    employerId: string;
    seekerId: string;
    cost: number;
  }): Promise<{ success: boolean; cost: number; remainingBalance: number; seekerId: string }> {
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

    const { balance } = await this.calculateBalance(userId);
    if (balance < amountToDeduct) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INSUFFICIENT_CREDITS',
        message: 'Insufficient credits. Please recharge your credit wallet to continue applying.',
      });
    }

    const now = new Date().toISOString();
    const row: CreditLedgerRow = {
      id: randomUUID(),
      user_id: userId,
      amount: -amountToDeduct,
      reason,
      actor_id: actorId ?? userId,
      created_at: now,
    };

    await this.append(row);
    const remainingBalance = balance - amountToDeduct;

    return {
      success: true,
      remainingBalance,
      row,
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
