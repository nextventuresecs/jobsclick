import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { ProfileRepository } from '../src/database/repositories/profile.repository.js';

describe('Ticket T-18: Institution Public Page CMS & Inquiry Routing (INT-02, INT-03)', () => {
  let app: NestFastifyApplication;
  let profileRepo: ProfileRepository;
  let instToken: string;
  let instUserId: string;
  let institutionId: string;
  let otherToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    profileRepo = app.get(ProfileRepository);

    // 1. Authenticate institution user
    const instAuth = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: {
        phone: '+919876543219',
        otp: '123456',
        role: 'intermediary',
      },
    });
    const instData = instAuth.json();
    instToken = instData.accessToken;
    instUserId = instData.user.id;
    institutionId = `inst_${instUserId}`;

    // Create an institution profile record
    await profileRepo.saveInstitutionProfile({
      id: institutionId,
      user_id: instUserId,
      institution_name: 'Government ITI Bhopal',
      institution_type: 'iti',
      affiliation: 'NCVT / DGT India',
      affiliation_code: 'ITI-BPL-2024',
      establishment_year: 1985,
      principal_name: 'Dr. Anand Saxena',
      contact_person: 'Er. Rajesh Kumar',
      contact_designation: 'TPO & Admissions Head',
      contact_email: 'admissions@iti-bhopal.edu.in',
      contact_phone: '+919876543219',
      website: 'https://iti-bhopal.edu.in',
      address: 'Govindpura Industrial Area',
      city: 'Bhopal',
      district: 'Bhopal',
      state: 'Madhya Pradesh',
      pincode: '462023',
      trades_offered: ['Electrician', 'Fitter', 'Welder'],
      annual_capacity: 480,
      placement_brochure_url: null,
      about: 'Premier industrial training institute in Central India.',
      source: 'direct',
      created_by: instUserId,
      updated_by: instUserId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // 2. Authenticate second institution user for multi-tenancy verification
    const otherAuth = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: {
        phone: '+919111122222',
        otp: '123456',
        role: 'intermediary',
      },
    });
    const otherData = otherAuth.json();
    otherToken = otherData.accessToken;
    const otherUserId = otherData.user.id;

    // Create competitor institution profile
    await profileRepo.saveInstitutionProfile({
      id: `inst_${otherUserId}`,
      user_id: otherUserId,
      institution_name: 'Competitor College Indore',
      institution_type: 'engineering',
      affiliation: 'RGPV Bhopal',
      affiliation_code: 'ENG-IND-100',
      address: 'Indore Bypass',
      city: 'Indore',
      district: 'Indore',
      state: 'Madhya Pradesh',
      contact_person: 'Dean Admissions',
      source: 'direct',
      created_by: otherUserId,
      updated_by: otherUserId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('AC #1: College staff can edit course offerings and fee tables without developer assistance (INT-02)', () => {
    it('GET /profiles/institution/:id/cms returns standard tabs with default schema structure', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/profiles/institution/${institutionId}/cms`,
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(Array.isArray(data.courses)).toBe(true);
      expect(Array.isArray(data.subjects)).toBe(true);
      expect(Array.isArray(data.feeStructure)).toBe(true);
      expect(Array.isArray(data.departments)).toBe(true);
      expect(Array.isArray(data.faculty)).toBe(true);
    });

    it('PUT /profiles/institution/cms updates courses, fee tables, and faculty bios', async () => {
      const updatedCms = {
        courses: [
          {
            id: 'c-101',
            name: 'Electrician (DGT Approved)',
            code: 'ELE-01',
            duration: '2 Years',
            annualIntake: 80,
            eligibility: '10th Pass with Science and Mathematics',
            description: 'Hands-on domestic and industrial electrical installations.',
          },
        ],
        subjects: [
          {
            id: 's-101',
            courseName: 'Electrician (DGT Approved)',
            name: 'Trade Theory: Electrical Safety & Circuits',
            semester: 'Semester 1',
            credits: 6,
            description: 'Ohms law, circuit fundamentals, Earthing methods.',
          },
        ],
        feeStructure: [
          {
            id: 'f-101',
            courseName: 'Electrician (DGT Approved)',
            tuitionFee: 12000,
            developmentFee: 2000,
            examFee: 800,
            hostelFee: 6000,
            oneTimeAdmissionFee: 1000,
            totalAnnualFee: 21800,
            remarks: 'MP Government post-matric scholarship applicable.',
          },
        ],
        departments: [
          {
            id: 'd-101',
            name: 'Electrical Engineering Wing',
            hodName: 'Er. Rajesh Kumar',
            contactEmail: 'electrical@iti-bhopal.edu.in',
            contactPhone: '+919876543219',
            labsCount: 4,
            description: 'Equipped with 3-phase transformers, motors, and wiring bays.',
          },
        ],
        faculty: [
          {
            id: 'fac-101',
            name: 'Er. Rajesh Kumar',
            designation: 'Senior Craft Instructor',
            department: 'Electrical Engineering Wing',
            qualification: 'B.Tech Electrical, CITS Certified',
            experienceYears: 12,
            bio: 'Over a decade of training apprentices for BHEL and power grids.',
          },
        ],
        welcomeText: 'Welcome to Government ITI Bhopal. Admissions open for batch 2026-2027.',
      };

      const putRes = await app.inject({
        method: 'PUT',
        url: '/profiles/institution/cms',
        headers: {
          authorization: `Bearer ${instToken}`,
        },
        payload: updatedCms,
      });

      expect(putRes.statusCode).toBe(200);
      const savedData = putRes.json();
      expect(savedData.courses[0].name).toBe('Electrician (DGT Approved)');
      expect(savedData.feeStructure[0].totalAnnualFee).toBe(21800);
      expect(savedData.faculty[0].name).toBe('Er. Rajesh Kumar');

      // Verify public endpoint reflects changes immediately
      const publicRes = await app.inject({
        method: 'GET',
        url: `/profiles/institution/${institutionId}/cms`,
      });
      expect(publicRes.statusCode).toBe(200);
      const publicData = publicRes.json();
      expect(publicData.courses[0].name).toBe('Electrician (DGT Approved)');
      expect(publicData.feeStructure[0].tuitionFee).toBe(12000);
    });
  });

  describe('AC #2: Prospective students submitting an inquiry see confirmation, and lead appears in college dashboard (INT-03)', () => {
    let capturedInquiryId: string;

    it('POST /profiles/institution/inquiries captures student inquiry lead and returns confirmation', async () => {
      const inquiryPayload = {
        institutionId: institutionId,
        studentName: 'Manoj Patel',
        studentPhone: '+919876501234',
        studentEmail: 'manoj.patel@gmail.com',
        courseOfInterest: 'Electrician (DGT Approved)',
        qualification: '10th Standard Pass (78%)',
        city: 'Sehore',
        state: 'Madhya Pradesh',
        message: 'Requesting hostel accommodation details and scholarship forms.',
        dpdpConsent: true,
      };

      const res = await app.inject({
        method: 'POST',
        url: '/profiles/institution/inquiries',
        payload: inquiryPayload,
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.inquiryId).toBeDefined();
      expect(body.message).toContain('Inquiry submitted successfully');
      capturedInquiryId = body.inquiryId;
    });

    it('GET /profiles/institution/inquiries shows newly submitted inquiry lead in the college dashboard', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/profiles/institution/inquiries',
        headers: {
          authorization: `Bearer ${instToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const leads = res.json();
      expect(Array.isArray(leads)).toBe(true);
      const lead = leads.find((l: { id: string }) => l.id === capturedInquiryId);
      expect(lead).toBeDefined();
      expect(lead.student_name).toBe('Manoj Patel');
      expect(lead.student_phone).toBe('+919876501234');
      expect(lead.course_of_interest).toBe('Electrician (DGT Approved)');
      expect(lead.status).toBe('new');
    });

    it('PUT /profiles/institution/inquiries/:id/status allows institution staff to update lead status', async () => {
      const updateRes = await app.inject({
        method: 'PUT',
        url: `/profiles/institution/inquiries/${capturedInquiryId}/status`,
        headers: {
          authorization: `Bearer ${instToken}`,
        },
        payload: {
          status: 'contacted',
          notes: 'Admissions counselor called candidate and shared brochure on WhatsApp.',
        },
      });

      expect(updateRes.statusCode).toBe(200);
      const updated = updateRes.json();
      expect(updated.status).toBe('contacted');
    });

    it('prevents competitor institutions from viewing or updating other institutions leads (Hard Invariant #5)', async () => {
      // Other institution staff attempts to view leads
      const otherRes = await app.inject({
        method: 'GET',
        url: '/profiles/institution/inquiries',
        headers: {
          authorization: `Bearer ${otherToken}`,
        },
      });

      expect(otherRes.statusCode).toBe(200);
      const leads = otherRes.json();
      const leakedLead = leads.find((l: { id: string }) => l.id === capturedInquiryId);
      expect(leakedLead).toBeUndefined();

      // Other institution staff attempts to update status
      const unauthorizedUpdate = await app.inject({
        method: 'PUT',
        url: `/profiles/institution/inquiries/${capturedInquiryId}/status`,
        headers: {
          authorization: `Bearer ${otherToken}`,
        },
        payload: {
          status: 'admitted',
        },
      });
      expect(unauthorizedUpdate.statusCode).toBe(403);
    });
  });
});
