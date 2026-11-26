import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import crypto from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { OtpGenerator } from '../src/auth/otp-generator.service.js';
import { SponsorshipService } from '../src/wallet/sponsorship.service.js';
import { WalletService } from '../src/wallet/wallet.service.js';
import { ProfileRepository } from '../src/database/repositories/profile.repository.js';
import { PaymentRepository } from '../src/database/repositories/payment.repository.js';
import { UserRepository } from '../src/database/repositories/user.repository.js';
import type { JobSeekerProfileRow, InstitutionProfileRow } from '@indian-job-portal/database';
import { ThrottlerGuard } from '@nestjs/throttler';
import { OtpRedisService } from '../src/auth/otp-redis.service.js';
import { JwtService } from '../src/auth/jwt.service.js';

describe('Ticket T-17: Institution Sponsorship Tiers & Annual Billing Engine (WAL-05, Section 10.1)', () => {
  let app: NestFastifyApplication;
  let sponsorshipService: SponsorshipService;
  let walletService: WalletService;
  let profileRepo: ProfileRepository;
  let paymentRepo: PaymentRepository;
  let userRepo: UserRepository;
  let jwtToken: string;
  let institutionUser: { id: string; role: string; phone: string };

  beforeAll(async () => {
    process.env['ENABLE_P2_SPONSORSHIP'] = 'true';
    process.env['ENABLE_P2_PAYMENTS'] = 'true';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(OtpGenerator)
      .useValue({ generate: () => '123456' })
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { rawBody: true },
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    sponsorshipService = app.get(SponsorshipService);
    walletService = app.get(WalletService);
    profileRepo = app.get(ProfileRepository);
    paymentRepo = app.get(PaymentRepository);
    userRepo = app.get(UserRepository);
    const instPhone = '98' + Math.floor(10000000 + Math.random() * 90000000);
    const instUserId = crypto.randomUUID();
    await userRepo.save({
      id: instUserId,
      phone: instPhone,
      email: null,
      role: 'intermediary',
      status: 'active',
      source: 'seed',
      created_by: null,
      updated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await profileRepo.saveInstitutionProfile({
      id: instUserId,
      user_id: instUserId,
      institution_name: 'Test Institution',
      source: 'direct',
      created_by: instUserId,
      updated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Create auth token for institution (intermediary)
    const jwtService = app.get(JwtService);
    const otpRedis = app.get(OtpRedisService);
    await otpRedis.setAuthState(instUserId, {
      role: 'intermediary',
      status: 'active',
      tokenVersion: 0,
    });
    jwtToken = await jwtService.signAccessToken(instUserId, 0, {
      role: 'intermediary',
      status: 'active',
    });
    institutionUser = { id: instUserId, phone: instPhone, role: 'intermediary' };
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
      const instId = institutionUser.id;
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

  describe('AC #2: Legacy activation is permanently removed and institutions use create-order + institution_id scoping', () => {
    it('returns 404 for legacy sponsorship activation, creates quoted order, and isolates same-name institutions', async () => {
      const institutionId = crypto.randomUUID();
      const student1UserId = crypto.randomUUID();
      const student2UserId = crypto.randomUUID();

      await userRepo.save({
        id: student1UserId,
        phone: '98' + Math.floor(10000000 + Math.random() * 90000000),
        role: 'job_seeker',
        status: 'active',
        source: 'seed',
        created_by: null,
        updated_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await userRepo.save({
        id: student2UserId,
        phone: '98' + Math.floor(10000000 + Math.random() * 90000000),
        role: 'job_seeker',
        status: 'active',
        source: 'seed',
        created_by: null,
        updated_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

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
        id: crypto.randomUUID(),
        user_id: student1UserId,
        full_name: 'Aarav Patel',
        institution_id: institutionId,
        institution: 'IIT Delhi Technical Campus',
        is_sponsored: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const s2: JobSeekerProfileRow = {
        id: crypto.randomUUID(),
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

      // Legacy direct activation endpoints must be permanently removed (404) (#130)
      for (const legacyUrl of [
        `/institutions/${institutionId}/sponsorship/activate`,
        `/institution/${institutionId}/sponsorship/activate`,
      ]) {
        const legacyRes = await app.inject({
          method: 'POST',
          url: legacyUrl,
          headers: { Authorization: `Bearer ${jwtToken}` },
          payload: { studentCountOverride: 1 },
        });
        expect(legacyRes.statusCode).toBe(404);
      }

      // Settlement happens strictly via POST /institutions/sponsorship/create-order -> webhook
      const orderRes = await app.inject({
        method: 'POST',
        url: '/institutions/sponsorship/create-order',
        headers: { Authorization: `Bearer ${jwtToken}` },
        payload: {
          institutionId,
          declaredStudentCount: 2,
          billingStateCode: '07',
          termsVersion: '2026-01',
        },
      });
      expect(orderRes.statusCode).toBe(201);
      const orderBody = orderRes.json();
      expect(orderBody.orderId).toBeDefined();
      expect(orderBody.quote.institutionId).toBe(institutionId);
      expect(orderBody.quote.studentCap).toBe(2);

      // Two institutions with identical institution_name never share enrolled students (#130)
      const secondInstId = crypto.randomUUID();
      await profileRepo.saveInstitutionProfile({
        id: secondInstId,
        user_id: institutionUser.id,
        institution_name: 'IIT Delhi Technical Campus', // exact same free-text name!
        source: 'direct',
        created_by: institutionUser.id,
        updated_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      const secondStudents = await profileRepo.findStudentsByInstitution(secondInstId);
      expect(secondStudents).toHaveLength(0);
    });
  });

  describe('AC #3: Sponsored candidates do not hit the 10-application cap', () => {
    it('allows non-sponsored seekers 10 free applications, then blocks 11th application', async () => {
      const nonSponsoredUser = crypto.randomUUID();
      await userRepo.save({
        id: nonSponsoredUser,
        phone: '98' + Math.floor(10000000 + Math.random() * 90000000),
        email: null,
        role: 'job_seeker',
        status: 'active',
        source: 'seed',
        created_by: null,
        updated_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Candidate applies 10 times with starter credits (WAL-02)
      for (let i = 1; i <= 10; i++) {
        const result = await walletService.deductForJobApplication(
          nonSponsoredUser,
          crypto.randomUUID(),
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
          crypto.randomUUID(),
          'Job 11 Over Cap',
        ),
      ).rejects.toThrow('Insufficient credits');
    });

    it('allows sponsored candidates unlimited applications past the cap without deducting wallet credits', async () => {
      const sponsoredUser = crypto.randomUUID();
      await userRepo.save({
        id: sponsoredUser,
        phone: '98' + Math.floor(10000000 + Math.random() * 90000000),
        email: null,
        role: 'job_seeker',
        status: 'active',
        source: 'seed',
        created_by: null,
        updated_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      const instUserId = crypto.randomUUID();
      const instId = crypto.randomUUID();
      const sponsId = crypto.randomUUID();
      await userRepo.save({
        id: instUserId,
        phone: '98' + Math.floor(10000000 + Math.random() * 90000000),
        email: null,
        role: 'intermediary',
        status: 'active',
        source: 'seed',
        created_by: null,
        updated_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await profileRepo.saveInstitutionProfile({
        id: instId,
        user_id: instUserId,
        institution_name: 'National Engineering College',
        source: 'direct',
        created_by: instUserId,
        updated_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await profileRepo.saveSponsorship({
        id: sponsId,
        institution_id: instId,
        tier: 'Medium',
        rate_per_student: 100,
        annual_fee: 100000,
        student_count: 100,
        status: 'active',
        started_at: new Date(Date.now() - 1000).toISOString(),
        expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
        created_by: instUserId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Create sponsored student profile
      await profileRepo.saveSeekerProfile({
        id: crypto.randomUUID(),
        user_id: sponsoredUser,
        full_name: 'Vikram Malhotra',
        institution_id: instId,
        sponsorship_id: sponsId,
        institution: 'National Engineering College',
        is_sponsored: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Candidate applies 15 times (well past the 10-application cap)
      for (let i = 1; i <= 15; i++) {
        const result = await walletService.deductForJobApplication(
          sponsoredUser,
          crypto.randomUUID(),
          `Advanced Job ${i}`,
        );

        expect(result.success).toBe(true);
        expect(result.isSponsored).toBe(true);
      }

      // Dynamic balance is still untouched (zero deductions recorded against candidate wallet)
      const { balance } = await walletService.getBalance(sponsoredUser);
      expect(balance).toBe(10);
    });
  });

  describe('AC #4: Multi-Tenant Ownership Checks (Controller & Service Level Gates)', () => {
    it('rejects cross-tenant activation when an unauthorized institution attempts to activate another institution', async () => {
      const ownerPhone = '98' + Math.floor(10000000 + Math.random() * 90000000);
      const intruderPhone = '98' + Math.floor(10000000 + Math.random() * 90000000);

      // Pre-seed owner and intruder as intermediary institutions
      const uRepo = app.get(UserRepository);
      const ownerUserId = crypto.randomUUID();
      const intruderUserId = crypto.randomUUID();
      await uRepo.save({
        id: ownerUserId,
        phone: ownerPhone.replace(/\D/g, '').slice(-10),
        email: null,
        role: 'intermediary',
        status: 'active',
        source: 'seed',
        created_by: null,
        updated_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await uRepo.save({
        id: intruderUserId,
        phone: intruderPhone.replace(/\D/g, '').slice(-10),
        email: null,
        role: 'intermediary',
        status: 'active',
        source: 'seed',
        created_by: null,
        updated_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const jwtService = app.get(JwtService);
      const otpRedis = app.get(OtpRedisService);

      // 1. Authenticate owner
      await otpRedis.setAuthState(ownerUserId, {
        role: 'intermediary',
        status: 'active',
        tokenVersion: 0,
      });
      const ownerToken = await jwtService.signAccessToken(ownerUserId, 0, {
        role: 'intermediary',
        status: 'active',
      });

      // 2. Authenticate intruder
      await otpRedis.setAuthState(intruderUserId, {
        role: 'intermediary',
        status: 'active',
        tokenVersion: 0,
      });
      const intruderToken = await jwtService.signAccessToken(intruderUserId, 0, {
        role: 'intermediary',
        status: 'active',
      });

      // 3. Setup owner's institution profile
      const targetInstId = crypto.randomUUID();
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

      // 4. Intruder cannot read target institution's quote or create sponsorship order
      const unauthorizedQuoteRes = await app.inject({
        method: 'GET',
        url: `/institutions/${targetInstId}/sponsorship-quote`,
        headers: { Authorization: `Bearer ${intruderToken}` },
      });
      expect(unauthorizedQuoteRes.statusCode).toBe(403);

      const unauthorizedOrderRes = await app.inject({
        method: 'POST',
        url: '/institutions/sponsorship/create-order',
        headers: { Authorization: `Bearer ${intruderToken}` },
        payload: {
          institutionId: targetInstId,
          billingStateCode: '23',
          termsVersion: '2026-01',
        },
      });
      expect(unauthorizedOrderRes.statusCode).toBe(404);

      // 5. Legacy activation route returns 404 even for valid owner (#130)
      const legacyOwnerRes = await app.inject({
        method: 'POST',
        url: `/institutions/${targetInstId}/sponsorship/activate`,
        headers: { Authorization: `Bearer ${ownerToken}` },
        payload: {},
      });
      expect(legacyOwnerRes.statusCode).toBe(404);

      // 6. Legitimate owner can read quote and create server-priced sponsorship order -> 201 Created
      const authorizedOrderRes = await app.inject({
        method: 'POST',
        url: '/institutions/sponsorship/create-order',
        headers: { Authorization: `Bearer ${ownerToken}` },
        payload: {
          institutionId: targetInstId,
          declaredStudentCount: 100,
          billingStateCode: '23',
          termsVersion: '2026-01',
        },
      });
      expect(authorizedOrderRes.statusCode).toBe(201);
      expect(authorizedOrderRes.json().orderId).toBeDefined();
    });
  });

  describe('AC #5: Duplicate Active Grant Protection (WAL-05 Idempotency)', () => {
    it('rejects duplicate sponsorship order creation (409) when an active grant already exists and reads status via GET /institution/sponsorship', async () => {
      const concurrentInstId = crypto.randomUUID();
      const ownerUser = crypto.randomUUID();
      await userRepo.save({
        id: ownerUser,
        phone: '98' + Math.floor(10000000 + Math.random() * 90000000),
        email: null,
        role: 'intermediary',
        status: 'active',
        source: 'seed',
        created_by: null,
        updated_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

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

      await profileRepo.saveSponsorship({
        id: crypto.randomUUID(),
        institution_id: concurrentInstId,
        tier: 'Small',
        rate_per_student: 150,
        annual_fee: 17700,
        student_count: 100,
        student_cap: 100,
        seats_used: 3,
        status: 'active',
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
        created_by: ownerUser,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const jwtService = app.get(JwtService);
      const otpRedis = app.get(OtpRedisService);
      await otpRedis.setAuthState(ownerUser, { role: 'intermediary', status: 'active', tokenVersion: 0 });
      const ownerToken = await jwtService.signAccessToken(ownerUser, 0, { role: 'intermediary', status: 'active' });

      const statusRes = await app.inject({
        method: 'GET',
        url: `/institution/sponsorship?institutionId=${concurrentInstId}`,
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(statusRes.statusCode).toBe(200);
      expect(statusRes.json().status).toBe('active');
      expect(statusRes.json().tier).toBe('Small');

      const dupOrderRes = await app.inject({
        method: 'POST',
        url: '/institutions/sponsorship/create-order',
        headers: { Authorization: `Bearer ${ownerToken}` },
        payload: {
          institutionId: concurrentInstId,
          billingStateCode: '23',
          termsVersion: '2026-01',
        },
      });
      expect(dupOrderRes.statusCode).toBe(409);
      expect(dupOrderRes.json().code).toBe('SPONSORSHIP_ALREADY_ACTIVE');
    });
  });

  describe('AC #6: Payment Verification & Webhook Idempotency (WAL-05 & WAL-03)', () => {
    it('processes sponsorship payment webhook idempotently without exposing unverified activation', async () => {
      const webhookSecret = process.env['RAZORPAY_WEBHOOK_SECRET'] || 'dummy_razorpay_webhook_secret';
      const instUserId = crypto.randomUUID();
      await userRepo.save({
        id: instUserId,
        phone: '98' + Math.floor(10000000 + Math.random() * 90000000),
        email: null,
        role: 'intermediary',
        status: 'active',
        source: 'seed',
        created_by: null,
        updated_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      const instId = crypto.randomUUID();

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

      const order = await sponsorshipService.createOrder(instUserId, {
        institutionId: instId,
        declaredStudentCount: 100,
        billingStateCode: '23',
        termsVersion: '2026-01',
      });

      const settleSpy = vi.spyOn(paymentRepo, 'settlePayment')
        .mockResolvedValueOnce({ status: 'settled', payment_id: order.orderId, purpose: 'sponsorship' })
        .mockResolvedValueOnce({ status: 'duplicate_event' });

      const paymentId = `pay_rzp_inst_${Date.now()}`;
      const webhookPayload = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              order_id: order.orderId,
              amount: order.amount,
            },
          },
        },
      });

      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(webhookPayload)
        .digest('hex');

      const eventId = `evt_spons_webhook_${Date.now()}`;
      try {
        const firstWebhookRes = await app.inject({
          method: 'POST',
          url: '/webhooks/razorpay',
          headers: {
            'content-type': 'application/json',
            'x-razorpay-signature': signature,
            'x-razorpay-event-id': eventId,
          },
          payload: webhookPayload,
        });
        expect(firstWebhookRes.statusCode).toBe(200);
        expect(firstWebhookRes.json().alreadyProcessed).toBe(false);

        const secondWebhookRes = await app.inject({
          method: 'POST',
          url: '/webhooks/razorpay',
          headers: {
            'content-type': 'application/json',
            'x-razorpay-signature': signature,
            'x-razorpay-event-id': eventId,
          },
          payload: webhookPayload,
        });
        expect(secondWebhookRes.statusCode).toBe(200);
        expect(secondWebhookRes.json().alreadyProcessed).toBe(true);
      } finally {
        settleSpy.mockRestore();
      }
    });
  });
});

