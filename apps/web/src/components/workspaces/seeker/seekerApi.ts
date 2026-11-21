import * as Sentry from '@sentry/nextjs';
import type { SeekerProfileData, ApplicationData } from '../../../data/sampleWorkspaces';

interface ApiCandidateAppRow {
  id: string;
  jobId: string;
  applicantId: string;
  jobTitle?: string;
  companyName?: string;
  companyId?: string;
  applicantProfile?: {
    fullName?: string;
    skills?: string[];
  };
  createdAt?: string;
  status?: ApplicationData['status'];
}

export async function fetchSeekerProfile(
  apiUrl: string,
  authHeader: string,
  userId: string
): Promise<Partial<SeekerProfileData> | null> {
  try {
    const res = await fetch(`${apiUrl}/profiles/seeker/me`, {
      headers: {
        Authorization: authHeader,
        'x-user-id': userId,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.fullName) return null;

    return {
      id: data.id,
      name: data.fullName,
      seekerType: data.seekerType,
      gender: data.gender,
      dob: data.dob,
      address: data.address,
      city: data.city,
      district: data.district,
      state: data.state,
      pincode: data.pincode,
      qualification: data.qualification,
      institution: data.institution,
      graduationYear: data.graduationYear,
      experienceYears: data.experienceYears,
      currentRole: data.currentRole,
      skills: data.skills && data.skills.length > 0 ? data.skills : undefined,
      languages: data.languages && data.languages.length > 0 ? data.languages : undefined,
      preferredCategories: data.preferredCategories || [],
      preferredLocations: data.preferredLocations && data.preferredLocations.length > 0 ? data.preferredLocations : undefined,
      willingToRelocate: data.willingToRelocate,
      bio: data.bio,
      aadhaarLastFour: data.aadhaarLastFour,
      apaarId: data.apaarId,
      dpdpConsentGiven: data.dpdpConsentGiven,
      completionPercentage: data.completenessScore,
      isOnboardingComplete: true,
    };
  } catch {
    return null;
  }
}

export async function fetchSeekerApplications(
  apiUrl: string,
  authHeader: string,
  userId: string
): Promise<ApplicationData[]> {
  try {
    const res = await fetch(`${apiUrl}/jobs/applications/my`, {
      headers: {
        Authorization: authHeader,
        'x-user-id': userId,
      },
    });
    if (!res.ok) return [];
    const appsData = await res.json();
    if (!Array.isArray(appsData)) return [];

    return (appsData as ApiCandidateAppRow[]).map((a) => ({
      id: a.id,
      jobId: a.jobId,
      jobTitle: a.jobTitle || 'Verified Technical Vacancy',
      companyName: a.companyName || 'Verified MSME Enterprise',
      companyId: a.companyId || '',
      candidateId: a.applicantId,
      candidateName: a.applicantProfile?.fullName || 'Candidate',
      candidateEducation: 'Trade Certified',
      candidateExperience: 'Vocational Experience',
      candidateSkills: a.applicantProfile?.skills || [],
      appliedDate: a.createdAt?.split('T')[0] ?? '',
      status: a.status || 'applied',
    }));
  } catch {
    return [];
  }
}

export async function saveSeekerProfile(
  apiUrl: string,
  authHeader: string,
  userId: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; completenessScore?: number }> {
  try {
    const res = await fetch(`${apiUrl}/profiles/seeker/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        'x-user-id': userId,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const message = errData?.message || `Failed to save seeker profile (${res.status} ${res.statusText})`;
      const error = new Error(message);
      Sentry.captureException(error, { extra: { apiUrl, status: res.status } });
      throw error;
    }
    const saved = await res.json();
    return { success: true, completenessScore: saved?.completenessScore };
  } catch (err) {
    Sentry.captureException(err, { extra: { apiUrl, userId } });
    throw err;
  }
}

export async function downloadSeekerPdfApi(
  apiUrl: string,
  authHeader: string,
  userId: string,
  candidateName?: string
): Promise<boolean> {
  try {
    const res = await fetch(`${apiUrl}/profiles/seeker/me/pdf`, {
      headers: {
        Authorization: authHeader,
        'x-user-id': userId,
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to download resume PDF (${res.status})`);
    }

    const contentType = res.headers.get('content-type') || '';
    let targetUrl: string;

    if (contentType.includes('application/json')) {
      const data = await res.json();
      targetUrl = data.downloadUrl;
    } else {
      const blob = await res.blob();
      targetUrl = typeof window !== 'undefined' && window.URL ? window.URL.createObjectURL(blob) : '';
    }

    if (targetUrl && typeof document !== 'undefined') {
      const a = document.createElement('a');
      a.href = targetUrl;
      const cleanName = (candidateName || 'Candidate').trim().replace(/[^a-zA-Z0-9]/g, '-');
      a.download = `${cleanName}-Resume.pdf`;
      if (document.body) {
        document.body.appendChild(a);
      }
      a.click();
      if (document.body && a.parentNode === document.body) {
        document.body.removeChild(a);
      }
      return true;
    }

    return Boolean(targetUrl);
  } catch (err) {
    Sentry.captureException(err, { extra: { apiUrl, userId } });
    return false;
  }
}
