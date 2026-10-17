import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { SponsorshipService } from '../src/wallet/sponsorship.service.js';
import { WalletService } from '../src/wallet/wallet.service.js';
import { ProfileRepository } from '../src/database/repositories/profile.repository.js';
import type { JobSeekerProfileRow } from '@indian-job-portal/database';

describe('Ticket T-17: Institution Sponsorship Tiers & Annual Billing Engine (WAL-05, Section 10.1)', () => {
  let app: NestFastifyApplication;
  let sponsorshipService: SponsorshipService;
  let walletService: WalletService;
  let profileRepo: ProfileRepository;
  let jwtToken: string;

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
    profileRepo = app.get(ProfileRepository);

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

      // Institution activates annual sponsorship via HTTP endpoint
      const activationRes = await app.inject({
        method: 'POST',
        url: `/institutions/${institutionId}/sponsorship/activate`,
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
        payload: {
          paymentReference: 'rzp_pay_inst_test_123',
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
});
