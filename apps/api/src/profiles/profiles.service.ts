import { Injectable, NotFoundException, Inject, Optional } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import {
  JobSeekerProfileInput,
  BusinessProfileInput,
  InstitutionProfileInput,
  JobCategory,
  InstitutionType,
  generatePublicSlug,
} from '@indian-job-portal/validation';
import { ProfileRepository } from '../database/repositories/profile.repository.js';
import { UserRepository } from '../database/repositories/user.repository.js';
import { QueueService } from '../queue/queue.service.js';
import { SUPABASE_CLIENT } from '../database/supabase.provider.js';
import type {
  Database,
  JobSeekerProfileRow,
  BusinessProfileRow,
  InstitutionProfileRow,
} from '@indian-job-portal/database';

export interface SeekerProfileRecord extends JobSeekerProfileInput {
  id: string;
  slug?: string;
  userId: string;
  phone: string | null;
  email: string | null;
  completenessScore: number;
}

export interface SeekerPublicRecord {
  slug: string;
  firstName: string;
  skills: string[];
  city: string;
  district?: string;
  seekerType: string;
  profileCompleted: boolean;
}

export interface BusinessProfileRecord extends BusinessProfileInput {
  id: string;
  slug?: string;
  userId: string;
}

export interface BusinessPublicRecord {
  slug: string;
  companyName: string;
  ownershipType: string;
  companySize: string;
  sector: string;
  address: string;
  city: string;
  district: string;
  state?: string;
  logoUrl?: string;
  website?: string;
}

export interface InstitutionProfileRecord extends InstitutionProfileInput {
  id: string;
  slug?: string;
  userId: string;
}

export interface InstitutionPublicRecord {
  slug: string;
  institutionName: string;
  institutionType: string;
  affiliation?: string | null;
  affiliationCode?: string | null;
  establishmentYear?: number | null;
  principalName?: string | null;
  contactPerson?: string | null;
  contactDesignation?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  pincode?: string | null;
  tradesOffered: string[];
  annualCapacity?: number | null;
  about?: string | null;
  isSponsorshipActive: boolean;
}

@Injectable()
export class ProfilesService {
  constructor(
    @Inject(ProfileRepository) private readonly profileRepository: ProfileRepository,
    @Inject(UserRepository) private readonly userRepository: UserRepository,
    @Optional() @Inject(QueueService) private readonly queueService?: QueueService,
    @Optional() @Inject(SUPABASE_CLIENT) private readonly supabase?: SupabaseClient<Database>,
  ) {}

  // JS-03: Authenticated candidate CV PDF retrieval and generation dispatch
  async getSeekerPdfDownload(userId: string): Promise<{ downloadUrl: string; cached: boolean }> {
    const profile = await this.profileRepository.findSeekerProfileByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Job seeker profile not found');
    }

    const storagePath = `resumes/${profile.id}.pdf`;
    let downloadUrl = `https://storage.jobsclick.live/private/${storagePath}`;
    let cached = false;

    if (this.supabase) {
      try {
        const { data } = await this.supabase.storage.from('private').createSignedUrl(storagePath, 300);
        if (data?.signedUrl) {
          downloadUrl = data.signedUrl;
          cached = true;
        }
      } catch {
        // Fallback or not generated yet
      }
    }

    if (!cached && this.queueService) {
      await this.queueService.publishPdfJob({
        seekerId: profile.id,
        fullName: profile.full_name,
        seekerType: profile.seeker_type,
        city: profile.city || '',
        skills: profile.skills || [],
        updatedAt: Date.now(),
      });
    }

