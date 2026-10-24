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
      companyId: a.companyId || 'comp-01',
      candidateId: a.applicantId,
      candidateName: a.applicantProfile?.fullName || 'Anita Sharma',
      candidateEducation: 'Trade Certified',
      candidateExperience: 'Vocational Experience',
      candidateSkills: a.applicantProfile?.skills || [],
      appliedDate: a.createdAt?.split('T')[0] ?? '2026-10-16',
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
    if (res.ok) {
      const saved = await res.json();
      return { success: true, completenessScore: saved?.completenessScore };
    }
  } catch {
    // Offline fallback
  }
  return { success: false };
}
