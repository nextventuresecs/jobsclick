import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import type { UserRow, InstitutionInquiryRow, InstitutionProfileRow } from '@indian-job-portal/database';
import { AppModule } from '../src/app.module.js';
import { UserRepository } from '../src/database/repositories/user.repository.js';
import { ProfileRepository } from '../src/database/repositories/profile.repository.js';
import { InquiryRepository } from '../src/database/repositories/inquiry.repository.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { OtpRedisService } from '../src/auth/otp-redis.service.js';
import { QueueService } from '../src/queue/queue.service.js';

interface TestActor {
  id: string;
  phone: string;
  role: UserRow['role'];
  token: string;
}

describe('ADR 0002 (AUTHZ-04): Comprehensive OWASP IDOR, RBAC, Session & Zero-Side-Effect Matrix', () => {
  let app: NestFastifyApplication;
  let userRepo: UserRepository;
  let profileRepo: ProfileRepository;
  let inquiryRepo: InquiryRepository;
  let jwtService: JwtService;
  let otpRedis: OtpRedisService;
  let queueService: QueueService;

  let employerA: TestActor;
  let employerB: TestActor;
  let instA: TestActor;
  let instB: TestActor;
  let instAProfileId: string;
  let seekerA: TestActor;
  let msmeAdmin: TestActor;
  let disabledUser: TestActor;
  let revokedUser: TestActor;

  async function seedActor(role: UserRow['role'], status: UserRow['status'] = 'active', tokenVersion = 0): Promise<TestActor> {
    const id = randomUUID();
    const phone = '98' + Math.floor(10000000 + Math.random() * 90000000);
    await userRepo.save({
      id,
      phone,
      email: null,
      role,
      status,
      source: 'seed',
      created_by: null,
      updated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await otpRedis.setAuthState(id, { role, status, tokenVersion });
    const token = await jwtService.signAccessToken(id, tokenVersion, { role, status });
    return { id, phone, role, token };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    userRepo = app.get(UserRepository);
    profileRepo = app.get(ProfileRepository);
    inquiryRepo = app.get(InquiryRepository);
    jwtService = app.get(JwtService);
    otpRedis = app.get(OtpRedisService);
    queueService = app.get(QueueService);

    employerA = await seedActor('employer');
    employerB = await seedActor('employer');
    instA = await seedActor('intermediary');
    instB = await seedActor('intermediary');
    seekerA = await seedActor('job_seeker');
    msmeAdmin = await seedActor('msme_admin');
    disabledUser = await seedActor('employer', 'disabled', 0);

    // Token issued at tv=0, then server state bumped to tv=1
    revokedUser = await seedActor('employer', 'active', 0);
    await otpRedis.setAuthState(revokedUser.id, { role: 'employer', status: 'active', tokenVersion: 1 });

    instAProfileId = randomUUID();
    const instAProfile: InstitutionProfileRow = {
      id: instAProfileId,
      user_id: instA.id,
      public_slug: `inst${instAProfileId.replace(/-/g, '').slice(0, 8)}`,
      institution_name: 'Government ITI Alpha',
      source: 'direct',
      created_by: instA.id,
      updated_by: instA.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await profileRepo.saveInstitutionProfile(instAProfile);

    const instBProfileId = randomUUID();
    await profileRepo.saveInstitutionProfile({
      id: instBProfileId,
      user_id: instB.id,
      public_slug: `inst${instBProfileId.replace(/-/g, '').slice(0, 8)}`,
      institution_name: 'Government ITI Beta',
      source: 'direct',
      created_by: instB.id,
      updated_by: instB.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects revoked sessions and disabled user accounts with 401 across protected routes', async () => {
    const revokedRes = await app.inject({
      method: 'POST',
      url: '/jobs',
      headers: { Authorization: `Bearer ${revokedUser.token}` },
      payload: {
        title: 'Revoked User Job',
        description: 'Should fail',
        category: 'blue',
        minPay: 10000,
        maxPay: 15000,
        city: 'Pune',
        district: 'Pune',
        openings: 1,
      },
    });
    expect(revokedRes.statusCode).toBe(401);

    const disabledRes = await app.inject({
      method: 'GET',
      url: '/jobs/employer/me',
      headers: { Authorization: `Bearer ${disabledUser.token}` },
    });
    expect(disabledRes.statusCode).toBe(401);
  });

  it('prevents role privilege boundaries (msme_admin cannot access platform admin export/roles; seeker cannot broadcast or create jobs)', async () => {
    const exportRes = await app.inject({
      method: 'GET',
      url: '/admin/export?entity=users',
      headers: { Authorization: `Bearer ${msmeAdmin.token}` },
    });
    expect(exportRes.statusCode).toBe(403);

    const roleEscRes = await app.inject({
      method: 'PUT',
      url: `/admin/users/${seekerA.id}/role`,
      headers: { Authorization: `Bearer ${msmeAdmin.token}` },
      payload: { role: 'admin', reason: 'privilege escalation test' },
    });
    expect(roleEscRes.statusCode).toBe(403);

    const seekerBroadcastRes = await app.inject({
      method: 'POST',
      url: '/admin/broadcast/dispatch',
      headers: { Authorization: `Bearer ${seekerA.token}` },
      payload: { templateId: 'tpl_1', confirmationToken: 'tok_1' },
    });
    expect([403, 404]).toContain(seekerBroadcastRes.statusCode);
  });

  it('blocks cross-institution inquiry mutation with 403 and preserves original inquiry status', async () => {
    const inquiryId = randomUUID();
    const inquiry: InstitutionInquiryRow = {
      id: inquiryId,
      institution_id: instAProfileId,
      student_name: 'Student One',
      student_phone: '9876500001',
      student_email: 'student1@example.com',
      course_of_interest: 'Fitter',
      qualification: '10th',
      city: 'Bhopal',
      state: 'Madhya Pradesh',
      message: 'Interested in admission',
      status: 'new',
      source: 'public_portal',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await inquiryRepo.saveInquiry(inquiry);

    // Institution B attempts to hijack Institution A's inquiry lead
    const tamperRes = await app.inject({
      method: 'PUT',
      url: `/profiles/institution/inquiries/${inquiryId}/status`,
      headers: { Authorization: `Bearer ${instB.token}` },
      payload: { status: 'closed' },
    });
    expect(tamperRes.statusCode).toBe(403);

    // Original inquiry stays unmodified
    const unchanged = await inquiryRepo.findInquiryById(inquiryId);
    expect(unchanged?.status).toBe('new');
  });

  it('blocks cross-tenant bulk batch reads, error report downloads, and invite wave side effects', async () => {
    const createBatchRes = await app.inject({
      method: 'POST',
      url: '/bulk/batches',
      headers: { Authorization: `Bearer ${instA.token}` },
      payload: {
        entityType: 'student',
        source: 'iti_alpha',
        csvContent: 'name,phone,trade\nRamesh,9876541111,Electrician',
      },
    });
    expect(createBatchRes.statusCode).toBe(201);
    const batch = JSON.parse(createBatchRes.payload) as { id: string };

    // Institution B cannot inspect status or download error report CSV (0 PII exposure)
    const crossRead = await app.inject({
      method: 'GET',
      url: `/bulk/batches/${batch.id}`,
      headers: { Authorization: `Bearer ${instB.token}` },
    });
    expect(crossRead.statusCode).toBe(404);

    const crossCsv = await app.inject({
      method: 'GET',
      url: `/bulk/batches/${batch.id}/error-report`,
      headers: { Authorization: `Bearer ${instB.token}` },
    });
    expect(crossCsv.statusCode).toBe(404);

    // Intermediary cannot import employers (entity-type authorization)
    const wrongEntity = await app.inject({
      method: 'POST',
      url: '/bulk/batches',
      headers: { Authorization: `Bearer ${instA.token}` },
      payload: {
        entityType: 'employer',
        source: 'iti_alpha',
        csvContent: 'company_name,phone\nAcme,9876541112',
      },
    });
    expect(wrongEntity.statusCode).toBe(403);

    // Cross-tenant invite scheduling fails with zero invite jobs queued
    const initialMetrics = await queueService.getLiveQueueMetrics();
    const initialWaiting = initialMetrics.queues.find((q) => q.name === 'invite-wave')?.waiting ?? 0;

    const crossInvite = await app.inject({
      method: 'POST',
      url: '/bulk/invites/schedule',
      headers: { Authorization: `Bearer ${instB.token}` },
      payload: { batchId: batch.id, waveSize: 1, costPerSmsInr: 0.2 },
    });
    expect(crossInvite.statusCode).toBe(404);

    const afterMetrics = await queueService.getLiveQueueMetrics();
    const afterWaiting = afterMetrics.queues.find((q) => q.name === 'invite-wave')?.waiting ?? 0;
    expect(afterWaiting).toBe(initialWaiting);
  });

  it('blocks employer B from updating application status belonging to employer A job with zero side effects', async () => {
    const createJobRes = await app.inject({
      method: 'POST',
      url: '/jobs',
      headers: { Authorization: `Bearer ${employerA.token}` },
      payload: {
        title: 'Employer A Turner',
        description: 'Precision turning work',
        category: 'blue',
        minPay: 14000,
        maxPay: 19000,
        city: 'Indore',
        district: 'Indore',
        openings: 1,
      },
    });
    expect(createJobRes.statusCode).toBe(201);
    const jobA = JSON.parse(createJobRes.payload) as { id: string };

    const applyRes = await app.inject({
      method: 'POST',
      url: `/jobs/${jobA.id}/apply`,
      headers: { Authorization: `Bearer ${seekerA.token}` },
    });
    expect(applyRes.statusCode).toBe(201);
    const application = JSON.parse(applyRes.payload) as { id: string };

    // Employer B attempts to hijack Employer A's candidate application status
    const hijackStatus = await app.inject({
      method: 'PUT',
      url: `/jobs/applications/${application.id}/status`,
      headers: { Authorization: `Bearer ${employerB.token}` },
      payload: { status: 'shortlisted' },
    });
    expect(hijackStatus.statusCode).toBe(403);

    // Employer A verifies candidate status remained untouched
    const appsRes = await app.inject({
      method: 'GET',
      url: `/jobs/${jobA.id}/applications`,
      headers: { Authorization: `Bearer ${employerA.token}` },
    });
    expect(appsRes.statusCode).toBe(200);
    const apps = JSON.parse(appsRes.payload) as Array<{ id: string; status: string }>;
    expect(apps.find((a) => a.id === application.id)?.status).toBe('applied');
  });

  it('ignores/rejects forged employerId / sponsored flags on job & seeker mutations', async () => {
    // Employer B attempts to spoof employerId in body when creating a job
    const createRes = await app.inject({
      method: 'POST',
      url: '/jobs',
      headers: { Authorization: `Bearer ${employerB.token}` },
      payload: {
        title: 'Spoofed Tenant Check',
        description: 'Testing tenant derivation',
        category: 'white',
        minPay: 20000,
        maxPay: 25000,
        city: 'Nagpur',
        district: 'Nagpur',
        openings: 1,
        employerId: employerA.id,
        employer_id: employerA.id,
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.payload) as { id: string; employerId: string };
    expect(created.employerId).toBe(employerB.id);
    expect(created.employerId).not.toBe(employerA.id);

    // Seeker attempts to inject is_sponsored/role tamper into profile update
    const profileRes = await app.inject({
      method: 'PUT',
      url: '/profiles/seeker/me',
      headers: { Authorization: `Bearer ${seekerA.token}` },
      payload: {
        fullName: 'Legit Candidate',
        seekerType: 'individual',
        city: 'Indore',
        dpdpConsentGiven: true,
        isSponsored: true,
        is_sponsored: true,
        role: 'admin',
      },
    });
    expect(profileRes.statusCode).toBe(200);
    const profile = await profileRepo.findSeekerProfileByUserId(seekerA.id);
    expect(Boolean(profile?.is_sponsored)).toBe(false);
    const seekerUser = await userRepo.findById(seekerA.id);
    expect(seekerUser?.role).toBe('job_seeker');
  });
});
