import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import {
  JobSeekerProfileInput,
  BusinessProfileInput,
  InstitutionProfileInput,
} from '@indian-job-portal/validation';
import { ProfileRepository } from '../database/repositories/profile.repository.js';
import { UserRepository } from '../database/repositories/user.repository.js';
import type {
  JobSeekerProfileRow,
  BusinessProfileRow,
  InstitutionProfileRow,
} from '@indian-job-portal/database';

export interface SeekerProfileRecord extends JobSeekerProfileInput {
  id: string;
  userId: string;
  phone: string;
  email: string | null;
  completenessScore: number;
}

export interface BusinessProfileRecord extends BusinessProfileInput {
  id: string;
  userId: string;
}

export interface InstitutionProfileRecord extends InstitutionProfileInput {
  id: string;
  userId: string;
}

@Injectable()
export class ProfilesService {
  constructor(
    @Inject(ProfileRepository) private readonly profileRepository: ProfileRepository,
    @Inject(UserRepository) private readonly userRepository: UserRepository,
  ) {}

  // Calculate completeness score (JS-02 / Section 3.2 measure)
  private calculateCompleteness(input: JobSeekerProfileInput): number {
    let score = 20; // Base score
    if (input.fullName) score += 20;
    if (input.city) score += 20;
    if (input.skills && input.skills.length > 0) score += 20;
    if (input.photoUrl) score += 10;
    if (input.aadhaarLastFour || input.apaarId) score += 10;
    return Math.min(score, 100);
  }

  async getSeekerProfileMe(userId: string): Promise<SeekerProfileRecord> {
    const profile = await this.profileRepository.findSeekerProfileByUserId(userId);
    const user = await this.userRepository.findById(userId);

    if (!profile) {
      return {
        id: `seeker_${userId}`,
        userId,
        phone: user?.phone || '9876543210',
        email: user?.email || null,
        fullName: 'New Job Seeker',
        photoUrl: '',
        seekerType: 'individual',
        dpdpConsentGiven: false,
        skills: [],
        preferredCategories: ['white'],
        city: 'Indore',
        completenessScore: 40,
      };
    }

    const completenessScore = this.calculateCompleteness({
      fullName: profile.full_name,
      photoUrl: profile.photo_url || '',
      seekerType: profile.seeker_type as 'student' | 'individual',
      aadhaarLastFour: profile.aadhaar_last_four || undefined,
      apaarId: profile.apaar_id || undefined,
      skills: profile.skills,
      preferredCategories: (profile.preferred_categories as any) || [],
      city: profile.city || '',
      dpdpConsentGiven: profile.dpdp_consent_given ?? false,
    });

    return {
      id: profile.id,
      userId: profile.user_id,
      phone: user?.phone || '9876543210',
      email: user?.email || null,
      fullName: profile.full_name,
      photoUrl: profile.photo_url || '',
      seekerType: profile.seeker_type as 'student' | 'individual',
      aadhaarLastFour: profile.aadhaar_last_four || undefined,
      apaarId: profile.apaar_id || undefined,
      skills: profile.skills,
      preferredCategories: (profile.preferred_categories as any) || [],
      city: profile.city || '',
      district: profile.district || undefined,
      state: profile.state || undefined,
      pincode: profile.pincode || undefined,
      qualification: profile.qualification || undefined,
      institution: profile.institution || undefined,
      graduationYear: profile.graduation_year || undefined,
      experienceYears: profile.experience_years || undefined,
      currentRole: profile.current_role || undefined,
      languages: profile.languages || [],
      preferredLocations: profile.preferred_locations || [],
      willingToRelocate: profile.willing_to_relocate,
      bio: profile.bio || undefined,
      dpdpConsentGiven: profile.dpdp_consent_given ?? false,
      completenessScore,
    };
  }

