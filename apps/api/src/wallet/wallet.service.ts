import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import type { CreditLedgerRow } from '@indian-job-portal/database';
import { CreditLedgerRepository } from '../database/repositories/credit-ledger.repository.js';
import { AuditLogRepository } from '../database/repositories/audit-log.repository.js';

export interface WalletTransactionInput {
  userId: string;
  amount: number;
  reason: string;
  actorId?: string | null;
}

export interface DynamicBalanceResult {
  balance: number;
  creditsAdded: number;
  creditsUsed: number;
}

@Injectable()
export class WalletService {
  // Configurable action costs (WAL-04)
  private actionCosts = new Map<string, number>([
    ['JOB_APPLICATION', 1],
    ['UNLOCK_CANDIDATE_CONTACT', 5],
    ['FEATURE_JOB', 10],
  ]);

  constructor(
    @Inject(CreditLedgerRepository)
    private readonly creditLedgerRepository: CreditLedgerRepository,
    @Inject(AuditLogRepository)
    private readonly auditLogRepository: AuditLogRepository,
  ) {}

  // WAL-01 & Hard Invariant #7: Calculate dynamic balance directly from immutable ledger
  async getBalance(userId: string): Promise<DynamicBalanceResult> {
    return this.creditLedgerRepository.calculateBalance(userId);
  }

  // Retrieve user transaction history
  async getLedger(userId: string): Promise<CreditLedgerRow[]> {
    return this.creditLedgerRepository.findByUserId(userId);
  }

  // Append new ledger transaction (Strictly append-only)
  async recordTransaction(input: WalletTransactionInput): Promise<CreditLedgerRow> {
    const now = new Date().toISOString();
    const id = `cld_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const actorId = input.actorId ?? input.userId;

    const row: CreditLedgerRow = {
      id,
      user_id: input.userId,
      amount: input.amount,
      reason: input.reason,
      actor_id: actorId,
      created_at: now,
    };

    await this.creditLedgerRepository.append(row);

    // Hard Invariant #6: Append to persistent audit logs for all credit changes
    try {
      await this.auditLogRepository.append({
        id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        actor_id: actorId,
        action: input.amount >= 0 ? 'CREDIT_WALLET_GRANTED' : 'CREDIT_WALLET_DEDUCTED',
        meta: {
          targetUserId: input.userId,
          amount: input.amount,
          reason: input.reason,
          ledgerEntryId: id,
        },
        created_at: now,
      });
    } catch {
      // Audit log non-blocking fallback
    }

    return row;
  }

  // WAL-02: Auto-grant 10 free job applications to job seekers upon account creation
  async grantStarterCredits(userId: string, actorId?: string): Promise<CreditLedgerRow> {
    return this.recordTransaction({
      userId,
      amount: 10,
      reason: 'Starter grant: 10 free job applications (WAL-02)',
      actorId: actorId ?? userId,
    });
  }

  // Ensure starter credits are granted if not already done
  async ensureStarterCredits(userId: string): Promise<void> {
    const entries = await this.creditLedgerRepository.findByUserId(userId);
    const hasStarterGrant = entries.some(
      (e) => e.amount === 10 && e.reason.includes('Starter grant'),
    );

    if (!hasStarterGrant && entries.length === 0) {
      await this.grantStarterCredits(userId);
    }
  }

  // Deduct 1 credit for job application; 11th application prompts for recharge
  async deductForJobApplication(
    applicantId: string,
    jobId: string,
    jobTitle?: string,
  ): Promise<{ success: boolean; remainingBalance: number }> {
    // Ensure starter credits exist if candidate is fresh
    await this.ensureStarterCredits(applicantId);

    const { balance } = await this.getBalance(applicantId);
    const requiredCredits = this.getActionCost('JOB_APPLICATION');

    if (balance < requiredCredits) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INSUFFICIENT_CREDITS',
        message: 'Insufficient credits. Please recharge your credit wallet to continue applying.',
      });
    }

    await this.recordTransaction({
      userId: applicantId,
      amount: -requiredCredits,
      reason: `Job application: ${jobTitle || jobId}`,
      actorId: applicantId,
    });

    return {
      success: true,
      remainingBalance: balance - requiredCredits,
    };
  }

  // Employer unlocks candidate contact details
  async unlockCandidateContact(
    employerId: string,
    seekerId: string,
    customCost?: number,
  ): Promise<{ success: boolean; cost: number; remainingBalance: number; seekerId: string }> {
    const cost = customCost ?? this.getActionCost('UNLOCK_CANDIDATE_CONTACT');
    const { balance } = await this.getBalance(employerId);

    if (balance < cost) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INSUFFICIENT_CREDITS',
        message: 'Insufficient credits to unlock candidate contact. Please recharge your wallet.',
      });
    }

    await this.recordTransaction({
      userId: employerId,
      amount: -cost,
      reason: `Candidate contact unlock: ${seekerId}`,
      actorId: employerId,
    });

    return {
      success: true,
      cost,
      remainingBalance: balance - cost,
      seekerId,
    };
  }

  // Employer features a job posting
  async featureJob(
    employerId: string,
    jobId: string,
    customCost?: number,
  ): Promise<{ success: boolean; cost: number; remainingBalance: number; jobId: string }> {
    const cost = customCost ?? this.getActionCost('FEATURE_JOB');
    const { balance } = await this.getBalance(employerId);

    if (balance < cost) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INSUFFICIENT_CREDITS',
        message: 'Insufficient credits to feature job. Please recharge your wallet.',
      });
    }

    await this.recordTransaction({
      userId: employerId,
      amount: -cost,
      reason: `Featured job posting: ${jobId}`,
      actorId: employerId,
    });

    return {
      success: true,
      cost,
      remainingBalance: balance - cost,
      jobId,
    };
  }

  // Grant credits (e.g. admin top-up or recharge)
  async grantCredits(
    userId: string,
    amount: number,
    reason: string,
    actorId?: string,
  ): Promise<CreditLedgerRow> {
    if (amount <= 0) {
      throw new BadRequestException('Credit amount must be greater than 0');
    }

    return this.recordTransaction({
      userId,
      amount,
      reason,
      actorId: actorId ?? userId,
    });
  }

  // WAL-04: Admin-configurable action costs
  getActionCost(action: string): number {
    return this.actionCosts.get(action) ?? 1;
  }

  setActionCost(action: string, cost: number): void {
    if (cost < 0) {
      throw new BadRequestException('Cost must be greater than or equal to 0');
    }
    this.actionCosts.set(action, cost);
  }

  getAllActionCosts(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, value] of this.actionCosts.entries()) {
      result[key] = value;
    }
    return result;
  }
}
