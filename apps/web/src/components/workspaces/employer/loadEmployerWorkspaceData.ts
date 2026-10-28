import type { CompanyItem } from '../../../data/sampleCompanies';
import type { JobItem } from '../../../data/sampleJobs';
import type { ApplicationData } from '../../../data/sampleWorkspaces';
import {
  fetchBusinessProfile,
  fetchEmployerJobs,
  fetchJobApplications,
} from './employerApi';

interface LoaderParams {
  apiUrl: string;
  authHeader: string;
  userId: string;
  company: CompanyItem;
  companyJobs?: JobItem[];
  setCompany: React.Dispatch<React.SetStateAction<CompanyItem>>;
  syncFromBusinessProfile: (busProfile: Record<string, string | undefined>) => void;
  setCompanyJobs: React.Dispatch<React.SetStateAction<JobItem[]>>;
  setApplicants: React.Dispatch<React.SetStateAction<readonly ApplicationData[]>>;
}

export function loadEmployerWorkspaceData({
  apiUrl, authHeader, userId, company,
  setCompany, syncFromBusinessProfile, setCompanyJobs, setApplicants,
}: LoaderParams) {
  let isMounted = true;

  fetchBusinessProfile(apiUrl, authHeader, userId).then((busProfile) => {
    if (busProfile && isMounted && busProfile.companyName) {
      setCompany((prev) => ({
        ...prev,
        name: busProfile.companyName || prev.name,
        sector: busProfile.sector || prev.sector,
        address: busProfile.address || prev.address,
        city: busProfile.city || prev.city,
        district: busProfile.district || prev.district,
        state: busProfile.state || prev.state,
        ownershipType: (busProfile.ownershipType as CompanyItem['ownershipType']) || prev.ownershipType,
        enterpriseSize: (busProfile.companySize as CompanyItem['enterpriseSize']) || prev.enterpriseSize,
      }));
      syncFromBusinessProfile(busProfile);
    }
  });

  fetchEmployerJobs(apiUrl, authHeader, userId, company.id).then(async (jobsData) => {
    if (!isMounted || !jobsData?.jobs) return;
    const apiJobs: JobItem[] = jobsData.jobs.map((j: {
      id: string; title: string; category: JobItem['category']; employmentType?: JobItem['employmentType'];
      experienceLevel?: JobItem['experienceLevel']; minPay?: number; maxPay?: number; openings?: number;
      city?: string; district?: string; state?: string; skills?: string[]; description?: string; createdAt?: string;
    }) => ({
      id: j.id, title: j.title, companyName: company.name, companyId: company.id,
      location: `${j.city || ''}, ${j.district || j.city || ''}`, district: j.district || j.city || '',
      state: j.state || 'Maharashtra', category: j.category, employmentType: j.employmentType || 'Full-time',
      salaryMin: j.minPay || 0, salaryMax: j.maxPay || 0, openings: j.openings || 1,
      experienceLevel: j.experienceLevel || '1-2 Years', skills: j.skills || [], description: j.description || '',
      requirements: ['Vocational certificate or relevant technical experience', 'Factory compliance and safety standard adherence'],
      postedDate: (j.createdAt?.split('T')[0] ?? '2026-10-16'), expiryDate: '2026-11-30', status: 'active',
      applicantCount: 0, isUrgent: false,
    }));

    setCompanyJobs(apiJobs);

    const loadedApps: ApplicationData[] = [];
    for (const j of apiJobs.slice(0, 10)) {
      const appsList = await fetchJobApplications(apiUrl, authHeader, userId, j.id);
      for (const a of appsList) {
        loadedApps.push({
          id: a.id, jobId: a.jobId, jobTitle: j.title, companyName: company.name, companyId: company.id,
          candidateId: a.applicantProfile?.seekerId || a.applicantId, candidateName: a.applicantProfile?.fullName || 'Candidate',
          candidateEducation: 'Trade Certified', candidateExperience: 'Vocational Experience',
          candidateSkills: a.applicantProfile?.skills || [], appliedDate: (a.createdAt?.split('T')[0] ?? '2026-10-16'),
          status: a.status,
        });
      }
    }
    if (isMounted) {
      setApplicants(loadedApps);
    }
  });

  return () => { isMounted = false; };
}
