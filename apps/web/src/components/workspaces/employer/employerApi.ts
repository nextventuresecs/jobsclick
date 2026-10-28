import type { CompanyItem } from '../../../data/sampleCompanies';
import type { JobItem } from '../../../data/sampleJobs';
import type { IndustryCategory, EmploymentType, ApplicationStatus } from '@indian-job-portal/validation';

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
    return res.ok ? await res.json() : null;
  } catch {
    return null;
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
    await fetch(`${apiUrl}/jobs/applications/${appId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader, 'x-user-id': userId },
      body: JSON.stringify({ status }),
    });
  } catch {}
}

export async function updateBusinessProfileApi(
  apiUrl: string,
  authHeader: string,
  userId: string,
  company: CompanyItem
) {
  try {
    await fetch(`${apiUrl}/profiles/business/me`, {
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
      }),
    });
  } catch {}
}
