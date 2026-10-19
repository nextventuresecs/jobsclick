import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { SponsorshipService } from '../src/wallet/sponsorship.service.js';
import { WalletService } from '../src/wallet/wallet.service.js';
import { PaymentService } from '../src/wallet/payment.service.js';
import { ProfileRepository } from '../src/database/repositories/profile.repository.js';
import { PaymentRepository } from '../src/database/repositories/payment.repository.js';
import type { JobSeekerProfileRow, InstitutionProfileRow } from '@indian-job-portal/database';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

describe('Ticket T-17: Institution Sponsorship Tiers & Annual Billing Engine (WAL-05, Section 10.1)', () => {
  let app: NestFastifyApplication;
  let sponsorshipService: SponsorshipService;
  let walletService: WalletService;
  let paymentService: PaymentService;
  let profileRepo: ProfileRepository;
  let paymentRepo: PaymentRepository;
  let jwtToken: string;
  let institutionUser: { id: string; role: string; phone: string };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    sponsorshipService = app.get(SponsorshipService);
    walletService = app.get(WalletService);
    paymentService = app.get(PaymentService);
    profileRepo = app.get(ProfileRepository);
    paymentRepo = app.get(PaymentRepository);

    // Create auth token for institution (intermediary)
    const authRes = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: {
        phone: '+919999988888',
        otp: '123456',
        role: 'intermediary',
      },
    });
    const authData = authRes.json();
    jwtToken = authData.accessToken;
    institutionUser = authData.user;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('AC #1: Institution student count automatically selects the correct pricing band', () => {
    it('selects Small tier (₹150/student/year) for count <= 2,000 students', () => {
      const tier500 = sponsorshipService.calculateTier(500);
      expect(tier500.tier).toBe('Small');
      expect(tier500.ratePerStudentInr).toBe(150);

      const tier2000 = sponsorshipService.calculateTier(2000);
      expect(tier2000.tier).toBe('Small');
      expect(tier2000.ratePerStudentInr).toBe(150);
    });

    it('selects Medium tier (₹100/student/year) for 2,001 to 10,000 students', () => {
      const tier2001 = sponsorshipService.calculateTier(2001);
      expect(tier2001.tier).toBe('Medium');
      expect(tier2001.ratePerStudentInr).toBe(100);

      const tier10000 = sponsorshipService.calculateTier(10000);
      expect(tier10000.tier).toBe('Medium');
      expect(tier10000.ratePerStudentInr).toBe(100);
    });

    it('selects Large tier (₹70/student/year) for > 10,000 students', () => {
      const tier10001 = sponsorshipService.calculateTier(10001);
      expect(tier10001.tier).toBe('Large');
      expect(tier10001.ratePerStudentInr).toBe(70);

      const tier25000 = sponsorshipService.calculateTier(25000);
      expect(tier25000.tier).toBe('Large');
      expect(tier25000.ratePerStudentInr).toBe(70);
    });

    it('calculates 18% GST (SAC: 998311) and total annual fee accurately in quote', async () => {
      const instId = `inst_test_${Date.now()}`;
      const quote = await sponsorshipService.getSponsorshipQuote(instId, 1500);

      expect(quote.studentCount).toBe(1500);
      expect(quote.tier).toBe('Small');
      expect(quote.ratePerStudentInr).toBe(150);
      // 1500 * 150 = 225,000
      expect(quote.baseAnnualFeeInr).toBe(225000);
      expect(quote.gstRate).toBe(0.18);
      // 18% of 225,000 = 40,500
      expect(quote.gstAmountInr).toBe(40500);
      // Total = 225,000 + 40,500 = 265,500
      expect(quote.totalAnnualFeeInr).toBe(265500);
    });

    it('GET /institutions/:id/sponsorship-quote returns the calculated quote over HTTP', async () => {
      const instId = `inst_http_${Date.now()}`;
      const res = await app.inject({
        method: 'GET',
        url: `/institutions/${instId}/sponsorship-quote?students=5000`,
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.tier).toBe('Medium');
      expect(data.ratePerStudentInr).toBe(100);
      expect(data.studentCount).toBe(5000);
      expect(data.baseAnnualFeeInr).toBe(500000);
      expect(data.gstAmountInr).toBe(90000);
      expect(data.totalAnnualFeeInr).toBe(590000);
    });
  });

  describe('AC #2: When an institution pays the annual fee, all enrolled students are marked as sponsored', () => {
    it('activates annual sponsorship and marks all enrolled candidates as sponsored', async () => {
      const institutionId = `inst_activation_${Date.now()}`;
      const student1UserId = `std_usr_1_${Date.now()}`;
      const student2UserId = `std_usr_2_${Date.now()}`;

      // Create owning institution profile linked to the test auth user
      await profileRepo.saveInstitutionProfile({
        id: institutionId,
        user_id: institutionUser.id,
        institution_name: 'IIT Delhi Technical Campus',
        source: 'direct',
        created_by: institutionUser.id,
        updated_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Enroll two students linked to this institution
      const s1: JobSeekerProfileRow = {
        id: `jsp_1_${Date.now()}`,
        user_id: student1UserId,
        full_name: 'Aarav Patel',
        institution_id: institutionId,
        institution: 'IIT Delhi Technical Campus',
        is_sponsored: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const s2: JobSeekerProfileRow = {
        id: `jsp_2_${Date.now()}`,
        user_id: student2UserId,
        full_name: 'Diya Sharma',
        institution_id: institutionId,
        institution: 'IIT Delhi Technical Campus',
        is_sponsored: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await profileRepo.saveSeekerProfile(s1);
      await profileRepo.saveSeekerProfile(s2);

      // Verify initially they are not sponsored
      expect(s1.is_sponsored).toBe(false);
      expect(s2.is_sponsored).toBe(false);

      // Create a verified captured payment record for the institution
      const testPaymentId = `pay_inst_test_${Date.now()}`;
      await paymentRepo.create({
        id: `pay_row_ac2_${Date.now()}`,
        user_id: institutionUser.id,
        gateway_order_id: `order_inst_${Date.now()}`,
        gateway_payment_id: testPaymentId,
        amount_inr: 50000,
        status: 'captured',
        created_at: new Date().toISOString(),
      });

      // Institution activates annual sponsorship via HTTP endpoint
      const activationRes = await app.inject({
        method: 'POST',
        url: `/institutions/${institutionId}/sponsorship/activate`,
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
        payload: {
          paymentReference: testPaymentId,
        },
      });

      expect(activationRes.statusCode).toBe(201);
      const activationData = activationRes.json();
      expect(activationData.success).toBe(true);
      expect(activationData.sponsoredStudentsCount).toBeGreaterThanOrEqual(2);
      expect(activationData.quote.isSponsorshipActive).toBe(true);
      expect(activationData.expiresAt).toBeDefined();

      // Verify both enrolled students now have is_sponsored = true
      const updatedS1 = await profileRepo.findSeekerProfileByUserId(student1UserId);
      const updatedS2 = await profileRepo.findSeekerProfileByUserId(student2UserId);

      expect(updatedS1?.is_sponsored).toBe(true);
      expect(updatedS2?.is_sponsored).toBe(true);
    });
  });

  describe('AC #3: Sponsored candidates do not hit the 10-application cap', () => {
    it('allows non-sponsored seekers 10 free applications, then blocks 11th application', async () => {
      const nonSponsoredUser = `usr_nonsponsored_${Date.now()}`;

      // Candidate applies 10 times with starter credits (WAL-02)
      for (let i = 1; i <= 10; i++) {
        const result = await walletService.deductForJobApplication(
          nonSponsoredUser,
          `job_${i}`,
          `Test Job ${i}`,
        );
        expect(result.success).toBe(true);
        expect(result.isSponsored).toBe(false);
      }

      // Balance is now 0 (10 starter grants used)
      const { balance } = await walletService.getBalance(nonSponsoredUser);
      expect(balance).toBe(0);

      // 11th application must be rejected prompting for credit recharge
      await expect(
        walletService.deductForJobApplication(
          nonSponsoredUser,
          'job_11',
          'Job 11 Over Cap',
        ),
      ).rejects.toThrow('Insufficient credits');
    });

    it('allows sponsored candidates unlimited applications past the cap without deducting wallet credits', async () => {
      const sponsoredUser = `usr_sponsored_vip_${Date.now()}`;
      const instId = `inst_vip_${Date.now()}`;

      // Create sponsored student profile
      await profileRepo.saveSeekerProfile({
        id: `jsp_vip_${Date.now()}`,
        user_id: sponsoredUser,
        full_name: 'Vikram Malhotra',
        institution_id: instId,
        institution: 'National Engineering College',
        is_sponsored: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Candidate applies 15 times (well past the 10-application cap)
      for (let i = 1; i <= 15; i++) {
        const result = await walletService.deductForJobApplication(
          sponsoredUser,
          `job_adv_${i}`,
          `Advanced Job ${i}`,
        );

        expect(result.success).toBe(true);
        expect(result.isSponsored).toBe(true);
      }

      // Dynamic balance is still untouched (zero deductions recorded against candidate wallet)
      const { balance } = await walletService.getBalance(sponsoredUser);
      expect(balance).toBe(0);
    });
  });

  describe('AC #4: Multi-Tenant Ownership Checks (Controller & Service Level Gates)', () => {
    it('rejects cross-tenant activation when an unauthorized institution attempts to activate another institution', async () => {
      const ownerPhone = '+919811122233';
      const intruderPhone = '+919899900011';

      // 1. Authenticate owner
      const ownerAuthRes = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        payload: { phone: ownerPhone, otp: '123456', role: 'institution' },
      });
      const ownerToken = ownerAuthRes.json().accessToken;
      const ownerUserId = ownerAuthRes.json().user.id;

      // 2. Authenticate intruder
      const intruderAuthRes = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        payload: { phone: intruderPhone, otp: '123456', role: 'institution' },
      });
      const intruderToken = intruderAuthRes.json().accessToken;
      const intruderUserId = intruderAuthRes.json().user.id;

      // 3. Setup owner's institution profile
      const targetInstId = `inst_target_${Date.now()}`;
      const targetInst: InstitutionProfileRow = {
        id: targetInstId,
        user_id: ownerUserId,
        institution_name: 'St. Xavier Technical College',
        institution_type: 'college',
        affiliation: 'AICTE',
        address: 'Knowledge Boulevard',
        source: 'direct',
        created_by: ownerUserId,
        updated_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await profileRepo.saveInstitutionProfile(targetInst);

      // 4. Intruder attempts HTTP activation for owner's institution -> 403 Forbidden
      const unauthorizedHttpRes = await app.inject({
        method: 'POST',
        url: `/institutions/${targetInstId}/sponsorship/activate`,
        headers: {
          Authorization: `Bearer ${intruderToken}`,
        },
        payload: {
          paymentReference: 'rzp_pay_hacker_test',
        },
      });
      expect(unauthorizedHttpRes.statusCode).toBe(403);
      expect(unauthorizedHttpRes.json().message).toContain('not authorized');

      // 5. Intruder attempts service-level activation directly -> ForbiddenException
      await expect(
        sponsorshipService.activateSponsorship(
          targetInstId,
          { paymentReference: 'rzp_pay_hacker_test' },
          { id: intruderUserId, role: 'institution' },
        ),
      ).rejects.toThrow(ForbiddenException);

      // 6. Legitimate owner activates their own institution with captured payment -> 201 Created
      const validOwnerPaymentId = `pay_owner_valid_${Date.now()}`;
      await paymentRepo.create({
        id: `pay_row_owner_${Date.now()}`,
        user_id: ownerUserId,
        gateway_order_id: `order_owner_${Date.now()}`,
        gateway_payment_id: validOwnerPaymentId,
        amount_inr: 50000,
        status: 'captured',
        created_at: new Date().toISOString(),
      });

      const authorizedHttpRes = await app.inject({
        method: 'POST',
        url: `/institutions/${targetInstId}/sponsorship/activate`,
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
        payload: {
          paymentReference: validOwnerPaymentId,
        },
      });
      expect(authorizedHttpRes.statusCode).toBe(201);
      expect(authorizedHttpRes.json().success).toBe(true);
    });
  });

  describe('AC #5: Concurrency & Transaction/Lock Serialization (WAL-05 Idempotency)', () => {
    it('serializes concurrent activations and prevents duplicate sponsorship rows or double updates', async () => {
      const concurrentInstId = `inst_concurrent_${Date.now()}`;
      const ownerUser = `usr_concurrent_owner_${Date.now()}`;

      // Create owning institution profile
      await profileRepo.saveInstitutionProfile({
        id: concurrentInstId,
        user_id: ownerUser,
        institution_name: 'Concurrent Test College',
        source: 'direct',
        created_by: ownerUser,
        updated_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Create students linked to this institution
      for (let i = 1; i <= 3; i++) {
        await profileRepo.saveSeekerProfile({
          id: `jsp_c_${Date.now()}_${i}`,
          user_id: `usr_c_${Date.now()}_${i}`,
          full_name: `Student C${i}`,
          institution_id: concurrentInstId,
          is_sponsored: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      // Create a verified captured payment record for the concurrent institution
      const concurrentPaymentId = `pay_concurrent_${Date.now()}`;
      await paymentRepo.create({
        id: `pay_row_c_${Date.now()}`,
        user_id: ownerUser,
        gateway_order_id: `order_c_${Date.now()}`,
        gateway_payment_id: concurrentPaymentId,
        amount_inr: 50000,
        status: 'captured',
        created_at: new Date().toISOString(),
      });

      // Fire 5 concurrent activation requests for the same institution
      const requests = Array.from({ length: 5 }, () =>
        sponsorshipService.activateSponsorship(
          concurrentInstId,
          { studentCountOverride: 50, paymentReference: concurrentPaymentId },
          { id: ownerUser, role: 'institution' },
        ),
      );

      const results = await Promise.all(requests);

      // All 5 requests resolve successfully
      expect(results.length).toBe(5);
      results.forEach((r) => expect(r.success).toBe(true));

      // Exactly ONE request performed the active initial grant (alreadyActive: false)
      const freshGrants = results.filter((r) => r.alreadyActive === false);
      expect(freshGrants.length).toBe(1);

      // Remaining 4 requests received the idempotent cached active state (alreadyActive: true)
      const cachedGrants = results.filter((r) => r.alreadyActive === true);
      expect(cachedGrants.length).toBe(4);

      // Assert exactly one sponsorship row was created in institution_sponsorships table
      const sponsorships = await profileRepo.findSponsorshipsByInstitutionId(concurrentInstId);
      expect(sponsorships.length).toBe(1);
      expect(sponsorships[0]?.status).toBe('active');

      // Verify all enrolled students are marked sponsored
      const students = await profileRepo.findStudentsByInstitution(concurrentInstId);
      expect(students.length).toBe(3);
      students.forEach((s) => expect(s.is_sponsored).toBe(true));
    });
  });

  describe('AC #6: Payment Verification & Webhook Idempotency (WAL-05 & WAL-03)', () => {
    it('processes payment webhook idempotently and enforces payment verification on sponsorship activation', async () => {
      const webhookSecret = process.env['RAZORPAY_WEBHOOK_SECRET'] || 'dummy_razorpay_webhook_secret';
      const instUserId = `usr_inst_pay_${Date.now()}`;
      const instId = `inst_pay_${Date.now()}`;

      // Create institution profile
      await profileRepo.saveInstitutionProfile({
        id: instId,
        user_id: instUserId,
        institution_name: 'Bhopal Engineering College',
        source: 'direct',
        created_by: instUserId,
        updated_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // 1. Create a payment order for the institution
      const order = await paymentService.createOrder(instUserId, {
        packId: 'pack_starter',
      });

      const paymentId = `pay_rzp_inst_${Date.now()}`;
      const webhookPayload = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              order_id: order.orderId,
              amount: 59000,
            },
          },
        },
      });

      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(webhookPayload)
        .digest('hex');

      // 2. First webhook call: captured successfully
      const firstWebhookRes = await app.inject({
        method: 'POST',
        url: '/webhooks/razorpay',
        headers: {
          'content-type': 'application/json',
          'x-razorpay-signature': signature,
        },
        payload: webhookPayload,
      });
      expect(firstWebhookRes.statusCode).toBe(200);
      expect(firstWebhookRes.json().alreadyProcessed).toBe(false);

      // 3. Second webhook replay (idempotency): alreadyProcessed is true
      const secondWebhookRes = await app.inject({
        method: 'POST',
        url: '/webhooks/razorpay',
        headers: {
          'content-type': 'application/json',
          'x-razorpay-signature': signature,
        },
        payload: webhookPayload,
      });
      expect(secondWebhookRes.statusCode).toBe(200);
      expect(secondWebhookRes.json().alreadyProcessed).toBe(true);

      // 4. Activate sponsorship using verified payment reference & idempotency key
      const idempotencyKey = `spons_idem_${Date.now()}`;
      const activationResult = await sponsorshipService.activateSponsorship(
        instId,
        {
          paymentReference: paymentId,
          idempotencyKey,
        },
        { id: instUserId, role: 'institution' },
      );

      expect(activationResult.success).toBe(true);
      expect(activationResult.quote.isSponsorshipActive).toBe(true);
      expect(activationResult.alreadyActive).toBe(false);

      // 5. Repeating with same idempotencyKey returns existing sponsorship
      const repeatedResult = await sponsorshipService.activateSponsorship(
        instId,
        {
          paymentReference: paymentId,
          idempotencyKey,
        },
        { id: instUserId, role: 'institution' },
      );

      expect(repeatedResult.success).toBe(true);
      expect(repeatedResult.alreadyActive).toBe(true);
      expect(repeatedResult.sponsorshipId).toBe(activationResult.sponsorshipId);

      // 6. Attempting to activate with an uncaptured payment reference is rejected
      const uncapturedPaymentId = `pay_uncaptured_${Date.now()}`;
      await paymentRepo.create({
        id: `pay_row_${Date.now()}`,
        user_id: instUserId,
        gateway_order_id: `order_fake_${Date.now()}`,
        gateway_payment_id: uncapturedPaymentId,
        amount_inr: 500,
        status: 'created', // NOT captured
        created_at: new Date().toISOString(),
      });

      const instUncapturedId = `inst_uncap_${Date.now()}`;
      await profileRepo.saveInstitutionProfile({
        id: instUncapturedId,
        user_id: instUserId,
        institution_name: 'Uncaptured Payment Test College',
        source: 'direct',
        created_by: instUserId,
        updated_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await expect(
        sponsorshipService.activateSponsorship(
          instUncapturedId,
          { paymentReference: uncapturedPaymentId },
          { id: instUserId, role: 'institution' },
        ),
      ).rejects.toThrow(BadRequestException);

      // 7. Non-admin attempting to activate without any payment reference is rejected
      await expect(
        sponsorshipService.activateSponsorship(
          instUncapturedId,
          {},
          { id: instUserId, role: 'institution' },
        ),
      ).rejects.toThrow('A verified, captured payment reference is required to activate sponsorship');
    });
  });
});

