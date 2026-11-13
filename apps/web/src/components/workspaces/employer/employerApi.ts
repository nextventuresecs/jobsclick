import type { CompanyItem } from '../../../data/sampleCompanies';
import type { JobItem } from '../../../data/sampleJobs';
import type { IndustryCategory, EmploymentType, ApplicationStatus } from '@indian-job-portal/validation';
import * as Sentry from '@sentry/nextjs';

export interface ApiJobRow {
  id: string;
  title: string;
  category: IndustryCategory;
  employmentType?: EmploymentType;
  experienceLevel?: JobItem['experienceLevel'];
  minPay?: number;
  maxPay?: number;
  openings?: number;
  city?: string;
  district?: string;
  state?: string;
  skills?: string[];
  description?: string;
  createdAt?: string;
}

export interface ApiAppRow {
  id: string;
  jobId: string;
  applicantId: string;
  status: ApplicationStatus;
  createdAt?: string;
  applicantProfile?: {
    seekerId?: string;
    fullName?: string;
    skills?: string[];
  };
}

export async function fetchBusinessProfile(apiUrl: string, authHeader: string, userId: string) {
  try {
    const res = await fetch(`${apiUrl}/profiles/business/me`, {
      headers: { Authorization: authHeader, 'x-user-id': userId },
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function fetchEmployerJobs(
  apiUrl: string,
  authHeader: string,
  userId: string,
  companyId?: string,
) {
  try {
    const url = companyId
      ? `${apiUrl}/jobs?companyId=${encodeURIComponent(companyId)}`
      : `${apiUrl}/jobs`;
    const res = await fetch(url, {
      headers: { Authorization: authHeader, 'x-user-id': userId },
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function fetchJobApplications(
  apiUrl: string,
  authHeader: string,
  userId: string,
  jobId: string
): Promise<ApiAppRow[]> {
  try {
    const res = await fetch(`${apiUrl}/jobs/${jobId}/applications`, {
      headers: { Authorization: authHeader, 'x-user-id': userId },
    });
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

export async function postNewJobApi(apiUrl: string, authHeader: string, userId: string, payload: unknown) {
  try {
    const res = await fetch(`${apiUrl}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader, 'x-user-id': userId },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const errMsg = errBody?.message || `Failed to create job posting (HTTP ${res.status})`;
      throw new Error(errMsg);
    }
    return await res.json();
  } catch (err) {
    Sentry.captureException(err, { tags: { operation: 'postNewJobApi', userId } });
    throw err;
  }
}

export async function updateAppStatusApi(
  apiUrl: string,
  authHeader: string,
  userId: string,
  appId: string,
  status: ApplicationStatus
) {
  try {
    const res = await fetch(`${apiUrl}/jobs/applications/${appId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader, 'x-user-id': userId },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const errMsg = errBody?.message || `Failed to update application status (HTTP ${res.status})`;
      throw new Error(errMsg);
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { operation: 'updateAppStatusApi', appId, status } });
    throw err;
  }
}

export async function updateBusinessProfileApi(
  apiUrl: string,
  authHeader: string,
  userId: string,
  company: CompanyItem
) {
  try {
    const res = await fetch(`${apiUrl}/profiles/business/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader, 'x-user-id': userId },
      body: JSON.stringify({
        companyName: company.name,
        ownershipType: company.ownershipType,
        companySize: company.enterpriseSize,
        sector: company.sector,
        address: company.address,
        city: company.city,
        district: company.district,
        state: company.state,
        phone: company.phone || undefined,
        email: company.email || undefined,
        website: company.website || undefined,
        yearOfRegistration: company.yearOfRegistration || undefined,
        commencementYear: company.commencementYear || undefined,
        founderOrDirector: company.founderOrDirector || undefined,
        directorPhotoUrl: company.directorPhotoUrl || undefined,
        designation: company.designation || undefined,
        knowMyBusiness: company.knowMyBusiness || undefined,
        productsBrief: company.productsBrief || undefined,
        servicesBrief: company.servicesBrief || undefined,
        socialMedia: company.socialMedia || undefined,
        isMsme: company.isMsme,
        udyamNumber: company.udyamNumber || undefined,
        isDpiitStartup: company.isDpiitStartup,
        dpiitNumber: company.dpiitNumber || undefined,
      }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const errMsg = errBody?.message || `Failed to save business profile (HTTP ${res.status})`;
      throw new Error(errMsg);
    }
    return await res.json().catch(() => ({ success: true }));
  } catch (err) {
    Sentry.captureException(err, { tags: { operation: 'updateBusinessProfileApi', userId } });
    throw err;
  }
}