    return { downloadUrl, cached };
  }

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
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const profile = await this.profileRepository.findSeekerProfileByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Job seeker profile not found');
    }

    const completenessScore = this.calculateCompleteness({
      fullName: profile.full_name,
      photoUrl: profile.photo_url || '',
      seekerType: profile.seeker_type as 'student' | 'individual',
      aadhaarLastFour: profile.aadhaar_last_four || undefined,
      apaarId: profile.apaar_id || undefined,
      skills: profile.skills,
      preferredCategories: (profile.preferred_categories || []) as JobCategory[],
      city: profile.city || '',
      dpdpConsentGiven: profile.dpdp_consent_given ?? false,
    });

    return {
      id: profile.id,
      slug: profile.public_slug,
      userId: profile.user_id,
      phone: user.phone,
      email: user.email || null,
      fullName: profile.full_name,
      photoUrl: profile.photo_url || '',
      seekerType: profile.seeker_type as 'student' | 'individual',
      aadhaarLastFour: profile.aadhaar_last_four || undefined,
      apaarId: profile.apaar_id || undefined,
      skills: profile.skills,
      preferredCategories: (profile.preferred_categories || []) as JobCategory[],
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
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const completenessScore = this.calculateCompleteness(input);
    const existing = await this.profileRepository.findSeekerProfileByUserId(userId);
    const now = new Date().toISOString();
    const id = existing?.id || `seeker_${userId}`;

    const row: JobSeekerProfileRow = {
      id,
      user_id: userId,
      public_slug: existing?.public_slug || generatePublicSlug(),
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

    return {
      id,
      slug: row.public_slug,
      userId,
      phone: user.phone,
      email: user.email || null,
      ...input,
      completenessScore,
    };
  }

  // Hard Invariant #1 + ID-02: Public profile looks up by public_slug.
  // Response shape enforces strict allow-list (slug, firstName, skills, city, district, seekerType, profileCompleted).
  // Zero internal IDs, zero phone/email, zero sensitive fields.
  async getSeekerProfilePublic(slug: string): Promise<SeekerPublicRecord> {
    const profile = await this.profileRepository.findSeekerProfileByPublicSlug(slug);
    if (!profile) {
      throw new NotFoundException('Job seeker profile not found');
    }

    const firstName = profile.full_name ? profile.full_name.trim().split(/\s+/)[0] || '' : '';
    return {
      slug: profile.public_slug,
      firstName,
      skills: profile.skills || [],
      city: profile.city || '',
      district: profile.district || undefined,
      seekerType: profile.seeker_type,
      profileCompleted: Boolean(profile.city && (profile.skills || []).length > 0),
    };
  }

  async getBusinessProfileMe(userId: string): Promise<BusinessProfileRecord> {
    const profile = await this.profileRepository.findBusinessProfileByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Business profile not found');
    }
    return {
      id: profile.id,
      slug: profile.public_slug,
      userId: profile.user_id,
      companyName: profile.company_name,
      ownershipType: profile.ownership_type as BusinessProfileInput['ownershipType'],
      companySize: (profile.company_size || 'Small') as BusinessProfileInput['companySize'],
      sector: profile.sector || '',
      address: profile.address || '',
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
    const id = existing?.id || randomUUID();
    const now = new Date().toISOString();

    const row: BusinessProfileRow = {
      id,
      user_id: userId,
      public_slug: existing?.public_slug || generatePublicSlug(),
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
      slug: row.public_slug,
      userId,
      ...input,
    };
  }

  // ID-02: Public company profile looks up by public_slug.
  // Returns slug and company details; strictly strips internal id, userId, phone, email.
  async getBusinessProfilePublic(slug: string): Promise<BusinessPublicRecord> {
    const profile = await this.profileRepository.findBusinessProfileByPublicSlug(slug);
    if (!profile) {
      throw new NotFoundException('Business profile not found');
    }
    return {
      slug: profile.public_slug,
      companyName: profile.company_name,
      ownershipType: profile.ownership_type as BusinessProfileInput['ownershipType'],
      companySize: (profile.company_size || 'Small') as BusinessProfileInput['companySize'],
      sector: profile.sector || '',
      address: profile.address || '',
      city: profile.city || 'Indore',
      district: profile.district || 'Indore',
      state: profile.state || undefined,
      logoUrl: profile.logo_url || undefined,
      website: profile.website || undefined,
    };
  }

  // EMP-03 / ID-02: Generate QR code for business profile using public_slug
  async generateBusinessQr(slug: string): Promise<{ slug: string; qrDataUrl: string }> {
    const profile = await this.profileRepository.findBusinessProfileByPublicSlug(slug);
    if (!profile) {
      throw new NotFoundException('Business profile not found');
    }
    const webUrl = process.env['WEB_URL'] || 'http://localhost:3000';
    const profileUrl = `${webUrl}/company/${profile.public_slug}`;
    try {
      const QRCode = await import('qrcode');
      const qrDataUrl = await (QRCode.default || QRCode).toDataURL(profileUrl);
      return { slug: profile.public_slug, qrDataUrl };
    } catch {
      return {
        slug: profile.public_slug,
        qrDataUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      };
    }
  }

  async getInstitutionStudents(userId: string): Promise<JobSeekerProfileRow[]> {
    const institution = await this.profileRepository.findInstitutionProfileByUserId(userId);
    const instId = institution?.id || randomUUID();
    const instName = institution?.institution_name || '';

    const students = await this.profileRepository.findStudentsByInstitution(instId);
    if (students.length === 0 && instName) {
      const byName = await this.profileRepository.findStudentsByInstitution(instName);
      if (byName.length > 0) return byName;
    }
    return students;
  }

  async getInstitutionProfileMe(userId: string): Promise<InstitutionProfileRecord> {
    const profile = await this.profileRepository.findInstitutionProfileByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Institution profile not found');
    }
    return {
      id: profile.id,
      slug: profile.public_slug,
      userId: profile.user_id,
      institutionName: profile.institution_name,
      institutionType: (profile.institution_type || 'iti') as InstitutionType,
      affiliation: profile.affiliation || '',
      address: profile.address || '',
      contactPerson: profile.contact_person || '',
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
      public_slug: existing?.public_slug || generatePublicSlug(),
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
      slug: row.public_slug,
      userId,
      ...input,
    };
  }

  // ID-02: Public institution profile looks up by public_slug.
  // Strictly strips internal id, userId, and direct contact email/phone.
  async getInstitutionProfilePublic(slug: string): Promise<InstitutionPublicRecord | null> {
    const profile = await this.profileRepository.findInstitutionProfileByPublicSlug(slug);
    if (!profile) {
      return null;
    }
    return {
      slug: profile.public_slug,
      institutionName: profile.institution_name,
      institutionType: profile.institution_type || 'iti',
      affiliation: profile.affiliation,
      affiliationCode: profile.affiliation_code,
      establishmentYear: profile.establishment_year,
      principalName: profile.principal_name,
      contactPerson: profile.contact_person,
      contactDesignation: profile.contact_designation,
      website: profile.website,
      address: profile.address,
      city: profile.city,
      district: profile.district,
      state: profile.state,
      pincode: profile.pincode,
      tradesOffered: profile.trades_offered || [],
      annualCapacity: profile.annual_capacity,
      about: profile.about,
      isSponsorshipActive: profile.is_sponsorship_active || false,
    };
  }
}
