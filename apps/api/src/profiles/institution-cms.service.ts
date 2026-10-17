import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import {
  InstitutionCmsInput,
  CreateInstitutionInquiryInput,
  UpdateInquiryStatusInput,
  institutionCmsSchema,
} from '@indian-job-portal/validation';
import type { InstitutionProfileRow, InstitutionInquiryRow } from '@indian-job-portal/database';
import { ProfileRepository } from '../database/repositories/profile.repository.js';
import { InquiryRepository } from '../database/repositories/inquiry.repository.js';

export const DEFAULT_INSTITUTION_CMS: InstitutionCmsInput = {
  courses: [
    {
      id: 'c-default-1',
      name: 'Electrician (DGT & NCVT Approved)',
      code: 'ELE-201',
      duration: '2 Years (4 Semesters)',
      annualIntake: 60,
      eligibility: '10th Standard Pass (Science & Mathematics)',
      description:
        'Comprehensive training in industrial automation, domestic wiring, transformer maintenance, and safety protocols.',
    },
    {
      id: 'c-default-2',
      name: 'Fitter & CNC Machining',
      code: 'FIT-102',
      duration: '2 Years (4 Semesters)',
      annualIntake: 40,
      eligibility: '10th Standard Pass',
      description:
        'Practical lathe operations, precision measurement, CNC programming, and workshop assembly manufacturing.',
    },
    {
      id: 'c-default-3',
      name: 'Computer Operator & Programming Assistant (COPA)',
      code: 'COP-301',
      duration: '1 Year (2 Semesters)',
      annualIntake: 50,
      eligibility: '10th Standard Pass',
      description:
        'Office automation, database management, web fundamentals, Python scripting, and accounting software.',
    },
  ],
  subjects: [
    {
      id: 's-default-1',
      courseName: 'Electrician (DGT & NCVT Approved)',
      name: 'Trade Practical: Electrical Machines & Wiring',
      code: 'PR-ELE-01',
      semester: 'Semester 1',
      credits: 6,
      description: 'Hand tools, soldering, cable joints, earthing resistance testing.',
    },
    {
      id: 's-default-2',
      courseName: 'Electrician (DGT & NCVT Approved)',
      name: 'Trade Theory: AC/DC Fundamentals & Magnetism',
      code: 'TH-ELE-01',
      semester: 'Semester 1',
      credits: 4,
      description: 'Single-phase and three-phase AC systems, power factor calculation.',
    },
    {
      id: 's-default-3',
      courseName: 'Fitter & CNC Machining',
      name: 'Workshop Calculation & Science',
      code: 'WCS-FIT-01',
      semester: 'Semester 1',
      credits: 3,
      description: 'Applied physics, material stress-strain, cutting speeds.',
    },
  ],
  feeStructure: [
    {
      id: 'f-default-1',
      courseName: 'Electrician (DGT & NCVT Approved)',
      tuitionFee: 15000,
      developmentFee: 2000,
      examFee: 1000,
      hostelFee: 8000,
      oneTimeAdmissionFee: 1000,
      totalAnnualFee: 27000,
      remarks: 'Fee payable per semester. State Post-Matric Scholarship available.',
    },
    {
      id: 'f-default-2',
      courseName: 'Fitter & CNC Machining',
      tuitionFee: 14000,
      developmentFee: 2000,
      examFee: 1000,
      hostelFee: 8000,
      oneTimeAdmissionFee: 1000,
      totalAnnualFee: 26000,
      remarks: 'Includes protective safety kit and lab consumable insurance.',
    },
    {
      id: 'f-default-3',
      courseName: 'Computer Operator & Programming Assistant (COPA)',
      tuitionFee: 12000,
      developmentFee: 1500,
      examFee: 1000,
      hostelFee: 8000,
      oneTimeAdmissionFee: 500,
      totalAnnualFee: 23000,
      remarks: 'Includes high-speed internet lab access and cloud IDE access.',
    },
  ],
  departments: [
    {
      id: 'd-default-1',
      name: 'Electrical & Power Trades Department',
      hodName: 'Er. Rajesh Kumar',
      contactEmail: 'electrical@campus.edu.in',
      contactPhone: '+919876500001',
      labsCount: 4,
      description:
        'State-of-the-art power distribution simulators, transformer bays, and smart metering labs.',
    },
    {
      id: 'd-default-2',
      name: 'Mechanical & Tooling Department',
      hodName: 'Dr. Surendra Sharma',
      contactEmail: 'mechanical@campus.edu.in',
      contactPhone: '+919876500002',
      labsCount: 3,
      description:
        'Heavy industrial machining workshop with 12 precision lathes and 2 3-axis CNC machines.',
    },
  ],
  faculty: [
    {
      id: 'fac-default-1',
      name: 'Er. Rajesh Kumar',
      designation: 'Head of Department & Master Instructor',
      department: 'Electrical & Power Trades Department',
      qualification: 'B.Tech (Electrical), CITS Certified, Gold Medalist',
      experienceYears: 14,
      bio: 'Guided over 2,500 students into central PSU apprenticeships and smart grid maintenance.',
    },
    {
      id: 'fac-default-2',
      name: 'Dr. Surendra Sharma',
      designation: 'Dean of Technical Academics',
      department: 'Mechanical & Tooling Department',
      qualification: 'M.Tech, Ph.D. in Manufacturing Systems',
      experienceYears: 18,
      bio: 'Published author in precision tooling and former technical advisor to heavy engineering units.',
    },
  ],
  welcomeText:
    'Dedicated to building skilled technical talent for India manufacturing and infrastructure sectors.',
  updatedAt: new Date().toISOString(),
};

