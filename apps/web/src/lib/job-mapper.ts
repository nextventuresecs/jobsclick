import type { JobItem } from '../data/sampleJobs';
import type { IndustryCategory } from '@indian-job-portal/validation';

export interface ApiJobPayload {
  readonly id?: string;
  readonly slug?: string;
  readonly title: string;
  readonly companyName?: string;
  readonly companyId?: string;
  readonly companySlug?: string;
  readonly employerId?: string;
  readonly city?: string;
  readonly district?: string;
  readonly state?: string;
  readonly category?: IndustryCategory;
  readonly employmentType?: JobItem['employmentType'];
  readonly minPay?: number;
  readonly maxPay?: number;
  readonly openings?: number;
  readonly experienceLevel?: JobItem['experienceLevel'];
  readonly skills?: readonly string[];
  readonly description?: string;
  readonly requirements?: readonly string[];
  readonly createdAt?: string;
  readonly expiryDate?: string;
  readonly isFeatured?: boolean;
}

export function mapApiJobToJobItem(j: ApiJobPayload, defaultCompanyName?: string): JobItem {
  const effectiveId = j.slug || j.id || '';
  return {
    id: effectiveId,
    slug: j.slug || j.id,
    companySlug: j.companySlug,
    title: j.title,
    companyName: j.companyName || defaultCompanyName || 'Verified Enterprise',
    companyId: j.companySlug || j.companyId || j.employerId || '',
    location: j.city || 'India',
    district: j.district || j.city || 'National',
    state: j.state || 'India',
    category: j.category || 'manufacturing',
    employmentType: j.employmentType || 'Full-time',
    salaryMin: j.minPay || 0,
    salaryMax: j.maxPay || 0,
    openings: j.openings || 1,
    experienceLevel: j.experienceLevel || 'Fresher',
    skills: Array.isArray(j.skills) ? j.skills : [],
    description: j.description || '',
    requirements: Array.isArray(j.requirements) ? j.requirements : [],
    postedDate: j.createdAt ? new Date(j.createdAt).toISOString() : new Date().toISOString(),
    expiryDate: j.expiryDate
      ? new Date(j.expiryDate).toISOString()
      : new Date(Date.now() + 90 * 86400000).toISOString(),
    isFeatured: j.isFeatured ?? false,
  };
}
