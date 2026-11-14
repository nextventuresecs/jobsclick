import * as Sentry from '@sentry/nextjs';
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
  const effectiveSlug = j.slug || (j.id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(j.id) ? j.id : '');
  const companySlug = j.companySlug || '';

  // Task 3: remove employerId/companyId fallback for companyId.
  // If companySlug is missing, omit the link and report to Sentry; never render an internal id.
  if (!companySlug) {
    try {
      Sentry.captureMessage(
        `Job mapping missing companySlug for job: ${effectiveSlug || 'unknown'}`,
        'warning',
      );
    } catch {
      // ignore
    }
  }

  return {
    id: effectiveSlug || j.id || '',
    slug: effectiveSlug || undefined,
    companySlug: companySlug || undefined,
    title: j.title,
    companyName: j.companyName || defaultCompanyName || 'Verified Enterprise',
    companyId: companySlug,
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
