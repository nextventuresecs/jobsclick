import { describe, it, expect } from 'vitest';
import {
  institutionCmsSchema,
  createInstitutionInquirySchema,
  updateInquiryStatusSchema,
  courseSchema,
  feeItemSchema,
} from '../src/institution-cms.js';

describe('Institution CMS & Inquiries Validation (INT-02, INT-03)', () => {
  it('validates a course item with defaults', () => {
    const course = courseSchema.parse({
      id: 'c-1',
      name: 'Electrician (ITI Trade)',
      duration: '2 Years',
      eligibility: '10th Standard Pass',
    });

    expect(course.name).toBe('Electrician (ITI Trade)');
    expect(course.annualIntake).toBe(60);
    expect(course.duration).toBe('2 Years');
  });

  it('validates fee table structure', () => {
    const feeItem = feeItemSchema.parse({
      id: 'f-1',
      courseName: 'Electrician (ITI Trade)',
      tuitionFee: 18000,
      developmentFee: 2000,
      examFee: 1000,
      totalAnnualFee: 21000,
      remarks: 'Payable in 2 installments',
    });

    expect(feeItem.tuitionFee).toBe(18000);
    expect(feeItem.totalAnnualFee).toBe(21000);
  });

  it('validates full institution CMS data', () => {
    const cms = institutionCmsSchema.parse({
      courses: [
        {
          id: 'c-1',
          name: 'Fitter Trade',
          duration: '2 Years',
          eligibility: '10th Pass',
          annualIntake: 40,
        },
      ],
      subjects: [
        {
          id: 's-1',
          courseName: 'Fitter Trade',
          name: 'Trade Theory & Workshop Calculation',
          semester: 'Year 1',
          credits: 6,
        },
      ],
      feeStructure: [
        {
          id: 'f-1',
          courseName: 'Fitter Trade',
          tuitionFee: 15000,
          totalAnnualFee: 15000,
        },
      ],
      departments: [
        {
          id: 'd-1',
          name: 'Mechanical Trades Department',
          hodName: 'Er. Rajesh Kumar',
          labsCount: 3,
        },
      ],
      faculty: [
        {
          id: 'fac-1',
          name: 'Er. Rajesh Kumar',
          designation: 'Head of Department & Instructor',
          department: 'Mechanical Trades Department',
          qualification: 'Diploma in Mech Engg, CITS Certified',
          experienceYears: 10,
          bio: '10+ years training ITI students in precision machining.',
        },
      ],
    });

    expect(cms.courses.length).toBe(1);
    expect(cms.departments.length).toBe(1);
    expect(cms.faculty.length).toBe(1);
  });

  it('validates student inquiry submission with DPDP consent (INT-03)', () => {
    const validInquiry = createInstitutionInquirySchema.parse({
      institutionId: 'inst-123',
      studentName: 'Aakash Sharma',
      studentPhone: '9876543210',
      studentEmail: 'aakash@example.com',
      courseOfInterest: 'Electrician (ITI Trade)',
      qualification: '10th Pass (MP Board)',
      city: 'Bhopal',
      state: 'Madhya Pradesh',
      message: 'Looking for morning batch timing and hostel details.',
      dpdpConsent: true,
    });

    expect(validInquiry.studentName).toBe('Aakash Sharma');
    expect(validInquiry.dpdpConsent).toBe(true);
  });

  it('rejects inquiry without DPDP consent or invalid phone', () => {
    expect(() =>
      createInstitutionInquirySchema.parse({
        institutionId: 'inst-123',
        studentName: 'Aakash Sharma',
        studentPhone: '12345', // invalid phone
        courseOfInterest: 'Electrician',
        qualification: '10th',
        city: 'Bhopal',
        dpdpConsent: true,
      }),
    ).toThrow();

    expect(() =>
      createInstitutionInquirySchema.parse({
        institutionId: 'inst-123',
        studentName: 'Aakash Sharma',
        studentPhone: '9876543210',
        courseOfInterest: 'Electrician',
        qualification: '10th',
        city: 'Bhopal',
        dpdpConsent: false, // missing consent
      }),
    ).toThrow();
  });

  it('validates inquiry status transitions', () => {
    const updated = updateInquiryStatusSchema.parse({
      status: 'contacted',
      notes: 'Called candidate. Invited for campus visit on Monday.',
    });
    expect(updated.status).toBe('contacted');
  });
});
