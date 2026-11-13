import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { ThrottlerGuard } from '@nestjs/throttler';
import { OtpRedisService } from '../src/auth/otp-redis.service.js';
import { OtpGenerator } from '../src/auth/otp-generator.service.js';
import { runLoadTestSimulation } from '../../../scripts/load-test.js';
import { executeBackupRestoreDrill } from '../../../scripts/backup-restore.js';
import { runSecurityChecklistScan } from '../../../scripts/security-scan.js';

describe('PRD 14.1 Full Acceptance Walkthrough (Epic 6 Launch Readiness)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
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
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('verifies 50k Load Test Simulation (Issue #25)', () => {
    const loadResult = runLoadTestSimulation(50000);
    expect(loadResult.passed).toBe(true);
    expect(loadResult.p95LatencyMs).toBeLessThan(2000);
  });

  it('verifies Database Backup & Restore Drill (Issue #26)', () => {
    const backupResult = executeBackupRestoreDrill();
    expect(backupResult.restoreSuccess).toBe(true);
    expect(backupResult.backupSizeBytes).toBeGreaterThan(0);
  });

  it('verifies Security Audit Checklist & Invariants (Issue #28)', () => {
    const secResult = runSecurityChecklistScan();
    expect(secResult.allChecksPassed).toBe(true);
    expect(secResult.candidatePhoneEmailHidden).toBe(true);
    expect(secResult.aadhaarFullNumberNotStored).toBe(true);
  });

  it('runs complete end-to-end user workflow vs PRD 14.1 (Issue #29)', async () => {
    // Step 1: Candidate OTP authentication
    const testPhone = '98' + Math.floor(10000000 + Math.random() * 90000000);
    await app.get(OtpRedisService).resetForTest(testPhone);

    const otpRes = await app.inject({
      method: 'POST',
      url: '/auth/send-otp',
      payload: { phone: testPhone, turnstileToken: 'test-token' },
    });
    expect([200, 201]).toContain(otpRes.statusCode);

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: { phone: testPhone, code: '123456', role: 'job_seeker' },
    });
    expect([200, 201]).toContain(verifyRes.statusCode);

    const seekerId = verifyRes.json().user.id;
    expect(seekerId).toBeDefined();
    const seekerToken = verifyRes.json().accessToken;

    // Step 2: Candidate Profile Update with DPDP Consent
    const profileRes = await app.inject({
      method: 'PUT',
      url: '/profiles/seeker/me',
      headers: { authorization: `Bearer ${seekerToken}` },
      payload: {
        fullName: 'Sunil Verma',
        seekerType: 'individual',
        aadhaarLastFour: '1234',
        dpdpConsentGiven: true,
        skills: ['Tally', 'GST'],
        city: 'Indore',
      },
    });
    expect(profileRes.statusCode).toBe(200);

    // Step 3: Employer creates job posting
    const empPhone = '98' + Math.floor(10000000 + Math.random() * 90000000);
    await app.get(OtpRedisService).resetForTest(empPhone);
    await app.inject({
      method: 'POST',
      url: '/auth/send-otp',
      payload: { phone: empPhone, turnstileToken: 'test-token' },
    });
    const empVerifyRes = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: { phone: empPhone, code: '123456', role: 'employer' },
    });
    expect([200, 201]).toContain(empVerifyRes.statusCode);
    const empToken = empVerifyRes.json().accessToken;

    const jobRes = await app.inject({
      method: 'POST',
      url: '/jobs',
      headers: { authorization: `Bearer ${empToken}` },
      payload: {
        title: 'Senior Accountant MSME',
        description: 'Need full-time senior accountant for MSME enterprise.',
        category: 'white',
        minPay: 20000,
        maxPay: 30000,
        city: 'Indore',
        district: 'Indore',
        openings: 1,
        skills: ['Tally', 'GST'],
      },
    });
    expect(jobRes.statusCode).toBe(201);
    const job = JSON.parse(jobRes.payload);

    // Step 4: Candidate applies to job
    const applyRes = await app.inject({
      method: 'POST',
      url: `/jobs/${job.id}/apply`,
      headers: { authorization: `Bearer ${seekerToken}` },
    });
    expect(applyRes.statusCode).toBe(201);

    // Step 5: Employer views candidate list (Hard Invariant #1 check)
    const appsRes = await app.inject({
      method: 'GET',
      url: `/jobs/${job.id}/applications`,
      headers: { authorization: `Bearer ${empToken}` },
    });
    expect(appsRes.statusCode).toBe(200);
    const apps = JSON.parse(appsRes.payload);
    expect(apps[0].applicantProfile.phone).toBeUndefined();
    expect(apps[0].applicantProfile.email).toBeUndefined();
  });
});
