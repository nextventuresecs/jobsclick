import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';

describe('Ticket T-10 E2E: Wire Workspace Forms & 1-Click Apply to API', () => {
  let app: NestFastifyApplication;
  let postedJobId: string;
  let applicationRowId: string;

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

  it('handlePostJob: calls POST /jobs and persists active job posting (EMP-01 & JOB-01)', async () => {
    const postRes = await app.inject({
      method: 'POST',
      url: '/jobs',
      headers: { 'x-user-id': 'usr_employer_t10' },
      payload: {
        title: 'CNC Turner Specialist',
        description: 'Operate CNC Lathe and maintain tight tolerances (+/- 5 microns) on automotive shafts.',
        category: 'manufacturing',
        employmentType: 'Full-time',
        experienceLevel: '1-2 Years',
        minPay: 22000,
        maxPay: 32000,
        city: 'Pune',
        district: 'Pune',
        state: 'Maharashtra',
        openings: 3,
        skills: ['CNC Turning', 'Fanuc', 'Quality Inspection'],
      },
    });

    expect(postRes.statusCode).toBe(201);
    const createdJob = JSON.parse(postRes.payload);
    expect(createdJob.id).toBeDefined();
    expect(createdJob.title).toBe('CNC Turner Specialist');
    expect(createdJob.isActive).toBe(true);
    postedJobId = createdJob.id;
  });

  it('handleSaveProfile: calls PUT /profiles/seeker/me and persists candidate profile (JS-02 & AC #3)', async () => {
    const putProfileRes = await app.inject({
      method: 'PUT',
      url: '/profiles/seeker/me',
      headers: { 'x-user-id': 'usr_seeker_t10' },
      payload: {
        fullName: 'Rahul S. Sharma',
        seekerType: 'individual',
        gender: 'Male',
        dob: '2001-08-15',
        city: 'Pune',
        district: 'Pune',
        state: 'Maharashtra',
        qualification: 'ITI Machinist',
        institution: 'Govt ITI Pune',
        graduationYear: '2022',
        experienceYears: 2,
        currentRole: 'Junior Machinist',
        skills: ['CNC Turning', 'Vernier Caliper', 'Engineering Drawings'],
        languages: ['Marathi', 'Hindi', 'English'],
        preferredCategories: ['manufacturing'],
        preferredLocations: ['Pune', 'Pimpri-Chinchwad'],
        willingToRelocate: false,
        bio: 'Certified ITI machinist with 2 years practical experience in high-precision turning.',
        aadhaarLastFour: '4829',
        dpdpConsentGiven: true,
      },
    });

    expect(putProfileRes.statusCode).toBe(200);
    const savedProfile = JSON.parse(putProfileRes.payload);
    expect(savedProfile.fullName).toBe('Rahul S. Sharma');
    expect(savedProfile.completenessScore).toBeGreaterThanOrEqual(70);

    // Refresh simulation: GET /profiles/seeker/me loads the updated candidate data
    const refreshProfileRes = await app.inject({
      method: 'GET',
      url: '/profiles/seeker/me',
      headers: { 'x-user-id': 'usr_seeker_t10' },
    });

    expect(refreshProfileRes.statusCode).toBe(200);
    const refreshedProfile = JSON.parse(refreshProfileRes.payload);
    expect(refreshedProfile.fullName).toBe('Rahul S. Sharma');
    expect(refreshedProfile.city).toBe('Pune');
    expect(refreshedProfile.skills).toContain('CNC Turning');
  });

  it('JobApplyButton: calls POST /jobs/:id/apply and creates row in applications table (JOB-03 & AC #1)', async () => {
    const applyRes = await app.inject({
      method: 'POST',
      url: `/jobs/${postedJobId}/apply`,
      headers: { 'x-user-id': 'usr_seeker_t10' },
    });

    expect(applyRes.statusCode).toBe(201);
    const appData = JSON.parse(applyRes.payload);
    expect(appData.id).toBeDefined();
    expect(appData.jobId).toBe(postedJobId);
    expect(appData.applicantId).toBe('usr_seeker_t10');
    expect(appData.status).toBe('applied');
    applicationRowId = appData.id;

    // Duplicate check: second apply request should be rejected cleanly
    const dupRes = await app.inject({
      method: 'POST',
      url: `/jobs/${postedJobId}/apply`,
      headers: { 'x-user-id': 'usr_seeker_t10' },
    });
    expect(dupRes.statusCode).toBe(400);
    expect(JSON.parse(dupRes.payload).message).toContain('already applied');
  });

  it('Employer ATS View: GET /jobs/:id/applications strictly strips phone/email per Hard Invariant #1 (AC #2)', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: `/jobs/${postedJobId}/applications`,
      headers: { 'x-user-id': 'usr_employer_t10' },
    });

    expect(listRes.statusCode).toBe(200);
    const applications = JSON.parse(listRes.payload);
    expect(applications.length).toBeGreaterThan(0);

    const firstApp = applications[0];
    expect(firstApp.id).toBe(applicationRowId);
    expect(firstApp.applicantProfile).toBeDefined();

    // HARD INVARIANT #1: Phone and Email MUST NEVER be returned to employer or visible in ATS view
    expect(firstApp.applicantProfile.phone).toBeUndefined();
    expect(firstApp.applicantProfile.email).toBeUndefined();
    expect(firstApp.applicantProfile.fullName).toBe('Rahul S. Sharma');
    expect(firstApp.applicantProfile.skills).toContain('CNC Turning');
  });

  it('Seeker Workspace Refresh: GET /jobs/applications/my returns candidate applications (AC #3)', async () => {
    const myAppsRes = await app.inject({
      method: 'GET',
      url: '/jobs/applications/my',
      headers: { 'x-user-id': 'usr_seeker_t10' },
    });

    expect(myAppsRes.statusCode).toBe(200);
    const myApps = JSON.parse(myAppsRes.payload);
    expect(Array.isArray(myApps)).toBe(true);
    expect(myApps.some((a: { jobId: string }) => a.jobId === postedJobId)).toBe(true);
  });
});