@Injectable()
export class InstitutionCmsService {
  constructor(
    @Inject(ProfileRepository) private readonly profileRepository: ProfileRepository,
    @Inject(InquiryRepository) private readonly inquiryRepository: InquiryRepository,
  ) {}

  /**
   * Public retrieval of Institution CMS Tabs data (INT-02)
   */
  async getCmsData(institutionId: string): Promise<InstitutionCmsInput> {
    const profile = await this.profileRepository.findInstitutionProfileById(institutionId);
    if (!profile) {
      // Fallback to sensible defaults
      return DEFAULT_INSTITUTION_CMS;
    }

    if (profile.cms_data && Object.keys(profile.cms_data).length > 0) {
      try {
        return institutionCmsSchema.parse(profile.cms_data);
      } catch {
        // Fall back to default if stored JSON does not match schema
        return DEFAULT_INSTITUTION_CMS;
      }
    }

    return DEFAULT_INSTITUTION_CMS;
  }

  /**
   * College staff updates course offerings, fee tables, and faculty (INT-02 & AC #1)
   */
  async updateCmsData(userId: string, cmsInput: InstitutionCmsInput): Promise<InstitutionCmsInput> {
    const validated = institutionCmsSchema.parse(cmsInput);
    const existing = await this.profileRepository.findInstitutionProfileByUserId(userId);

    const now = new Date().toISOString();
    const id = existing?.id || `inst_${userId}`;

    const updatedProfile: InstitutionProfileRow = {
      id,
      user_id: userId,
      institution_name: existing?.institution_name || 'Institution Campus',
      institution_type: existing?.institution_type || 'iti',
      affiliation: existing?.affiliation || null,
      affiliation_code: existing?.affiliation_code || null,
      establishment_year: existing?.establishment_year || null,
      principal_name: existing?.principal_name || null,
      contact_person: existing?.contact_person || 'Admissions Desk',
      contact_designation: existing?.contact_designation || null,
      contact_email: existing?.contact_email || null,
      contact_phone: existing?.contact_phone || null,
      website: existing?.website || null,
      address: existing?.address || null,
      city: existing?.city || null,
      district: existing?.district || null,
      state: existing?.state || null,
      pincode: existing?.pincode || null,
      trades_offered: existing?.trades_offered || [],
      annual_capacity: existing?.annual_capacity || null,
      placement_brochure_url: existing?.placement_brochure_url || null,
      about: existing?.about || null,
      is_sponsorship_active: existing?.is_sponsorship_active || false,
      sponsorship_tier: existing?.sponsorship_tier || 'Small',
      sponsorship_rate_per_student: existing?.sponsorship_rate_per_student || 150,
      sponsorship_expires_at: existing?.sponsorship_expires_at || null,
      total_sponsored_students: existing?.total_sponsored_students || 0,
      annual_sponsorship_fee: existing?.annual_sponsorship_fee || 0,
      cms_data: {
        ...validated,
        updatedAt: now,
      },
      source: existing?.source || 'direct',
      created_by: existing?.created_by || userId,
      updated_by: userId,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    await this.profileRepository.saveInstitutionProfile(updatedProfile);
    return validated;
  }

  /**
   * Prospective student submits an inquiry on the public institution page (INT-03 & AC #2)
   */
  async submitInquiry(input: CreateInstitutionInquiryInput): Promise<{
    success: boolean;
    inquiryId: string;
    message: string;
  }> {
    const id = `inq_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();

    const row: InstitutionInquiryRow = {
      id,
      institution_id: input.institutionId,
      student_name: input.studentName,
      student_phone: input.studentPhone,
      student_email: input.studentEmail || null,
      course_of_interest: input.courseOfInterest,
      qualification: input.qualification || null,
      city: input.city || null,
      state: input.state || 'Madhya Pradesh',
      message: input.message || null,
      status: 'new',
      source: 'public_portal',
      created_at: now,
      updated_at: now,
    };

    await this.inquiryRepository.saveInquiry(row);

    return {
      success: true,
      inquiryId: id,
      message: 'Inquiry submitted successfully. The college admissions desk will contact you soon.',
    };
  }

  /**
   * College staff view student inquiry leads in their dashboard (INT-03 & AC #2 & Invariant #5)
   */
  async getInstitutionInquiries(userId: string): Promise<InstitutionInquiryRow[]> {
    const profile = await this.profileRepository.findInstitutionProfileByUserId(userId);
    if (!profile) {
      return [];
    }

    return this.inquiryRepository.findInquiriesByInstitutionId(profile.id);
  }

  /**
   * College staff update lead status (INT-03 & Hard Invariant #5)
   */
  async updateInquiryStatus(
    userId: string,
    inquiryId: string,
    status: UpdateInquiryStatusInput['status'],
  ): Promise<InstitutionInquiryRow> {
    const profile = await this.profileRepository.findInstitutionProfileByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Institution profile not found');
    }

    const inquiry = await this.inquiryRepository.findInquiryById(inquiryId);
    if (!inquiry) {
      throw new NotFoundException('Inquiry not found');
    }

    // Hard Invariant #5: Only the owning institution can update their lead
    if (inquiry.institution_id !== profile.id) {
      throw new ForbiddenException('Unauthorized to modify inquiries of other institutions');
    }

    const updated = await this.inquiryRepository.updateInquiryStatus(inquiryId, status);
    if (!updated) {
      throw new NotFoundException('Failed to update inquiry status');
    }

    return updated;
  }
}
