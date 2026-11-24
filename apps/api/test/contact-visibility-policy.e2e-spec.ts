import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { PersistentDatabaseStore, SUPABASE_CLIENT } from '../src/database/supabase.provider.js';
import { AuditLogRepository } from '../src/database/repositories/audit-log.repository.js';
import { UserRepository } from '../src/database/repositories/user.repository.js';
import { ProfilesService } from '../src/profiles/profiles.service.js';
import { BulkService } from '../src/bulk/bulk.service.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@indian-job-portal/database';

describe('Candidate Contact Visibility Policy & Audit Invariants (E2E)', () => {
  let app: NestFastifyApplication;
  let auditLogRepo: AuditLogRepository;
  let userRepo: UserRepository;
  let profilesService: ProfilesService;
  let supabase: SupabaseClient<Database>;
  const store = PersistentDatabaseStore.getInstance();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    auditLogRepo = app.get(AuditLogRepository);
    userRepo = app.get(UserRepository);
    profilesService = app.get(ProfilesService);
    supabase = app.get(SUPABASE_CLIENT);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    store.clearTable('users');
    store.clearTable('job_seeker_profiles');
    store.clearTable('institution_profiles');
    store.clearTable('jobs');
    store.clearTable('applications');
    store.clearTable('audit_logs');
    store.clearTable('institution_inquiries');

    // Seed Institution A & B users
    store.setRow('users', 'usr_inst_a', {
      id: 'usr_inst_a',
      role: 'institution',
      status: 'active',
      phone: '+919999000001',
      email: 'admin@itia.edu',
      source: 'web',
      created_at: new Date().toISOString(),
    });
    store.setRow('institution_profiles', 'inst_a', {
      id: 'inst_a',
      user_id: 'usr_inst_a',
      institution_name: 'Govt ITI Bhopal',
      created_at: new Date().toISOString(),
    });

    store.setRow('users', 'usr_inst_b', {
      id: 'usr_inst_b',
      role: 'institution',
      status: 'active',
      phone: '+919999000002',
      email: 'admin@itib.edu',
      source: 'web',
      created_at: new Date().toISOString(),
    });
    store.setRow('institution_profiles', 'inst_b', {
      id: 'inst_b',
      user_id: 'usr_inst_b',
      institution_name: 'Govt ITI Indore',
      created_at: new Date().toISOString(),
    });

    // Seed Students for Institution A
    store.setRow('users', 'usr_stu_1', {
      id: 'usr_stu_1',
      role: 'job_seeker',
      status: 'active',
      phone: '+919425188301',
      email: 'amitesh.c@iti.gov.in',
      source: 'institution_import',
      created_at: new Date().toISOString(),
    });
    store.setRow('job_seeker_profiles', 'jsp_stu_1', {
      id: 'jsp_stu_1',
      user_id: 'usr_stu_1',
      full_name: 'Amitesh Chouhan',
      institution_id: 'inst_a',
      city: 'Bhopal',
      skills: ['CNC Machinist'],
      created_at: new Date().toISOString(),
    });

    store.setRow('users', 'usr_stu_2', {
      id: 'usr_stu_2',
      role: 'job_seeker',
      status: 'active',
      phone: '+919753022194',
      email: 'pooja.v@iti.gov.in',
      source: 'institution_import',
      created_at: new Date().toISOString(),
    });
    store.setRow('job_seeker_profiles', 'jsp_stu_2', {
      id: 'jsp_stu_2',
      user_id: 'usr_stu_2',
      full_name: 'Pooja Vishwakarma',
      institution_id: 'inst_a',
      city: 'Bhopal',
      skills: ['Electrician'],
      created_at: new Date().toISOString(),
    });

    // Seed Student for Institution B
    store.setRow('users', 'usr_stu_3', {
      id: 'usr_stu_3',
      role: 'job_seeker',
      status: 'active',
      phone: '+919111438290',
      email: 'deepak.m@iti.gov.in',
      source: 'institution_import',
      created_at: new Date().toISOString(),
    });
    store.setRow('job_seeker_profiles', 'jsp_stu_3', {
      id: 'jsp_stu_3',
      user_id: 'usr_stu_3',
      full_name: 'Deepak Malviya',
      institution_id: 'inst_b',
      city: 'Indore',
      skills: ['COPA'],
      created_at: new Date().toISOString(),
    });

    // Seed Employer & Job
    store.setRow('users', 'usr_employer_1', {
      id: 'usr_employer_1',
      role: 'employer',
      status: 'active',
      phone: '+919826011111',
      email: 'hr@tata.com',
      source: 'web',
      created_at: new Date().toISOString(),
    });
    store.setRow('jobs', 'job_1', {
      id: 'job_1',
      employer_id: 'usr_employer_1',
      title: 'CNC Machinist Apprentice',
      description: 'CNC Machinist Apprentice position in Bhopal manufacturing plant.',
      category: 'manufacturing',
      city: 'Bhopal',
      state: 'Madhya Pradesh',
      min_pay: 15000,
      max_pay: 20000,
      skills: ['CNC Machinist'],
      is_active: true,
      created_at: new Date().toISOString(),
    });
    store.setRow('applications', 'app_1', {
      id: 'app_1',
      job_id: 'job_1',
      applicant_id: 'usr_stu_1',
      status: 'applied',
      source: 'web',
      created_at: new Date().toISOString(),
    });
  });

  describe('1. GET /profiles/institution/students - Role Boundaries & IDOR Lockdown', () => {
    it('Institution A sees ONLY its OWN students with full contact details and writes an audit log without PII', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/profiles/institution/students',
        headers: {
          'x-user-id': 'usr_inst_a',
          'x-user-role': 'institution',
        },
      });

      expect(res.statusCode).toBe(200);
      const students = JSON.parse(res.payload);
      expect(Array.isArray(students)).toBe(true);
      expect(students).toHaveLength(2);

      // Verify only Institution A's students returned
      const ids = students.map((s: { id: string }) => s.id);
      expect(ids).toContain('jsp_stu_1');
      expect(ids).toContain('jsp_stu_2');
      expect(ids).not.toContain('jsp_stu_3');

      // Verify full contacts visible for own students
      const stu1 = students.find((s: { id: string }) => s.id === 'jsp_stu_1');
      expect(stu1.phone).toBe('+919425188301');
      expect(stu1.email).toBe('amitesh.c@iti.gov.in');
      expect(stu1.contactVisible).toBe(true);

      // Verify exactly ONE audit log row created without phone or email values
      const auditLogs = await auditLogRepo.findAll();
      const viewLogs = auditLogs.filter((l) => l.action === 'INSTITUTION_STUDENT_CONTACTS_VIEWED');
      expect(viewLogs).toHaveLength(1);

      const log = viewLogs[0];
      expect(log.actor_id).toBe('usr_inst_a');
      expect(log.meta.institutionId).toBe('inst_a');
      expect(log.meta.count).toBe(2);
      expect(log.meta.studentIds).toEqual(['jsp_stu_1', 'jsp_stu_2'].slice(0, 100));
      const expectedSha256 = createHash('sha256').update(['jsp_stu_1', 'jsp_stu_2'].sort().join(',')).digest('hex');
      expect(log.meta.studentIdsSha256).toBe(expectedSha256);

      // Hard Invariant: No phone or email in audit meta
      const metaString = JSON.stringify(log.meta);
      expect(metaString).not.toContain('+919425188301');
      expect(metaString).not.toContain('amitesh.c@iti.gov.in');
      expect(metaString).not.toContain('phone');
      expect(metaString).not.toContain('email');
    });

    it('batches student contact lookup with 1,200 students into 3 chunks, not 1,200 calls', async () => {
      // Clear and seed exactly 1,200 students for Institution A
      store.clearTable('users');
      store.clearTable('job_seeker_profiles');
      store.clearTable('audit_logs');

      store.setRow('users', 'usr_inst_a', {
        id: 'usr_inst_a',
        role: 'institution',
        status: 'active',
        phone: '+919999000001',
        email: 'admin@itia.edu',
        source: 'web',
        created_at: new Date().toISOString(),
      });
      store.setRow('institution_profiles', 'inst_a', {
        id: 'inst_a',
        user_id: 'usr_inst_a',
        institution_name: 'Govt ITI Bhopal',
        created_at: new Date().toISOString(),
      });

      const studentIds: string[] = [];
      const usersTable = store.getTable('users');
      const profilesTable = store.getTable('job_seeker_profiles');
      const nowIso = new Date().toISOString();
      for (let i = 0; i < 1200; i++) {
        const uId = `usr_batch_stu_${i}`;
        const sId = `jsp_batch_stu_${i}`;
        studentIds.push(sId);
        usersTable[uId] = {
          id: uId,
          role: 'job_seeker',
          status: 'active',
          phone: `+9198000${String(i).padStart(5, '0')}`,
          email: `batch_stu_${i}@iti.gov.in`,
          source: 'institution_import',
          created_at: nowIso,
        };
        profilesTable[sId] = {
          id: sId,
          user_id: uId,
          full_name: `Batch Student ${i}`,
          institution_id: 'inst_a',
          city: 'Bhopal',
          skills: ['Machinist'],
          created_at: nowIso,
        };
      }
      store.save();

      const findByIdSpy = vi.spyOn(userRepo, 'findById');
      const findByIdsSpy = vi.spyOn(userRepo, 'findByIds');
      const supabaseFromSpy = vi.spyOn(supabase, 'from');

      const res = await app.inject({
        method: 'GET',
        url: '/profiles/institution/students',
        headers: {
          'x-user-id': 'usr_inst_a',
          'x-user-role': 'institution',
        },
      });

      expect(res.statusCode).toBe(200);
      const returnedStudents = JSON.parse(res.payload);
      expect(returnedStudents).toHaveLength(1200);

      // Per-student findById MUST NOT be called (0 calls, not 1,200 times)
      expect(findByIdSpy).toHaveBeenCalledTimes(0);

      // Batched findByIds was called exactly once by the service
      expect(findByIdsSpy).toHaveBeenCalledTimes(1);

      // Inside findByIds, queries to 'users' were chunked in groups of 500 (3 chunks for 1,200 ids: 500, 500, 200)
      const usersQueries = supabaseFromSpy.mock.calls.filter((call) => call[0] === 'users');
      expect(usersQueries.length).toBe(3);

      // Audit row verifies count, first 100 student IDs, and sha256 hash of sorted ID list
      const auditLogs = await auditLogRepo.findAll();
      const viewLogs = auditLogs.filter(
        (l) => l.action === 'INSTITUTION_STUDENT_CONTACTS_VIEWED' && l.meta.count === 1200,
      );
      expect(viewLogs).toHaveLength(1);
      const auditMeta = viewLogs[0].meta;
      expect((auditMeta.studentIds as string[]).length).toBe(100);
      expect(auditMeta.studentIds).toEqual(studentIds.slice(0, 100));

      const expectedFullSha256 = createHash('sha256').update(studentIds.sort().join(',')).digest('hex');
      expect(auditMeta.studentIdsSha256).toBe(expectedFullSha256);

      findByIdSpy.mockRestore();
      findByIdsSpy.mockRestore();
      supabaseFromSpy.mockRestore();
    });

    it('Institution B sees ONLY its OWN students and cannot read Institution A (IDOR Prevention)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/profiles/institution/students',
        headers: {
          'x-user-id': 'usr_inst_b',
          'x-user-role': 'institution',
        },
      });

      expect(res.statusCode).toBe(200);
      const students = JSON.parse(res.payload);
      expect(students).toHaveLength(1);
      expect(students[0].id).toBe('jsp_stu_3');
      expect(students[0].phone).toBe('+919111438290');
      expect(students[0].email).toBe('deepak.m@iti.gov.in');
    });

    it('rejects employer with 403 Forbidden', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/profiles/institution/students',
        headers: {
          'x-user-id': 'usr_employer_1',
          'x-user-role': 'employer',
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects msme_admin with 403 Forbidden', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/profiles/institution/students',
        headers: {
          'x-user-id': 'usr_msme',
          'x-user-role': 'msme_admin',
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects unauthenticated caller with 401 Unauthorized', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/profiles/institution/students',
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('2. Hard Invariant #1: Employer Applicant JSON Contact Redaction', () => {
    it('employer applicant list completely excludes phone and email keys from JSON', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/jobs/job_1/applications',
        headers: {
          'x-user-id': 'usr_employer_1',
          'x-user-role': 'employer',
        },
      });

      expect(res.statusCode).toBe(200);
      const apps = JSON.parse(res.payload);
      expect(apps).toHaveLength(1);

      const appRecord = apps[0];
      // Neither root nor applicantProfile can contain phone or email keys
      expect('phone' in appRecord).toBe(false);
      expect('email' in appRecord).toBe(false);
      expect('phone' in appRecord.applicantProfile).toBe(false);
      expect('email' in appRecord.applicantProfile).toBe(false);

      const jsonStr = JSON.stringify(appRecord);
      expect(jsonStr).not.toContain('+919425188301');
      expect(jsonStr).not.toContain('amitesh.c@iti.gov.in');
    });
  });

  describe('3. Audit Failure Fail-Closed Policy', () => {
    it('returns contacts redacted (null) when audit log write fails', async () => {
      // Temporarily mock append on auditLogRepo to fail
      const origAppend = auditLogRepo.append;
      auditLogRepo.append = async () => {
        throw new Error('Database disk full / connection timeout');
      };

      try {
        const students = await profilesService.getInstitutionStudents('usr_inst_a', 'institution');
        expect(students).toHaveLength(2);
        for (const stu of students) {
          expect(stu.phone).toBeNull();
          expect(stu.email).toBeNull();
          expect(stu.contactVisible).toBe(false);
        }
      } finally {
        auditLogRepo.append = origAppend;
      }
    });
  });

  describe('4. Inquiries & Admin Audit Verification (Zero Contact PII in Logs)', () => {
    const inquiry = {
      id: 'inq_1',
      institution_id: 'inst_a',
      student_name: 'Fixture Candidate',
      student_phone: '+919826099999',
      student_email: 'candidate@example.test',
      status: 'new',
    };
    const inquiryUrl = '/profiles/institution/inquiries';
    const institutionHeaders = { 'x-user-id': 'usr_inst_a', 'x-user-role': 'institution' };

    it.each(['GET', 'PUT'] as const)('blocks inquiry contacts on %s when audit persistence fails', async (method) => {
      store.setRow('institution_inquiries', inquiry.id, inquiry);
      const audit = vi.spyOn(auditLogRepo, 'append').mockRejectedValue(new Error('Audit database unavailable'));
      try {
        const res = await app.inject({
          method,
          url: method === 'GET' ? inquiryUrl : `${inquiryUrl}/${inquiry.id}/status`,
          headers: institutionHeaders,
          ...(method === 'PUT' ? { payload: { status: 'admitted' } } : {}),
        });
        expect(res.statusCode).toBe(503);
        expect(res.json()).toMatchObject({ code: 'AUDIT_LOG_UNAVAILABLE' });
        expect(res.body).not.toContain(inquiry.student_phone);
        expect(res.body).not.toContain(inquiry.student_email);
        expect(res.body).not.toContain('Audit database unavailable');
        expect(store.getTable('institution_inquiries')[inquiry.id]).toMatchObject({ status: 'new' });
      } finally {
        audit.mockRestore();
      }
    });

    it('audits the contact disclosure from an inquiry status update', async () => {
      store.setRow('institution_inquiries', inquiry.id, inquiry);
      const res = await app.inject({
        method: 'PUT',
        url: `${inquiryUrl}/${inquiry.id}/status`,
        headers: institutionHeaders,
        payload: { status: 'contacted' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: 'contacted', student_email: inquiry.student_email });
      expect(await auditLogRepo.findAll()).toContainEqual(expect.objectContaining({
        action: 'INSTITUTION_INQUIRY_STATUS_UPDATE_REQUESTED',
        actor_id: 'usr_inst_a',
        meta: { institutionId: 'inst_a', inquiryId: inquiry.id, status: 'contacted' },
      }));
    });

    it('records INSTITUTION_INQUIRIES_VIEWED when inquiries are read', async () => {
      store.setRow('institution_inquiries', 'inq_1', {
        id: 'inq_1',
        institution_id: 'inst_a',
        student_name: 'Rohit Verma',
        phone: '+919826099999',
        email: 'rohit@example.com',
        created_at: new Date().toISOString(),
      });

      const res = await app.inject({
        method: 'GET',
        url: '/profiles/institution/inquiries',
        headers: {
          'x-user-id': 'usr_inst_a',
          'x-user-role': 'institution',
        },
      });

      expect(res.statusCode).toBe(200);
      const auditLogs = await auditLogRepo.findAll();
      const inqLog = auditLogs.find((l) => l.action === 'INSTITUTION_INQUIRIES_VIEWED');
      expect(inqLog).toBeDefined();
      expect(inqLog?.actor_id).toBe('usr_inst_a');
      expect(inqLog?.meta.institutionId).toBe('inst_a');
      expect(inqLog?.meta.count).toBe(1);

      // Verify no contact PII in audit meta
      const meta = JSON.stringify(inqLog?.meta);
      expect(meta).not.toContain('+919826099999');
      expect(meta).not.toContain('rohit@example.com');
    });

    it('records BULK_ERROR_REPORT_DOWNLOADED when bulk error report is downloaded', async () => {
      const bulkService = app.get(BulkService);
      (bulkService as unknown as { memBatches: Map<string, unknown> })['memBatches'].set('mock_batch_123', {
        id: 'mock_batch_123',
        createdBy: 'usr_admin_1',
        source: 'test',
        entityType: 'student',
        totalRows: 2,
        processedRows: 2,
        validRows: 0,
        errorRows: 2,
        status: 'completed',
        createdAt: new Date().toISOString(),
        errorCsvContent: 'row,phone,reason\n2,+919999999999,Invalid format\n3,+918888888888,Duplicate\n',
      });

      const res = await app.inject({
        method: 'GET',
        url: '/bulk/batches/mock_batch_123/error-report',
        headers: {
          'x-user-id': 'usr_admin_1',
          'x-user-role': 'admin',
        },
      });

      expect(res.statusCode).toBe(200);
      const auditLogs = await auditLogRepo.findAll();
      const bulkLog = auditLogs.find((l) => l.action === 'BULK_ERROR_REPORT_DOWNLOADED');
      expect(bulkLog).toBeDefined();
      expect(bulkLog?.actor_id).toBe('usr_admin_1');
      expect(bulkLog?.meta.batchId).toBe('mock_batch_123');
      expect(typeof bulkLog?.meta.errorRowCount).toBe('number');
    });
  });
});