  async updateSeekerProfileMe(userId: string, input: JobSeekerProfileInput): Promise<SeekerProfileRecord> {
    const completenessScore = this.calculateCompleteness(input);
    const existing = await this.profileRepository.findSeekerProfileByUserId(userId);
    const now = new Date().toISOString();
    const id = existing?.id || `seeker_${userId}`;

    const row: JobSeekerProfileRow = {
      id,
      user_id: userId,
      full_name: input.fullName,
      photo_url: input.photoUrl ?? null,
      seeker_type: input.seekerType as 'student' | 'individual',
      gender: null,
      dob: null,
      apaar_id: input.apaarId ?? null,
      aadhaar_last_four: input.aadhaarLastFour ?? null,
      aadhaar_verified: false,
      dpdp_consent_given: input.dpdpConsentGiven,
      skills: input.skills ?? [],
      preferred_categories: input.preferredCategories ?? [],
      city: input.city ?? null,
      district: input.district ?? null,
      state: input.state ?? null,
      pincode: input.pincode ?? null,
      qualification: input.qualification ?? null,
      institution: input.institution ?? null,
      graduation_year: input.graduationYear ?? null,
      experience_years: input.experienceYears ?? null,
      current_role: input.currentRole ?? null,
      languages: input.languages ?? [],
      preferred_locations: input.preferredLocations ?? [],
      willing_to_relocate: input.willingToRelocate,
      bio: input.bio ?? null,
      source: existing?.source || 'direct',
      created_by: existing?.created_by || userId,
      updated_by: userId,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    await this.profileRepository.saveSeekerProfile(row);
    const user = await this.userRepository.findById(userId);

    return {
      id,
      userId,
      phone: user?.phone || '9876543210',
      email: user?.email || null,
      ...input,
      completenessScore,
    };
  }

  // Hard Invariant #1: Employer/anyone never sees phone or email!
  async getSeekerProfilePublic(
    seekerId: string,
  ): Promise<Omit<SeekerProfileRecord, 'phone' | 'email' | 'aadhaarLastFour' | 'apaarId'>> {
    const profile = await this.profileRepository.findSeekerProfileById(seekerId);
    if (!profile) {
      throw new NotFoundException('Job seeker profile not found');
    }

    return {
      id: profile.id,
      userId: profile.user_id,
      fullName: profile.full_name,
      photoUrl: profile.photo_url || '',
      seekerType: profile.seeker_type as 'student' | 'individual',
      dpdpConsentGiven: profile.dpdp_consent_given ?? false,
      skills: profile.skills,
      preferredCategories: (profile.preferred_categories as any) || [],
      city: profile.city || '',
      completenessScore: 60,
    };
  }

  async getBusinessProfileMe(userId: string): Promise<BusinessProfileRecord> {
    const profile = await this.profileRepository.findBusinessProfileByUserId(userId);
    if (!profile) {
      return {
        id: `bus_${userId}`,
        userId,
        companyName: 'Sample Business Enterprise',
        ownershipType: 'Private Limited',
        companySize: 'Micro',
        sector: 'Services',
        address: '10 Main Road',
        city: 'Indore',
        district: 'Indore',
        logoUrl: '',
      };
    }
    return {
      id: profile.id,
      userId: profile.user_id,
      companyName: profile.company_name,
      ownershipType: profile.ownership_type,
      companySize: profile.company_size,
      sector: profile.sector || undefined,
      address: profile.address || undefined,
      city: profile.city || 'Indore',
      district: profile.district || 'Indore',
      state: profile.state || undefined,
      logoUrl: profile.logo_url || '',
      phone: profile.phone || undefined,
      email: profile.email || undefined,
      website: profile.website || undefined,
    };
  }

  async updateBusinessProfileMe(userId: string, input: BusinessProfileInput): Promise<BusinessProfileRecord> {
    const existing = await this.profileRepository.findBusinessProfileByUserId(userId);
    const id = existing?.id || `bus_${userId}`;
    const now = new Date().toISOString();

    const row: BusinessProfileRow = {
      id,
      user_id: userId,
      company_name: input.companyName,
      ownership_type: input.ownershipType,
      company_size: input.companySize,
      sector: input.sector ?? null,
      address: input.address ?? null,
      city: input.city ?? null,
      district: input.district ?? null,
      state: input.state ?? null,
      logo_url: input.logoUrl ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      website: input.website ?? null,
      source: existing?.source || 'direct',
      created_by: existing?.created_by || userId,
      updated_by: userId,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    await this.profileRepository.saveBusinessProfile(row);

    return {
      id,
      userId,
      ...input,
    };
  }

  async getBusinessProfilePublic(businessId: string): Promise<BusinessProfileRecord> {
    const profile = await this.profileRepository.findBusinessProfileById(businessId);
    if (!profile) {
      return {
        id: businessId,
        userId: 'usr_business_owner',
        companyName: 'MP MSME Enterprise',
        ownershipType: 'Proprietorship',
        companySize: 'Micro',
        sector: 'Manufacturing',
        address: 'Sector C, Industrial Area',
        city: 'Indore',
        district: 'Indore',
        logoUrl: '',
      };
    }
    return {
      id: profile.id,
      userId: profile.user_id,
      companyName: profile.company_name,
      ownershipType: profile.ownership_type,
      companySize: profile.company_size,
      sector: profile.sector || undefined,
      address: profile.address || undefined,
      city: profile.city || 'Indore',
      district: profile.district || 'Indore',
      state: profile.state || undefined,
      logoUrl: profile.logo_url || '',
      phone: profile.phone || undefined,
      email: profile.email || undefined,
      website: profile.website || undefined,
    };
  }

  // EMP-03: Generate QR code for business profile
  async generateBusinessQr(businessId: string): Promise<{ businessId: string; qrDataUrl: string }> {
    const webUrl = process.env['WEB_URL'] || 'http://localhost:3000';
    const profileUrl = `${webUrl}/company/${businessId}`;
    try {
      const QRCode = await import('qrcode');
      const qrDataUrl = await (QRCode.default || QRCode).toDataURL(profileUrl);
      return { businessId, qrDataUrl };
    } catch {
      return {
        businessId,
        qrDataUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      };
    }
  }

  async getInstitutionProfileMe(userId: string): Promise<InstitutionProfileRecord> {
    const profile = await this.profileRepository.findInstitutionProfileByUserId(userId);
    if (!profile) {
      return {
        id: `inst_${userId}`,
        userId,
        institutionName: 'State Institute of Technology',
        institutionType: 'iti',
        affiliation: 'State Board',
        address: 'Campus Grounds',
        contactPerson: 'Placement Head',
      };
    }
    return {
      id: profile.id,
      userId: profile.user_id,
      institutionName: profile.institution_name,
      institutionType: profile.institution_type || 'iti',
      affiliation: profile.affiliation || undefined,
      address: profile.address || undefined,
      contactPerson: profile.contact_person || undefined,
      contactDesignation: profile.contact_designation || undefined,
      contactEmail: profile.contact_email || undefined,
      contactPhone: profile.contact_phone || undefined,
      website: profile.website || undefined,
      city: profile.city || undefined,
      district: profile.district || undefined,
      state: profile.state || undefined,
      pincode: profile.pincode || undefined,
    };
  }

  async updateInstitutionProfileMe(
    userId: string,
    input: InstitutionProfileInput,
  ): Promise<InstitutionProfileRecord> {
    const existing = await this.profileRepository.findInstitutionProfileByUserId(userId);
    const id = existing?.id || `inst_${userId}`;
    const now = new Date().toISOString();

    const row: InstitutionProfileRow = {
      id,
      user_id: userId,
      institution_name: input.institutionName,
      institution_type: input.institutionType || 'iti',
      affiliation: input.affiliation ?? null,
      affiliation_code: null,
      establishment_year: null,
      principal_name: null,
      contact_person: input.contactPerson ?? null,
      contact_designation: input.contactDesignation ?? null,
      contact_email: input.contactEmail ?? null,
      contact_phone: input.contactPhone ?? null,
      website: input.website ?? null,
      address: input.address ?? null,
      city: input.city ?? null,
      district: input.district ?? null,
      state: input.state ?? null,
      pincode: input.pincode ?? null,
      trades_offered: [],
      annual_capacity: null,
      placement_brochure_url: null,
      about: null,
      source: existing?.source || 'direct',
      created_by: existing?.created_by || userId,
      updated_by: userId,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    await this.profileRepository.saveInstitutionProfile(row);

    return {
      id,
      userId,
      ...input,
    };
  }
}
