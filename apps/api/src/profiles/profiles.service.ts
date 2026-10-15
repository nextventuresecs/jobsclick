import { Injectable, NotFoundException } from '@nestjs/common';
import {
  JobSeekerProfileInput,
  BusinessProfileInput,
  InstitutionProfileInput,
} from '@indian-job-portal/validation';

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
  private seekerProfiles = new Map<string, SeekerProfileRecord>();
  private businessProfiles = new Map<string, BusinessProfileRecord>();
  private institutionProfiles = new Map<string, InstitutionProfileRecord>();

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
    const profile = Array.from(this.seekerProfiles.values()).find((p) => p.userId === userId);
    if (!profile) {
      return {
        id: `seeker_${userId}`,
        userId,
        phone: '9876543210',
        email: null,
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
    return profile;
  }

  async updateSeekerProfileMe(userId: string, input: JobSeekerProfileInput): Promise<SeekerProfileRecord> {
    const completenessScore = this.calculateCompleteness(input);
    const existing = Array.from(this.seekerProfiles.values()).find((p) => p.userId === userId);
    const record: SeekerProfileRecord = {
      id: existing?.id || `seeker_${userId}`,
      userId,
      phone: '9876543210',
      email: null,
      ...input,
      completenessScore,
    };
    this.seekerProfiles.set(record.id, record);
    return record;
  }

  // Hard Invariant #1: Employer/anyone never sees phone or email!
  async getSeekerProfilePublic(seekerId: string): Promise<Omit<SeekerProfileRecord, 'phone' | 'email' | 'aadhaarLastFour' | 'apaarId'>> {
    const profile = this.seekerProfiles.get(seekerId);
    if (!profile) {
      throw new NotFoundException('Job seeker profile not found');
    }
    
    // Privacy strip
    const { phone: _phone, email: _email, aadhaarLastFour: _aadhaar, apaarId: _apaar, ...publicData } = profile;
    void _phone;
    void _email;
    void _aadhaar;
    void _apaar;
    return publicData;
  }

  async getBusinessProfileMe(userId: string): Promise<BusinessProfileRecord> {
    const profile = Array.from(this.businessProfiles.values()).find((p) => p.userId === userId);
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
    return profile;
  }

  async updateBusinessProfileMe(userId: string, input: BusinessProfileInput): Promise<BusinessProfileRecord> {
    const existing = Array.from(this.businessProfiles.values()).find((p) => p.userId === userId);
    const record: BusinessProfileRecord = {
      id: existing?.id || `bus_${userId}`,
      userId,
      ...input,
    };
    this.businessProfiles.set(record.id, record);
    return record;
  }

  async getBusinessProfilePublic(businessId: string): Promise<BusinessProfileRecord> {
    const profile = this.businessProfiles.get(businessId);
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
    return profile;
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
        qrDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      };
    }
  }

  async getInstitutionProfileMe(userId: string): Promise<InstitutionProfileRecord> {
    const profile = Array.from(this.institutionProfiles.values()).find((p) => p.userId === userId);
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
    return profile;
  }

  async updateInstitutionProfileMe(userId: string, input: InstitutionProfileInput): Promise<InstitutionProfileRecord> {
    const existing = Array.from(this.institutionProfiles.values()).find((p) => p.userId === userId);
    const record: InstitutionProfileRecord = {
      id: existing?.id || `inst_${userId}`,
      userId,
      ...input,
    };
    this.institutionProfiles.set(record.id, record);
    return record;
  }
}
