import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { UserRow } from '@indian-job-portal/database';
import { AppModule } from '../src/app.module.js';
import { WalletService } from '../src/wallet/wallet.service.js';
import { CreditLedgerRepository } from '../src/database/repositories/credit-ledger.repository.js';
import { UserRepository } from '../src/database/repositories/user.repository.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { OtpRedisService } from '../src/auth/otp-redis.service.js';

describe('Ticket T-15: Credit Wallet Ledger & Dynamic Balance Engine (WAL-01, WAL-02, WAL-04 & Hard Invariant #7)', () => {
  let app: NestFastifyApplication;
  let walletService: WalletService;
  let ledgerRepo: CreditLedgerRepository;
  let userRepo: UserRepository;
  let jwtService: JwtService;
  let otpRedis: OtpRedisService;

  async function createTestUser(role: UserRow['role'] = 'employer') {
    const userId = crypto.randomUUID();
    const phone = '98' + Math.floor(10000000 + Math.random() * 90000000);
    await userRepo.save({
      id: userId,
      phone,
      email: null,
      role,
      status: 'active',
      source: 'seed',
      created_by: null,
      updated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await otpRedis.setAuthState(userId, {
      role,
      status: 'active',
      tokenVersion: 0,
    });
    const token = await jwtService.signAccessToken(userId, 0, {
      role,
      status: 'active',
    });
    return { id: userId, phone, token };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    walletService = app.get(WalletService);
    ledgerRepo = app.get(CreditLedgerRepository);
    userRepo = app.get(UserRepository);
    jwtService = app.get(JwtService);
    otpRedis = app.get(OtpRedisService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC #1 & Hard Invariant #7: Wallet balance is never stored as mutable column; always computed from ledger entries', async () => {
    const user = await createTestUser('employer');
    const admin = await createTestUser('admin');

    // Verify initial balance is 0 with 0 additions and 0 deductions
    const initial = await walletService.getBalance(user.id);
    expect(initial.balance).toBe(0);
    expect(initial.creditsAdded).toBe(0);
    expect(initial.creditsUsed).toBe(0);

    // Add credits via ledger
    await walletService.grantCredits(user.id, 50, 'Package top-up purchase', admin.id);

    // Balance dynamically reflects 50
    const afterGrant = await walletService.getBalance(user.id);
    expect(afterGrant.balance).toBe(50);
    expect(afterGrant.creditsAdded).toBe(50);
    expect(afterGrant.creditsUsed).toBe(0);

    // Deduct credits via ledger entry
    await walletService.recordTransaction({
      userId: user.id,
      amount: -15,
      reason: 'Feature job listing',
      actorId: user.id,
    });

    // Dynamic balance = 50 - 15 = 35
    const afterDeduct = await walletService.getBalance(user.id);
    expect(afterDeduct.balance).toBe(35);
    expect(afterDeduct.creditsAdded).toBe(50);
    expect(afterDeduct.creditsUsed).toBe(15);

    // Assert strictly immutable ledger: update or delete throws BadRequestException
    const entries = await ledgerRepo.findByUserId(user.id);
    expect(entries.length).toBe(2);
    await expect(ledgerRepo.update(entries[0].id, { amount: 100 })).rejects.toThrow();
    await expect(ledgerRepo.delete(entries[0].id)).rejects.toThrow();
  });

  it('AC #3: Ledger entry records actor, timestamp, amount, and reason', async () => {
    const user = await createTestUser('employer');
    const admin = await createTestUser('admin');

    const entry = await walletService.recordTransaction({
      userId: user.id,
      amount: 25,
      reason: 'Promotional gift by platform admin',
      actorId: admin.id,
    });

    expect(entry.id).toBeDefined();
    expect(entry.user_id).toBe(user.id);
    expect(entry.actor_id).toBe(admin.id);
    expect(entry.amount).toBe(25);
    expect(entry.reason).toBe('Promotional gift by platform admin');
    expect(entry.created_at).toBeDefined();

    // Verify entry retrieved from ledger history
    const history = await walletService.getLedger(user.id);
    const found = history.find((h) => h.id === entry.id);
    expect(found).toBeDefined();
    expect(found?.actor_id).toBe(admin.id);
    expect(found?.amount).toBe(25);
  });

  it('AC #2 & WAL-02: Job seekers receive 10 free applications; 11th application prompts for credit recharge', async () => {
    const seeker = await createTestUser('job_seeker');
    const employer = await createTestUser('employer');

    // 1. Post a sample job
    const createJobRes = await app.inject({
      method: 'POST',
      url: '/jobs',
      headers: { Authorization: `Bearer ${employer.token}` },
      payload: {
        title: 'CNC Machine Operator',
        description: 'Industrial operator needed in Pithampur MSME cluster.',
        category: 'blue',
        minPay: 16000,
        maxPay: 22000,
        city: 'Pithampur',
        district: 'Dhar',
        openings: 5,
        skills: ['CNC', 'Lathe'],
      },
    });
    expect(createJobRes.statusCode).toBe(201);
    const job = JSON.parse(createJobRes.payload);

    // 2. Job seeker receives 10 free applications automatically (WAL-02)
    const initialBalance = await walletService.getBalance(seeker.id);
    expect(initialBalance.balance).toBe(10);
    expect(initialBalance.creditsAdded).toBe(10);
    expect(initialBalance.creditsUsed).toBe(0);

    // 3. Apply 10 times consecutively (simulating 10 different job applications or deductions)
    for (let i = 1; i <= 10; i++) {
      const result = await walletService.deductForJobApplication(
        seeker.id,
        crypto.randomUUID(),
        `Sample Job ${i}`,
      );
      expect(result.success).toBe(true);
      expect(result.remainingBalance).toBe(10 - i);
    }

    // After 10 applications, balance is exactly 0
    const exhaustedBalance = await walletService.getBalance(seeker.id);
    expect(exhaustedBalance.balance).toBe(0);
    expect(exhaustedBalance.creditsUsed).toBe(10);

    // 4. The 11th application fails and prompts for credit recharge
    await expect(
      walletService.deductForJobApplication(seeker.id, job.id, job.title),
    ).rejects.toThrow(/recharge|insufficient/i);

    // Also test via API endpoint: POST /jobs/:id/apply with exhausted credits
    const exhaustedSeeker = await createTestUser('job_seeker');
    // Give 10 credits and exhaust them
    await walletService.ensureStarterCredits(exhaustedSeeker.id);
    for (let i = 1; i <= 10; i++) {
      await walletService.deductForJobApplication(exhaustedSeeker.id, crypto.randomUUID(), `Mock ${i}`);
    }

    const applyRes = await app.inject({
      method: 'POST',
      url: `/jobs/${job.id}/apply`,
      headers: { Authorization: `Bearer ${exhaustedSeeker.token}` },
    });

    expect(applyRes.statusCode).toBe(400);
    const errBody = JSON.parse(applyRes.payload);
    expect(errBody.message).toMatch(/recharge|credit/i);
  });

  it('WAL-04: Deducts configurable credits when employers unlock candidate contacts or feature jobs', async () => {
    const employer = await createTestUser('employer');
    const admin = await createTestUser('admin');
    const seeker = await createTestUser('job_seeker');
    const anotherSeeker = await createTestUser('job_seeker');
    const jobId = crypto.randomUUID();

    // Grant 50 credits to employer
    await walletService.grantCredits(employer.id, 50, 'Employer starter pack', admin.id);

    // 1. Unlock candidate contacts (default cost = 5 credits)
    const unlockRes = await walletService.unlockCandidateContact(employer.id, seeker.id);
    expect(unlockRes.success).toBe(true);
    expect(unlockRes.cost).toBe(5);
    expect(unlockRes.remainingBalance).toBe(45);

    // 2. Feature job posting (default cost = 10 credits)
    const featureRes = await walletService.featureJob(employer.id, jobId);
    expect(featureRes.success).toBe(true);
    expect(featureRes.cost).toBe(10);
    expect(featureRes.remainingBalance).toBe(35);

    // 3. Admin reconfigures action costs (WAL-04)
    walletService.setActionCost('UNLOCK_CANDIDATE_CONTACT', 8);
    expect(walletService.getActionCost('UNLOCK_CANDIDATE_CONTACT')).toBe(8);

    // New unlock now costs 8 credits
    const unlockRes2 = await walletService.unlockCandidateContact(
      employer.id,
      anotherSeeker.id,
    );
    expect(unlockRes2.cost).toBe(8);
    expect(unlockRes2.remainingBalance).toBe(27);

    // 4. Verify wallet controller endpoints: GET /wallet/balance & GET /wallet/transactions
    const balanceHttpRes = await app.inject({
      method: 'GET',
      url: '/wallet/balance',
      headers: { Authorization: `Bearer ${employer.token}` },
    });
    expect(balanceHttpRes.statusCode).toBe(200);
    const balancePayload = JSON.parse(balanceHttpRes.payload);
    expect(balancePayload.balance).toBe(27);
    expect(balancePayload.creditsAdded).toBe(50);
    expect(balancePayload.creditsUsed).toBe(23);

    const historyHttpRes = await app.inject({
      method: 'GET',
      url: '/wallet/transactions',
      headers: { Authorization: `Bearer ${employer.token}` },
    });
    expect(historyHttpRes.statusCode).toBe(200);
    const historyPayload = JSON.parse(historyHttpRes.payload);
    expect(historyPayload.length).toBe(4); // 1 grant + 2 unlocks + 1 feature
  });

  it('Ticket 03: Serializes concurrent application deductions and prevents double-spend / negative balance', async () => {
    const candidate = await createTestUser('job_seeker');
    await walletService.ensureStarterCredits(candidate.id);
    // Deduct 8 credits so candidate has exactly 2 credits remaining
    await walletService.recordTransaction({
      userId: candidate.id,
      amount: -8,
      reason: 'Starter grant for concurrency test',
      actorId: candidate.id,
    });

    const { balance: startBal } = await walletService.getBalance(candidate.id);
    expect(startBal).toBe(2);

    // Launch 5 concurrent deductions simultaneously (cost = 1 each)
    const deductionPromises = Array.from({ length: 5 }, (_, idx) =>
      walletService.deductForJobApplication(
        candidate.id,
        crypto.randomUUID(),
        `Concurrent Job ${idx}`,
      ).then(
        (res) => ({ status: 'fulfilled', value: res }),
        (err) => ({ status: 'rejected', reason: err }),
      )
    );

    const outcomes = await Promise.all(deductionPromises);
    const successes = outcomes.filter((o) => o.status === 'fulfilled');
    const failures = outcomes.filter((o) => o.status === 'rejected');

    // Exactly 2 must succeed, 3 must be rejected with INSUFFICIENT_CREDITS
    expect(successes.length).toBe(2);
    expect(failures.length).toBe(3);

    // Final balance MUST be strictly 0, never negative!
    const { balance: finalBal } = await walletService.getBalance(candidate.id);
    expect(finalBal).toBe(0);
  });

  it('Ticket 04: Serializes concurrent candidate contact unlocks and prevents double-spend / overdraft', async () => {
    walletService.setActionCost('UNLOCK_CANDIDATE_CONTACT', 5);
    const employer = await createTestUser('employer');
    const admin = await createTestUser('admin');

    // Employer has exactly 10 credits (unlock costs 5 credits each by default)
    await walletService.grantCredits(
      employer.id,
      10,
      'Employer contact unlock concurrency budget',
      admin.id,
    );

    const { balance: startBal } = await walletService.getBalance(employer.id);
    expect(startBal).toBe(10);

    const candidateIds = await Promise.all(
      Array.from({ length: 4 }, async () => (await createTestUser('job_seeker')).id)
    );

    // Launch 4 concurrent contact unlock attempts simultaneously (cost = 5 each)
    const unlockPromises = candidateIds.map((cid) =>
      walletService.unlockCandidateContact(
        employer.id,
        cid,
      ).then(
        (res) => ({ status: 'fulfilled', value: res }),
        (err) => ({ status: 'rejected', reason: err }),
      )
    );

    const outcomes = await Promise.all(unlockPromises);
    const successes = outcomes.filter((o) => o.status === 'fulfilled');
    const failures = outcomes.filter((o) => o.status === 'rejected');

    // Exactly 2 must succeed (consuming 10 credits total), and 2 must fail with INSUFFICIENT_CREDITS
    expect(successes.length).toBe(2);
    expect(failures.length).toBe(2);

    // Verify rejection details
    for (const fail of failures) {
      const err = (fail as { status: 'rejected'; reason: Error }).reason;
      expect(err.message).toMatch(/insufficient credits/i);
    }

    // Final balance MUST be strictly 0, never negative or overdrawn!
    const { balance: finalBal } = await walletService.getBalance(employer.id);
    expect(finalBal).toBe(0);
  });
});
