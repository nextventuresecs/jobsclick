import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { WalletService } from '../src/wallet/wallet.service.js';
import { PaymentService } from '../src/wallet/payment.service.js';
import { CreditLedgerRepository } from '../src/database/repositories/credit-ledger.repository.js';
import { CREDIT_PACKS } from '@indian-job-portal/validation';
import { BadRequestException } from '@nestjs/common';

describe('Concurrency & Security Verification Suite (Ticket T-16/T-17 Hardening)', () => {
  let app: NestFastifyApplication;
  let walletService: WalletService;
  let paymentService: PaymentService;
  let ledgerRepo: CreditLedgerRepository;
  let jwtTokenInstitutionA: string;
  let jwtTokenInstitutionB: string;
  let jwtTokenAdmin: string;
  let institutionAId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    walletService = app.get(WalletService);
    paymentService = app.get(PaymentService);
    ledgerRepo = app.get(CreditLedgerRepository);

    // Setup Auth Users
    const authA = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: { phone: '+919111122222', code: '123456', role: 'intermediary' },
    });
    const authDataA = authA.json();
    jwtTokenInstitutionA = authDataA.accessToken;
    institutionAId = authDataA.user.id;

    const authB = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: { phone: '+919333344444', code: '123456', role: 'intermediary' },
    });
    const authDataB = authB.json();
    jwtTokenInstitutionB = authDataB.accessToken;

    const authAdmin = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: { phone: '+919999900000', code: '123456', role: 'admin' },
    });
    const authDataAdmin = authAdmin.json();
    jwtTokenAdmin = authDataAdmin.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('D.1 Concurrency Integration Test: TOCTOU Ledger Overdrafts', () => {
    it('spawns 30 concurrent deduction requests against exactly 1 credit; asserts exactly 1 succeeds and 29 fail with INSUFFICIENT_CREDITS', async () => {
      const candidateId = `cand_stress_${Date.now()}`;
      
      // Ensure candidate has exactly 1 credit
      await ledgerRepo.append({
        id: `cld_init_${Date.now()}`,
        user_id: candidateId,
        amount: 1,
        reason: 'Initial 1 credit grant for concurrency stress test',
        actor_id: candidateId,
        created_at: new Date().toISOString(),
      });

      const initialBal = await walletService.getBalance(candidateId);
      expect(initialBal.balance).toBe(1);

      // Fire 30 simultaneous deductions for JOB_APPLICATION (cost: 1 credit)
      const CONCURRENCY_LEVEL = 30;
      const tasks = Array.from({ length: CONCURRENCY_LEVEL }, (_, i) =>
        walletService
          .deductForJobApplication(candidateId, `job_${i}`, `Software Developer ${i}`)
          .then((res) => ({ success: true, res }))
          .catch((err: BadRequestException) => ({
            success: false,
            code: (err.getResponse() as Record<string, unknown>)?.['code'] || err.message,
          })),
      );

      const results = await Promise.all(tasks);

      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      expect(successful).toHaveLength(1);
      expect(failed).toHaveLength(CONCURRENCY_LEVEL - 1);

      for (const f of failed) {
        expect(f.code).toBe('INSUFFICIENT_CREDITS');
      }

      // Hard Invariant #7: Sum of ledger entries must equal exactly 0, zero overdrafts possible
      const finalBal = await walletService.getBalance(candidateId);
      expect(finalBal.balance).toBe(0);
      expect(finalBal.creditsAdded).toBe(1);
      expect(finalBal.creditsUsed).toBe(1);
    });
  });

  describe('D.2 Webhook Idempotency & Single-Winner Status Transition', () => {
    it('fires 10 concurrent identical payment.captured webhooks; asserts single credit grant and 0 duplicates', async () => {
      const userId = `emp_webhook_${Date.now()}`;
      const pack = CREDIT_PACKS['pack_starter']; // 50 credits, ₹590
      expect(pack).toBeDefined();

      const orderResult = await paymentService.createOrder(userId, {
        packId: 'pack_starter',
        billingName: 'Concurrent Test Corp',
        billingEmail: 'test@concurrent.example',
        billingPhone: '+919876500000',
        billingAddress: 'Indore IT Park, MP',
      });

      const gatewayPaymentId = `pay_stress_${Date.now()}`;

      // Dispatch 10 parallel webhook captures for the same order
      const WEBHOOK_DISPATCH_COUNT = 10;
      const webhookTasks = Array.from({ length: WEBHOOK_DISPATCH_COUNT }, () =>
        paymentService.processPaymentSuccess(
          orderResult.orderId,
          gatewayPaymentId,
          undefined,
          { source: 'concurrency_test' },
        ),
      );

      const responses = await Promise.all(webhookTasks);

      // Verify all responses succeeded idempotently
      for (const res of responses) {
        expect(res.payment.status).toBe('captured');
        expect(res.invoice).toBeDefined();
      }

      // Exactly one execution transitions the status (alreadyProcessed: false); all others return alreadyProcessed: true
      const firstWinners = responses.filter((r) => !r.alreadyProcessed);
      const idempotentReturns = responses.filter((r) => r.alreadyProcessed);

      expect(firstWinners).toHaveLength(1);
      expect(idempotentReturns).toHaveLength(WEBHOOK_DISPATCH_COUNT - 1);

      // Verify credit ledger was credited exactly once (50 credits)
      const balance = await walletService.getBalance(userId);
      expect(balance.balance).toBe(50);
      expect(balance.creditsAdded).toBe(50);
      expect(balance.creditsUsed).toBe(0);
    });
  });

  describe('D.3 Multi-Tenant IDOR Security Matrix Test on Sponsorship Quotes', () => {
    it('rejects unauthenticated request with 401 Unauthorized', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/institutions/${institutionAId}/sponsorship-quote`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects cross-tenant access with 403 Forbidden when Institution B queries Institution A', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/institutions/${institutionAId}/sponsorship-quote`,
        headers: {
          authorization: `Bearer ${jwtTokenInstitutionB}`,
        },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toContain('not authorized');
    });

    it('permits Institution A (owner) to query its own sponsorship quote with 200 OK', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/institutions/${institutionAId}/sponsorship-quote?students=1000`,
        headers: {
          authorization: `Bearer ${jwtTokenInstitutionA}`,
        },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.tier).toBe('Small');
      expect(data.studentCount).toBe(1000);
      expect(data.baseAnnualFeeInr).toBe(150000);
    });

    it('permits Platform Admin to query any institution sponsorship quote with 200 OK', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/institutions/${institutionAId}/sponsorship-quote?students=2500`,
        headers: {
          authorization: `Bearer ${jwtTokenAdmin}`,
        },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.tier).toBe('Medium');
      expect(data.studentCount).toBe(2500);
    });
  });
});
