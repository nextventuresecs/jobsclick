import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { runLoadTestSimulation } from '../../../scripts/load-test.js';
import { executeBackupRestoreDrill } from '../../../scripts/backup-restore.js';
import { runSecurityChecklistScan } from '../../../scripts/security-scan.js';

describe('PRD 14.1 Full Acceptance Walkthrough (Epic 6 Launch Readiness)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
    const otpRes = await app.inject({
      method: 'POST',
      url: '/auth/send-otp',
      payload: { phone: '9876543210' },
    });
    expect(otpRes.statusCode).toBe(201);

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: { phone: '9876543210', code: '123456', role: 'job_seeker' },
    });
    expect(verifyRes.statusCode).toBe(201);

    // Step 2: Candidate Profile Update with DPDP Consent
    const profileRes = await app.inject({
      method: 'PUT',
      url: '/profiles/seeker/me',
      headers: { 'x-user-id': 'usr_walkthrough' },
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
    const jobRes = await app.inject({
      method: 'POST',
      url: '/jobs',
      headers: { 'x-user-id': 'usr_walkthrough_emp' },
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
      headers: { 'x-user-id': 'usr_walkthrough' },
    });
    expect(applyRes.statusCode).toBe(201);

    // Step 5: Employer views candidate list (Hard Invariant #1 check)
    const appsRes = await app.inject({
      method: 'GET',
      url: `/jobs/${job.id}/applications`,
      headers: { 'x-user-id': 'usr_walkthrough_emp' },
    });
    expect(appsRes.statusCode).toBe(200);
    const apps = JSON.parse(appsRes.payload);
    expect(apps[0].applicantProfile.phone).toBeUndefined();
    expect(apps[0].applicantProfile.email).toBeUndefined();
  });
});
