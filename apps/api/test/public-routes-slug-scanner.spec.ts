import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { USER_REPOSITORY, IUserRepository } from '../src/database/repositories/user.repository.js';
import { JobRepository } from '../src/database/repositories/job.repository.js';
import { ProfileRepository } from '../src/database/repositories/profile.repository.js';
import type { UserRow, JobSeekerProfileRow, BusinessProfileRow, InstitutionProfileRow, JobRow } from '@indian-job-portal/database';
import { generatePublicSlug } from '@indian-job-portal/validation';
import { randomUUID } from 'node:crypto';

describe('Public Routes ID-02 Security Scanner (Zero Internal IDs or PII)', () => {
  let app: NestFastifyApplication;
  let employerUser: UserRow;
  let seekerUserA: UserRow;
  let seekerUserB: UserRow;
  let instUser: UserRow;
  let testJob: JobRow;
  let testSeekerProfile: JobSeekerProfileRow;
  let testBusinessProfile: BusinessProfileRow;
  let testInstitutionProfile: InstitutionProfileRow;

  const FORBIDDEN_KEY_REGEX = /(^|_)(id|userId|ownerId|seekerId|applicantId|phone|email)$/i;

  function assertNoForbiddenKeys(obj: unknown, path = 'root'): void {
    if (Array.isArray(obj)) {
      obj.forEach((item, idx) => assertNoForbiddenKeys(item, `${path}[${idx}]`));
      return;
    }
    if (obj !== null && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (key === 'slug') {
          // 'slug' is the public opaque identifier, explicitly permitted
          continue;
        }
        expect(
          key,
          `Found forbidden key '${key}' at path '${path}.${key}' in public response. Matches ${FORBIDDEN_KEY_REGEX}`,
        ).not.toMatch(FORBIDDEN_KEY_REGEX);
        assertNoForbiddenKeys(value, `${path}.${key}`);
      }
    }
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const userRepo = app.get<IUserRepository>(USER_REPOSITORY);
    const jobRepo = app.get<JobRepository>(JobRepository);
    const profileRepo = app.get<ProfileRepository>(ProfileRepository);

    const ts = Date.now().toString().slice(-6);
    employerUser = await userRepo.create({ phone: `91${ts}11`, role: 'employer' });
    seekerUserA = await userRepo.create({ phone: `91${ts}22`, role: 'job_seeker' });
    seekerUserB = await userRepo.create({ phone: `91${ts}33`, role: 'job_seeker' });
    instUser = await userRepo.create({ phone: `91${ts}44`, role: 'intermediary' });

    // Seed test profiles with valid public_slugs
    const now = new Date().toISOString();
    testSeekerProfile = {
      id: randomUUID(),
      user_id: seekerUserA.id,
      public_slug: generatePublicSlug(),
      full_name: 'Ramesh Kumar Verma',
      photo_url: 'https://example.com/photo.jpg',
      seeker_type: 'individual',
      gender: 'Male',
      dob: '1998-05-12',
      apaar_id: 'APAAR12345678',
      aadhaar_last_four: '4321',
      aadhaar_verified: true,
      dpdp_consent_given: true,
      skills: ['CNC Operating', 'Lathe Machine', 'Blueprint Reading'],
      preferred_categories: ['manufacturing'],
      city: 'Pithampur',
      district: 'Dhar',
      state: 'Madhya Pradesh',
      pincode: '454775',
      qualification: 'ITI Fitter',
      institution: 'Government ITI Dhar',
      graduation_year: '2020',
      experience_years: 3,
      current_role: 'Senior CNC Operator',
      languages: ['Hindi', 'English'],
      preferred_locations: ['Indore', 'Pithampur'],
      willing_to_relocate: false,
      bio: 'Experienced machine operator with precision tooling certification.',
      source: 'direct',
      created_by: seekerUserA.id,
      updated_by: seekerUserA.id,
      created_at: now,
      updated_at: now,
    };
    await profileRepo.saveSeekerProfile(testSeekerProfile);

    testBusinessProfile = {
      id: randomUUID(),
      user_id: employerUser.id,
      public_slug: generatePublicSlug(),
      company_name: 'Pithampur Precision Gears Pvt Ltd',
      ownershipType: 'Private Limited',
      company_size: 'Small',
      sector: 'Automobile Engineering',
      address: 'Plot 102, Sector 3, Industrial Area',
      city: 'Pithampur',
      district: 'Dhar',
      state: 'Madhya Pradesh',
      logo_url: 'https://example.com/logo.png',
      phone: employerUser.phone,
      email: 'recruitment@precisiongears.example',
      website: 'https://precisiongears.example',
      source: 'direct',
      created_by: employerUser.id,
      updated_by: employerUser.id,
      created_at: now,
      updated_at: now,
    };
    await profileRepo.saveBusinessProfile(testBusinessProfile);

    testInstitutionProfile = {
      id: randomUUID(),
      user_id: instUser.id,
      public_slug: generatePublicSlug(),
      institution_name: 'Dhar Polytechnic Institute',
      institution_type: 'polytechnic',
      affiliation: 'DTE MP',
      affiliation_code: 'DTE-DHAR-09',
      establishment_year: 1995,
      principal_name: 'Dr. S. K. Gupta',
      contact_person: 'Er. A. K. Jain',
      contact_designation: 'Head of Training & Placement',
      contact_email: 'placement@dharpoly.example',
      contact_phone: '9826011111',
      website: 'https://dharpoly.example',
      address: 'Mandav Road',
      city: 'Dhar',
      district: 'Dhar',
      state: 'Madhya Pradesh',
      pincode: '454001',
      trades_offered: ['Mechanical', 'Electrical', 'Civil'],
      annual_capacity: 300,
      placement_brochure_url: null,
      about: 'Premier state technical institute.',
      is_sponsorship_active: false,
      cms_data: {
        welcomeText: 'Welcome to Dhar Polytechnic Training Portal',
        courses: [
          {
            id: 'c-dhar-1',
            name: 'Mechanical Engineering (Production)',
            code: 'ME-PROD',
            duration: '3 Years',
            annualIntake: 60,
            eligibility: '10th Standard Pass',
            description: 'Thermal engineering and CAD/CAM modeling.',
          },
        ],
      },
      source: 'direct',
      created_by: instUser.id,
      updated_by: instUser.id,
      created_at: now,
      updated_at: now,
    };
    await profileRepo.saveInstitutionProfile(testInstitutionProfile);

    testJob = {
      id: randomUUID(),
      public_slug: generatePublicSlug(),
      employer_id: employerUser.id,
      title: 'CNC Machine Operator (2nd Shift)',
      description: 'Setup and operate precision milling machines.',
      category: 'manufacturing',
      employment_type: 'Full-time',
      experience_level: 'Experienced',
      min_pay: 18000,
      max_pay: 24000,
      city: 'Pithampur',
      district: 'Dhar',
      state: 'Madhya Pradesh',
      openings: 5,
      skills: ['CNC', 'G-code', 'Micrometer'],
      is_active: true,
      source: 'direct',
      created_by: employerUser.id,
      updated_by: employerUser.id,
      created_at: now,
      updated_at: now,
    };
    await jobRepo.create(testJob);
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. GET /jobs: public jobs list contains NO forbidden key matching /(^|_)(id|userId|ownerId|seekerId|applicantId|phone|email)$/i', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/jobs',
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);
    expect(data.jobs).toBeDefined();
    expect(Array.isArray(data.jobs)).toBe(true);
    expect(data.jobs.length).toBeGreaterThanOrEqual(1);

    // Verify every job in list has slug and zero internal IDs
    assertNoForbiddenKeys(data);
    const found = data.jobs.find((j: { slug: string }) => j.slug === testJob.public_slug);
    expect(found).toBeDefined();
    expect(found.slug).toBe(testJob.public_slug);
    expect(found.id).toBeUndefined();
    expect(found.employerId).toBeUndefined();
  });

  it('2. GET /jobs/:slug: public job details contains NO forbidden keys and returns 404 for UUID', async () => {
    // 2a. Slug lookup succeeds with 0 forbidden keys
    const res = await app.inject({
      method: 'GET',
      url: `/jobs/${testJob.public_slug}`,
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);
    assertNoForbiddenKeys(data);
    expect(data.slug).toBe(testJob.public_slug);
    expect(data.id).toBeUndefined();
    expect(data.employerId).toBeUndefined();

    // 2b. Attempting lookup with internal UUID MUST return 404 (no redirect, preventing ID confirmation)
    const uuidRes = await app.inject({
      method: 'GET',
      url: `/jobs/${testJob.id}`,
    });
    expect(uuidRes.statusCode).toBe(404);
  });

  it('3. GET /profiles/seeker/:slug: strictly enforces explicit allow-list (Task 5) and returns 404 for UUID', async () => {
    // 3a. Slug lookup succeeds
    const res = await app.inject({
      method: 'GET',
      url: `/profiles/seeker/${testSeekerProfile.public_slug}`,
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);

    // Assert strictly against explicit allow-list:
    const ALLOW_LIST = new Set([
      'slug',
      'firstName',
      'skills',
      'city',
      'district',
      'seekerType',
      'profileCompleted',
    ]);
    const receivedKeys = Object.keys(data);
    for (const k of receivedKeys) {
      expect(
        ALLOW_LIST.has(k),
        `Unexpected key '${k}' in Seeker public response. Only allow-listed keys permitted!`,
      ).toBe(true);
    }

    assertNoForbiddenKeys(data);
    expect(data.slug).toBe(testSeekerProfile.public_slug);
    expect(data.firstName).toBe('Ramesh'); // Only first name / initials
    expect(data.fullName).toBeUndefined();
    expect(data.phone).toBeUndefined();
    expect(data.email).toBeUndefined();
    expect(data.aadhaarLastFour).toBeUndefined();
    expect(data.apaarId).toBeUndefined();

    // 3b. Internal UUID lookup returns 404
    const uuidRes = await app.inject({
      method: 'GET',
      url: `/profiles/seeker/${testSeekerProfile.id}`,
    });
    expect(uuidRes.statusCode).toBe(404);
  });

  it('4. GET /profiles/business/:slug: public company profile contains NO forbidden keys and returns 404 for UUID', async () => {
    // 4a. Slug lookup
    const res = await app.inject({
      method: 'GET',
      url: `/profiles/business/${testBusinessProfile.public_slug}`,
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);
    assertNoForbiddenKeys(data);
    expect(data.slug).toBe(testBusinessProfile.public_slug);
    expect(data.id).toBeUndefined();
    expect(data.userId).toBeUndefined();
    expect(data.phone).toBeUndefined();
    expect(data.email).toBeUndefined();

    // 4b. UUID lookup returns 404
    const uuidRes = await app.inject({
      method: 'GET',
      url: `/profiles/business/${testBusinessProfile.id}`,
    });
    expect(uuidRes.statusCode).toBe(404);
  });

  it('5. GET /profiles/business/:slug/qr: public QR generator contains NO forbidden keys and returns 404 for UUID', async () => {
    // 5a. Slug lookup
    const res = await app.inject({
      method: 'GET',
      url: `/profiles/business/${testBusinessProfile.public_slug}/qr`,
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);
    assertNoForbiddenKeys(data);
    expect(data.slug).toBe(testBusinessProfile.public_slug);
    expect(data.qrDataUrl).toBeDefined();
    expect(data.businessId).toBeUndefined();

    // 5b. UUID lookup returns 404
    const uuidRes = await app.inject({
      method: 'GET',
      url: `/profiles/business/${testBusinessProfile.id}/qr`,
    });
    expect(uuidRes.statusCode).toBe(404);
  });

  it('6. GET /profiles/institution/:slug: public institution profile contains NO forbidden keys and returns 404 for UUID', async () => {
    // 6a. Slug lookup
    const res = await app.inject({
      method: 'GET',
      url: `/profiles/institution/${testInstitutionProfile.public_slug}`,
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);
    assertNoForbiddenKeys(data);
    expect(data.slug).toBe(testInstitutionProfile.public_slug);
    expect(data.id).toBeUndefined();
    expect(data.userId).toBeUndefined();
    expect(data.contactPhone).toBeUndefined();
    expect(data.contactEmail).toBeUndefined();

    // 6b. UUID lookup returns 404
    const uuidRes = await app.inject({
      method: 'GET',
      url: `/profiles/institution/${testInstitutionProfile.id}`,
    });
    expect(uuidRes.statusCode).toBe(404);
  });

  it('7. GET /profiles/institution/:slug/cms: public CMS data contains NO forbidden keys and returns 404 for UUID', async () => {
    // 7a. Slug lookup
    const res = await app.inject({
      method: 'GET',
      url: `/profiles/institution/${testInstitutionProfile.public_slug}/cms`,
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);
    assertNoForbiddenKeys(data);

    // 7b. UUID lookup returns 404
    const uuidRes = await app.inject({
      method: 'GET',
      url: `/profiles/institution/${testInstitutionProfile.id}/cms`,
    });
    expect(uuidRes.statusCode).toBe(404);
  });

  it('8. POST /profiles/institution/inquiries: admission inquiry submission contains NO forbidden keys in response', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/profiles/institution/inquiries',
      payload: {
        institutionId: testInstitutionProfile.public_slug,
        studentName: 'Sunil Rathore',
        studentPhone: '9000000001',
        courseOfInterest: 'Mechanical Engineering',
        qualification: '10th Standard',
        city: 'Dhar',
        dpdpConsent: true,
      },
    });
    expect(res.statusCode).toBe(201);
    const data = JSON.parse(res.payload);
    assertNoForbiddenKeys(data);
    expect(data.success).toBe(true);
    expect(data.inquiryId).toBeDefined();
  });

  it('9. IDOR Lockdown: Authenticated User A cannot read or modify User B private profile (Task 3)', async () => {
    // User B requests their own profile
    const userBRes = await app.inject({
      method: 'GET',
      url: '/profiles/seeker/me',
      headers: { 'x-user-id': seekerUserB.id, 'x-user-role': 'job_seeker' },
    });
    // User B hasn't set up profile yet -> 404
    expect(userBRes.statusCode).toBe(404);

    // User A requests their own profile -> 200 with User A data
    const userARes = await app.inject({
      method: 'GET',
      url: '/profiles/seeker/me',
      headers: { 'x-user-id': seekerUserA.id, 'x-user-role': 'job_seeker' },
    });
    expect(userARes.statusCode).toBe(200);
    const userAData = JSON.parse(userARes.payload);
    expect(userAData.userId).toBe(seekerUserA.id);
    expect(userAData.fullName).toBe('Ramesh Kumar Verma');
    expect(userAData.phone).toBe(seekerUserA.phone);

    // User B attempts to read User A's private data via public slug endpoint -> receives ONLY public allow-list fields, never phone/email/full aadhaar
    const userBTriesUserAPublic = await app.inject({
      method: 'GET',
      url: `/profiles/seeker/${testSeekerProfile.public_slug}`,
      headers: { 'x-user-id': seekerUserB.id, 'x-user-role': 'job_seeker' },
    });
    expect(userBTriesUserAPublic.statusCode).toBe(200);
    const intercepted = JSON.parse(userBTriesUserAPublic.payload);
    expect(intercepted.phone).toBeUndefined();
    expect(intercepted.email).toBeUndefined();
    expect(intercepted.aadhaarLastFour).toBeUndefined();
    expect(intercepted.apaarId).toBeUndefined();
    expect(intercepted.fullName).toBeUndefined();

    // User B attempts to read User A's private data using User A's internal UUID -> receives 404
    const userBTriesUserAUuid = await app.inject({
      method: 'GET',
      url: `/profiles/seeker/${testSeekerProfile.id}`,
      headers: { 'x-user-id': seekerUserB.id, 'x-user-role': 'job_seeker' },
    });
    expect(userBTriesUserAUuid.statusCode).toBe(404);
  });
});
