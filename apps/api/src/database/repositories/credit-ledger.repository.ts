import { Injectable, Inject, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, CreditLedgerRow } from '@indian-job-portal/database';
import { SUPABASE_CLIENT } from '../supabase.provider.js';

@Injectable()
export class CreditLedgerRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient<Database>) {}

  async append(record: CreditLedgerRow): Promise<CreditLedgerRow> {
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

  // Hard Invariant #7 & WAL-01: Balance is dynamically calculated from ledger entries via PostgreSQL aggregate (STF-10)
  async calculateBalance(userId: string): Promise<{ balance: number; creditsAdded: number; creditsUsed: number }> {
    const { data, error } = await (this.supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: { balance: number; credits_added: number; credits_used: number } | null;
      error: { message: string } | null;
    }>)('get_user_credit_balance', { p_user_id: userId });

    if (error) {
      throw new InternalServerErrorException(`DATABASE_ERROR: ${error.message}`);
    }

    return {
      balance: Number(data?.balance ?? 0),
      creditsAdded: Number(data?.credits_added ?? 0),
      creditsUsed: Number(data?.credits_used ?? 0),
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

    const { data, error } = await (this.supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>)(
      'deduct_application_credit_with_ledger',
      {
        p_applicant_id: userId,
        p_job_id: 'generic_deduction',
        p_job_title: reason,
        p_cost: amountToDeduct,
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

    const res = data as { success: boolean; remaining_balance: number };
    const now = new Date().toISOString();
    const row: CreditLedgerRow = {
      id: randomUUID(),
      user_id: userId,
      amount: -amountToDeduct,
      reason,
      actor_id: actorId ?? userId,
      created_at: now,
    };

    return {
      success: res.success,
      remainingBalance: res.remaining_balance,
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
