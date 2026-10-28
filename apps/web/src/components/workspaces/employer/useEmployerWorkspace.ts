'use client';

import { useState, useEffect } from 'react';
import type { CompanyItem } from '../../../data/sampleCompanies';

import type { JobItem } from '../../../data/sampleJobs';

import type { ApplicationData } from '../../../data/sampleWorkspaces';

import type { ApplicationStatus } from '@indian-job-portal/validation';
import { udyamNumberSchema, createJobSchema } from '@indian-job-portal/validation';
import { useCompanyProfileState } from './useCompanyProfileState';
import { useJobPostFormState } from './useJobPostFormState';
import { postNewJobApi, updateAppStatusApi, updateBusinessProfileApi } from './employerApi';
import { loadEmployerWorkspaceData } from './loadEmployerWorkspaceData';

interface UseEmployerWorkspaceProps {
  readonly user: { id?: string } | null;
  readonly accessToken: string | null;
  readonly addToast: (toast: { type: 'success' | 'error' | 'info'; title: string; message: string }) => void;
}

export function useEmployerWorkspace({ user, accessToken, addToast }: UseEmployerWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'post-job' | 'manage-jobs' | 'applicants' | 'qr-code' | 'profile'>('overview');
  const [company, setCompany] = useState<CompanyItem>({
    id: user?.id || '',
    name: 'Enterprise',
    sector: 'Manufacturing',
    address: '',
    city: '',
    district: '',
    state: '',
    description: '',
    ownershipType: 'Private Limited',
    enterpriseSize: 'Small',
    udyamNumber: '',
    verified: false,
    activeJobsCount: 0,
    logoUrl: '/images/companies/company-placeholder.svg',
  });
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(true);
  const [viewingApplicant, setViewingApplicant] = useState<ApplicationData | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const { formData: editFormData, syncFromBusinessProfile, getUpdatedCompany } = useCompanyProfileState(company);
  const postJobState = useJobPostFormState(company);

  const [companyJobs, setCompanyJobs] = useState<JobItem[]>([]);
  const [applicants, setApplicants] = useState<readonly ApplicationData[]>([]);
  const [applicantSearch, setApplicantSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredApplicants = applicants.filter((app) => {
    if (applicantSearch.trim()) {
      const q = applicantSearch.toLowerCase();
      const matchName = app.candidateName.toLowerCase().includes(q);
      const matchJob = app.jobTitle.toLowerCase().includes(q);
      if (!matchName && !matchJob) return false;
    }
    if (statusFilter !== 'all' && app.status !== statusFilter) return false;
    return true;
  });

  const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || process.env['API_URL'] || 'http://localhost:3001';
  const authHeader = accessToken ? `Bearer ${accessToken}` : `Bearer jwt_session_${user?.id || 'usr_employer_55'}_${Date.now()}`;
  const userId = user?.id || 'usr_employer_55';

  useEffect(() => {
    return loadEmployerWorkspaceData({
      apiUrl, authHeader, userId, company,
      setCompany, syncFromBusinessProfile, setCompanyJobs, setApplicants,
    });
  }, [accessToken, user, company.id]);

  const handlePostJob = async (e: React.FormEvent) => {
    e.preventDefault();
    postJobState.setFormErrors([]);
    const parsedSkills = postJobState.skillsInput.split(',').map((s) => s.trim()).filter(Boolean);
    const jobPayload = {
      title: postJobState.title.trim(), description: postJobState.description.trim(),
      category: postJobState.category, employmentType: postJobState.employmentType,
      experienceLevel: postJobState.experienceLevel, minPay: Number(postJobState.salaryMin),
      maxPay: Number(postJobState.salaryMax), city: postJobState.jobCity.trim() || company.city,
      district: postJobState.jobDistrict.trim() || company.district, state: company.state,
      openings: Number(postJobState.openings), skills: parsedSkills,
    };

    const validation = createJobSchema.safeParse(jobPayload);
    if (!validation.success) {
      const errs = validation.error.issues.map((i) => i.message);
      postJobState.setFormErrors(errs);
      addToast({ type: 'error', title: 'Validation Error', message: errs[0] || 'Please review fields.' });
      return;
    }

    const created = await postNewJobApi(apiUrl, authHeader, userId, validation.data);
    const newJob: JobItem = {
      id: created?.id || `job-${Date.now()}`, title: postJobState.title.trim(), companyName: company.name,
      companyId: company.id, location: postJobState.plantLocation.trim() || company.address,
      district: postJobState.jobDistrict.trim() || company.district, state: company.state,
      category: postJobState.category, employmentType: postJobState.employmentType,
      salaryMin: Number(postJobState.salaryMin), salaryMax: Number(postJobState.salaryMax),
      openings: Number(postJobState.openings), experienceLevel: postJobState.experienceLevel,
      skills: parsedSkills, description: postJobState.description.trim(),
      requirements: [`Qualification: ${postJobState.qualification}`, `Shift: ${postJobState.workShift}`, 'Valid certificate'],
      postedDate: new Date().toISOString().split('T')[0] ?? '2026-10-15',
      expiryDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? '2026-11-30',
      status: 'active', applicantCount: 0, isUrgent: false,
    };

    setCompanyJobs([newJob, ...companyJobs]);
    addToast({ type: 'success', title: 'Vacancy Published Successfully', message: `Position "${newJob.title}" is active.` });
    postJobState.setSuccessNotice(`Job posting "${newJob.title}" published successfully.`);
    postJobState.resetForm();
    setTimeout(() => { setActiveTab('manage-jobs'); postJobState.setSuccessNotice(''); }, 1200);
  };

  const handleUpdateStatus = async (appId: string, newStatus: ApplicationStatus) => {
    setApplicants((prev) => prev.map((a) => (a.id === appId ? { ...a, status: newStatus } : a)));
    await updateAppStatusApi(apiUrl, authHeader, userId, appId, newStatus);
    addToast({ type: 'info', title: 'Status Updated', message: `Candidate status set to "${newStatus}".` });
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (editFormData.formIsMsme && editFormData.formUdyamNumber) {
      const parsedUdyam = udyamNumberSchema.safeParse(editFormData.formUdyamNumber);
      if (!parsedUdyam.success) {
        addToast({ type: 'error', title: 'Invalid Udyam Number', message: 'Format must be UDYAM-XX-00-0000000' });
        return;
      }
    }
    const updated = getUpdatedCompany(company);
    setCompany(updated);
    setIsEditingProfile(false);
    setIsOnboardingComplete(true);
    updateBusinessProfileApi(apiUrl, authHeader, userId, updated);
    addToast({ type: 'success', title: 'Profile Updated Successfully', message: `${updated.name} profile saved.` });
  };

  return {
    activeTab, setActiveTab, company, isOnboardingComplete,
    isEditingProfile, setIsEditingProfile, companyJobs, applicants,
    filteredApplicants, viewingApplicant, setViewingApplicant,
    handlePostJob, handleUpdateStatus, handleSaveProfile,
    applicantSearch, setApplicantSearch, statusFilter, setStatusFilter,
    editFormData, postJobState,
  };
}
