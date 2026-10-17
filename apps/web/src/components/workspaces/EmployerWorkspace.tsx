'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useApp } from '../../context/AppContext';
import { SAMPLE_COMPANIES, CompanyItem } from '../../data/sampleCompanies';
import { SAMPLE_JOBS, JobItem } from '../../data/sampleJobs';
import {
  INITIAL_APPLICATIONS,
  ApplicationData,
} from '../../data/sampleWorkspaces';
import { ProfileQrShareCard } from '../common/ProfileQrShareCard';
import {
  StatusBadge,
  JobStatusBadge,
  Button,
} from '@indian-job-portal/ui';
import type {
  IndustryCategory,
  ApplicationStatus,
  EmploymentType,
  ExperienceLevel,
} from '@indian-job-portal/validation';
import {
  udyamNumberSchema,
  createJobSchema,
  employmentTypeValues,
  experienceLevelValues,
} from '@indian-job-portal/validation';
import {
  Building2,
  PlusCircle,
  Briefcase,
  Users,
  QrCode,
  MapPin,
  CheckCircle2,
  ShieldCheck,
  Search,
  Eye,
  Edit3,
  AlertCircle,
  Award,
  Save,
  ExternalLink,
  X,
} from 'lucide-react';

export function EmployerWorkspace() {
  const t = useTranslations('EmployerWorkspace');
  const { user, accessToken, addToast } = useApp();
  const [activeTab, setActiveTab] = useState<'overview' | 'post-job' | 'manage-jobs' | 'applicants' | 'qr-code' | 'profile'>('overview');

  // Dynamic Company State (Default from sample, fully editable)
  const [company, setCompany] = useState<CompanyItem>(SAMPLE_COMPANIES[0]!);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(true);
  const [viewingApplicant, setViewingApplicant] = useState<ApplicationData | null>(null);

  // Profile Edit Mode state
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // Form State for Editable Profile (Reflecting Check sheet of msme_business_onboarding_template.xlsx)
  const [formOrgName, setFormOrgName] = useState(company.name);
  const [formOwnership, setFormOwnership] = useState<CompanyItem['ownershipType']>(company.ownershipType);
  const [formPhone, setFormPhone] = useState(company.phone || '9876543210');
  const [formEmail, setFormEmail] = useState(company.email || 'contact@company.in');
  const [formWebsite, setFormWebsite] = useState(company.website || 'www.company.in');
  const [formSector, setFormSector] = useState(company.sector);
  const [formYearReg, setFormYearReg] = useState(company.yearOfRegistration || '2019');
  const [formCommenceYear, setFormCommenceYear] = useState(company.commencementYear || '2018');
  const [formFounder, setFormFounder] = useState(company.founderOrDirector || 'Adhyant Patil');
  const [formDesignation, setFormDesignation] = useState(company.designation || 'Founder & Managing Director');
  const [formDirectorPhoto, setFormDirectorPhoto] = useState(company.directorPhotoUrl || '');
  const [formKnowMyBusiness, setFormKnowMyBusiness] = useState(company.knowMyBusiness || company.description);
  const [formProductsBrief, setFormProductsBrief] = useState(company.productsBrief || 'Precision CNC Machined Gears, Couplings');
  const [formServicesBrief, setFormServicesBrief] = useState(company.servicesBrief || 'VMC Milling, CMM Inspection, Heat Treatment');
  const [formAddress, setFormAddress] = useState(company.address);
  const [formCity, setFormCity] = useState(company.city);
  const [formDistrict, setFormDistrict] = useState(company.district);
  const [formState, setFormState] = useState(company.state);
  const [formCompanySize, setFormCompanySize] = useState<CompanyItem['enterpriseSize']>(company.enterpriseSize);
  const [formIsMsme, setFormIsMsme] = useState(company.isMsme ?? true);
  const [formUdyamNumber, setFormUdyamNumber] = useState(company.udyamNumber || 'UDYAM-MH-26-0019482');
  const [formIsDpiit, setFormIsDpiit] = useState(company.isDpiitStartup ?? true);
  const [formDpiitNumber, setFormDpiitNumber] = useState(company.dpiitNumber || 'DIPP-89102-MH');
  const [formInstagram, setFormInstagram] = useState(company.socialMedia?.instagram || 'https://instagram.com/enterprise');
  const [formFacebook, setFormFacebook] = useState(company.socialMedia?.facebook || 'https://facebook.com/enterprise');
  const [formYoutube, setFormYoutube] = useState(company.socialMedia?.youtube || 'https://youtube.com/@enterprise');
  const [formOtherSocial, setFormOtherSocial] = useState(company.socialMedia?.other || '');

  const [companyJobs, setCompanyJobs] = useState<JobItem[]>(
    SAMPLE_JOBS.filter((j) => j.companyId === company.id)
  );

  const [applicants, setApplicants] = useState<readonly ApplicationData[]>(
    INITIAL_APPLICATIONS.filter((a) => a.companyId === company.id)
  );

  // Post Job form state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<IndustryCategory>('manufacturing');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('Full-time');
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>('1-2 Years');
  const [workShift, setWorkShift] = useState<string>('Rotational');
  const [qualification, setQualification] = useState<string>('ITI / Trade Certificate');
  const [plantLocation, setPlantLocation] = useState(company.address);
  const [jobCity, setJobCity] = useState(company.city);
  const [jobDistrict, setJobDistrict] = useState(company.district);
  const [salaryMin, setSalaryMin] = useState(18000);
  const [salaryMax, setSalaryMax] = useState(28000);
  const [openings, setOpenings] = useState(2);
  const [skillsInput, setSkillsInput] = useState('CNC Milling, Blueprint Reading');
  const [description, setDescription] = useState('');
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [successNotice, setSuccessNotice] = useState('');

  // Applicant filters
  const [applicantSearch, setApplicantSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredApplicants = applicants.filter((app) => {
    if (applicantSearch.trim()) {
      const q = applicantSearch.toLowerCase();
      const matchName = app.candidateName.toLowerCase().includes(q);
      const matchJob = app.jobTitle.toLowerCase().includes(q);
      if (!matchName && !matchJob) return false;
    }
    if (statusFilter !== 'all' && app.status !== statusFilter) {
      return false;
    }
    return true;
  });

  // Refresh simulation: load business profile, jobs, and applicant pipeline on mount
  useEffect(() => {
    let isMounted = true;
    const apiUrl =
      process.env['NEXT_PUBLIC_API_URL'] ||
      process.env['API_URL'] ||
      'http://localhost:3001';
    const authHeader = accessToken
      ? `Bearer ${accessToken}`
      : `Bearer jwt_session_${user?.id || 'usr_employer_55'}_${Date.now()}`;
    const userId = user?.id || 'usr_employer_55';

    // 1. Fetch Employer Business Profile
    fetch(`${apiUrl}/profiles/business/me`, {
      headers: {
        Authorization: authHeader,
        'x-user-id': userId,
      },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((busProfile) => {
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
          setFormOrgName(busProfile.companyName || '');
          setFormSector(busProfile.sector || '');
          setFormAddress(busProfile.address || '');
          setFormCity(busProfile.city || '');
          setFormDistrict(busProfile.district || '');
          setFormState(busProfile.state || '');
        }
      })
      .catch(() => {});

    // 2. Fetch Active Jobs & Applicant Pipelines
    fetch(`${apiUrl}/jobs`, {
      headers: {
        Authorization: authHeader,
        'x-user-id': userId,
      },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then(async (jobsData) => {
        if (!isMounted || !jobsData?.jobs) return;
        interface ApiJobRow {
          id: string;
          title: string;
          category: IndustryCategory;
          employmentType?: EmploymentType;
          experienceLevel?: ExperienceLevel;
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

        const apiJobs: JobItem[] = (jobsData.jobs as ApiJobRow[]).map((j) => ({
          id: j.id,
          title: j.title,
          companyName: company.name,
          companyId: company.id,
          location: `${j.city || ''}, ${j.district || j.city || ''}`,
          district: j.district || j.city || '',
          state: j.state || 'Maharashtra',
          category: j.category,
          employmentType: j.employmentType || 'Full-time',
          salaryMin: j.minPay || 0,
          salaryMax: j.maxPay || 0,
          openings: j.openings || 1,
          experienceLevel: j.experienceLevel || '1-2 Years',
          skills: j.skills || [],
          description: j.description || '',
          requirements: [
            'Vocational certificate or relevant technical experience',
            'Factory compliance and safety standard adherence',
          ],
          postedDate: (j.createdAt?.split('T')[0] ?? '2026-10-16'),
          expiryDate: '2026-11-30',
          status: 'active',
          applicantCount: 0,
          isUrgent: false,
        }));

        if (apiJobs.length > 0) {
          setCompanyJobs((prev) => {
            const existingIds = new Set(apiJobs.map((j) => j.id));
            return [...apiJobs, ...prev.filter((p) => !existingIds.has(p.id))];
          });
        }

        // Fetch applications for all active jobs (Hard Invariant #1 strictly protected by API)
        const allJobsToCheck = [...apiJobs, ...companyJobs];
        const loadedApps: ApplicationData[] = [];

        interface ApiAppRow {
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

        for (const j of allJobsToCheck.slice(0, 10)) {
          try {
            const appRes = await fetch(`${apiUrl}/jobs/${j.id}/applications`, {
              headers: {
                Authorization: authHeader,
                'x-user-id': userId,
              },
            });
            if (appRes.ok) {
              const appsList = (await appRes.json()) as ApiAppRow[];
              for (const a of appsList) {
                loadedApps.push({
                  id: a.id,
                  jobId: a.jobId,
                  jobTitle: j.title,
                  companyName: company.name,
                  companyId: company.id,
                  candidateId: a.applicantProfile?.seekerId || a.applicantId,
                  candidateName: a.applicantProfile?.fullName || 'Candidate',
                  candidateEducation: 'Trade Certified',
                  candidateExperience: 'Vocational Experience',
                  candidateSkills: a.applicantProfile?.skills || [],
                  appliedDate: (a.createdAt?.split('T')[0] ?? '2026-10-16'),
                  status: a.status,
                });
              }
            }
          } catch {
            // Ignore individual job app errors
          }
        }

        if (isMounted && loadedApps.length > 0) {
          setApplicants((prev) => {
            const loadedIds = new Set(loadedApps.map((a) => a.id));
            return [...loadedApps, ...prev.filter((p) => !loadedIds.has(p.id))];
          });
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [accessToken, user]);

  const handlePostJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors([]);

    const parsedSkills = skillsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const jobPayload = {
      title: title.trim(),
      description: description.trim(),
      category,
      employmentType,
      experienceLevel,
      minPay: Number(salaryMin),
      maxPay: Number(salaryMax),
      city: jobCity.trim() || company.city,
      district: jobDistrict.trim() || company.district,
      state: company.state,
      openings: Number(openings),
      skills: parsedSkills,
    };

    const validation = createJobSchema.safeParse(jobPayload);

    if (!validation.success) {
      const errorMessages = validation.error.issues.map((issue) => issue.message);
      setFormErrors(errorMessages);
      addToast({
        type: 'error',
        title: 'Validation Error',
        message: errorMessages[0] || 'Please review and correct the job posting fields.',
      });
      return;
    }

    const apiUrl =
      process.env['NEXT_PUBLIC_API_URL'] ||
      process.env['API_URL'] ||
      'http://localhost:3001';
    const authHeader = accessToken
      ? `Bearer ${accessToken}`
      : `Bearer jwt_session_${user?.id || 'usr_employer_55'}_${Date.now()}`;
    const userId = user?.id || 'usr_employer_55';

    let createdId = `job-${Date.now()}`;

    try {
      const res = await fetch(`${apiUrl}/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
          'x-user-id': userId,
        },
        body: JSON.stringify(validation.data),
      });

      if (res.ok) {
        const createdData = await res.json();
        createdId = createdData.id || createdId;
      }
    } catch {
      // Local fallback in offline mode
    }

    const newJob: JobItem = {
      id: createdId,
      title: title.trim(),
      companyName: company.name,
      companyId: company.id,
      location: plantLocation.trim() || company.address,
      district: jobDistrict.trim() || company.district,
      state: company.state,
      category,
      employmentType,
      salaryMin: Number(salaryMin),
      salaryMax: Number(salaryMax),
      openings: Number(openings),
      experienceLevel,
      skills: parsedSkills,
      description: description.trim(),
      requirements: [
        `Qualification: ${qualification}`,
        `Shift: ${workShift}`,
        'Valid vocational certificate or relevant technical experience',
        'Compliance with factory safety standards',
      ],
      postedDate: new Date().toISOString().split('T')[0] ?? '2026-10-15',
      expiryDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? '2026-11-30',
      status: 'active',
      applicantCount: 0,
      isUrgent: false,
    };

    setCompanyJobs([newJob, ...companyJobs]);
    addToast({
      type: 'success',
      title: 'Vacancy Published Successfully',
      message: `Position "${newJob.title}" is now active and live for verified candidate applications.`,
    });
    setSuccessNotice(`Job posting "${newJob.title}" published successfully.`);
    setTitle('');
    setDescription('');
    setTimeout(() => {
      setActiveTab('manage-jobs');
      setSuccessNotice('');
    }, 1200);
  };

  const handleUpdateStatus = async (appId: string, newStatus: ApplicationStatus) => {
    setApplicants((prev) =>
      prev.map((a) => (a.id === appId ? { ...a, status: newStatus } : a))
    );

    const apiUrl =
      process.env['NEXT_PUBLIC_API_URL'] ||
      process.env['API_URL'] ||
      'http://localhost:3001';
    const authHeader = accessToken
      ? `Bearer ${accessToken}`
      : `Bearer jwt_session_${user?.id || 'usr_employer_55'}_${Date.now()}`;

    try {
      await fetch(`${apiUrl}/jobs/applications/${appId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
          'x-user-id': user?.id || 'usr_employer_55',
        },
        body: JSON.stringify({ status: newStatus }),
      });
      addToast({
        type: 'info',
        title: 'Status Updated',
        message: `Candidate application status set to "${newStatus}".`,
      });
    } catch {
      // Local state already updated
    }
  };

  // Handle Save Profile
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();

    if (formIsMsme && formUdyamNumber) {
      const parsedUdyam = udyamNumberSchema.safeParse(formUdyamNumber);
      if (!parsedUdyam.success) {
        addToast({
          type: 'error',
          title: 'Invalid Udyam Number',
          message: 'Format must be UDYAM-XX-00-0000000',
        });
        return;
      }
    }

    const updated: CompanyItem = {
      ...company,
      name: formOrgName.trim(),
      ownershipType: formOwnership,
      phone: formPhone.trim(),
      email: formEmail.trim(),
      website: formWebsite.trim(),
      sector: formSector.trim(),
      yearOfRegistration: formYearReg.trim(),
      commencementYear: formCommenceYear.trim(),
      founderOrDirector: formFounder.trim(),
      designation: formDesignation.trim(),
      directorPhotoUrl: formDirectorPhoto.trim(),
      knowMyBusiness: formKnowMyBusiness.trim(),
      description: formKnowMyBusiness.trim(),
      productsBrief: formProductsBrief.trim(),
      servicesBrief: formServicesBrief.trim(),
      address: formAddress.trim(),
      city: formCity.trim(),
      district: formDistrict.trim(),
      state: formState.trim(),
      enterpriseSize: formCompanySize,
      isMsme: formIsMsme,
      udyamNumber: formIsMsme ? formUdyamNumber.trim().toUpperCase() : '',
      isDpiitStartup: formIsDpiit,
      dpiitNumber: formIsDpiit ? formDpiitNumber.trim() : '',
      socialMedia: {
        instagram: formInstagram.trim(),
        facebook: formFacebook.trim(),
        youtube: formYoutube.trim(),
        other: formOtherSocial.trim(),
      },
      verified: formIsMsme,
    };

    setCompany(updated);
    setIsEditingProfile(false);
    setIsOnboardingComplete(true);

    const apiUrl =
      process.env['NEXT_PUBLIC_API_URL'] ||
      process.env['API_URL'] ||
      'http://localhost:3001';
    const authHeader = accessToken
      ? `Bearer ${accessToken}`
      : `Bearer jwt_session_${user?.id || 'usr_employer_55'}_${Date.now()}`;

    fetch(`${apiUrl}/profiles/business/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        'x-user-id': user?.id || 'usr_employer_55',
      },
      body: JSON.stringify({
        companyName: formOrgName.trim(),
        ownershipType: formOwnership,
        companySize: formCompanySize,
        sector: formSector.trim(),
        address: formAddress.trim(),
        city: formCity.trim(),
        district: formDistrict.trim(),
        state: formState.trim(),
      }),
    }).catch(() => {});

    addToast({
      type: 'success',
      title: 'Profile Updated Successfully',
      message: `${updated.name} profile and KYC information saved.`,
    });
  };

  return (
    <div className="space-y-8">
      {/* Onboarding Incomplete Alert Banner (for newly onboarded employers) */}
      {!isOnboardingComplete && (
        <div className="p-4 bg-orange-50 border border-orange-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-brand-orange shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-bold text-orange-950">
                {t('onboardingIncompleteTitle')}
              </h2>
              <p className="text-xs text-orange-800 mt-0.5">
                {t('onboardingIncompleteDesc')}
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setActiveTab('profile');
              setIsEditingProfile(true);
            }}
            className="shrink-0"
          >
            {t('completeOnboardingNow')}
          </Button>
        </div>
      )}

      {/* Employer Header */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-orange-50 border-2 border-orange-200 flex items-center justify-center shrink-0">
            <Building2 className="w-8 h-8 text-brand-orange" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{company.name}</h1>
              {company.isMsme && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>{t('verifiedMsmeBadge')}</span>
                </span>
              )}
              {company.isDpiitStartup && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                  <Award className="w-3 h-3 text-blue-600" />
                  <span>{t('dpiitBadge')}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-2">
              {company.udyamNumber && (
                <span className="font-mono text-gray-700 font-semibold">{company.udyamNumber}</span>
              )}
              <span>•</span>
              <span>{company.enterpriseSize} {t('enterprise')}</span>
              <span>•</span>
              <span>{company.ownershipType}</span>
              <span>•</span>
              <span>{company.city}, {company.state}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href={`/company/${company.id}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
            <span>{t('viewPublicProfile')}</span>
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setActiveTab('profile');
              setIsEditingProfile(true);
            }}
            className="inline-flex items-center gap-1.5"
          >
            <Edit3 className="w-4 h-4 text-gray-600" />
            <span>{t('editProfile')}</span>
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setActiveTab('post-job')}
            className="inline-flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{t('postVacancy')}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setActiveTab('qr-code')}
            className="inline-flex items-center gap-1.5"
          >
            <QrCode className="w-4 h-4" />
            <span>{t('walkinQr')}</span>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto gap-2">
        {([
          { id: 'overview', label: t('tabOverview'), icon: Briefcase },
          { id: 'manage-jobs', label: `${t('tabManageJobs')} (${companyJobs.length})`, icon: Eye },
          { id: 'post-job', label: t('tabPostJob'), icon: PlusCircle },
          { id: 'applicants', label: `${t('tabApplicants')} (${applicants.length})`, icon: Users },
          { id: 'profile', label: t('tabProfile'), icon: Building2 },
          { id: 'qr-code', label: t('tabWalkinPoster'), icon: QrCode },
        ] as const).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'border-[#F97316] text-[#EA580C] bg-[#FFF0E5]/30'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ================================================================ */}
      {/* TAB 1: OVERVIEW */}
      {/* ================================================================ */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">{t('livePostings')}</span>
              <p className="text-2xl font-bold text-gray-900 mt-1">{companyJobs.length}</p>
              <p className="text-[11px] text-gray-500 mt-1">{t('publishedToNational')}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">{t('statTotalApplicants')}</span>
              <p className="text-2xl font-bold text-blue-600 mt-1">{applicants.length}</p>
              <p className="text-[11px] text-gray-500 mt-1">{t('candidatesAwaiting')}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">{t('udyamReg')}</span>
              <div className="flex items-center gap-1.5 mt-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-emerald-800">{t('verifiedActive')}</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">{t('registryValidated')}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">{t('candidatePrivacy')}</span>
              <div className="flex items-center gap-1.5 mt-2 text-emerald-700 font-semibold text-xs">
                <ShieldCheck className="w-4 h-4" />
                <span>{t('maskedByDefault')}</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">{t('hardInvariant1Active')}</p>
            </div>
          </div>

          {/* Quick Active Jobs Table */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-900">{t('currentVacancies')}</h2>
              <button
                type="button"
                onClick={() => setActiveTab('manage-jobs')}
                className="text-xs font-semibold text-[#F97316] hover:underline"
              >
                {t('manageAll')}
              </button>
            </div>

            <div className="divide-y divide-gray-100">
              {companyJobs.map((job) => (
                <div key={job.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">{job.title}</h3>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                      <span>{job.location}</span>
                      <span>•</span>
                      <span>₹{job.salaryMin.toLocaleString('en-IN')} - ₹{job.salaryMax.toLocaleString('en-IN')}{t('perMonth')}</span>
                      <span>•</span>
                      <span>{job.openings} {t('openingsCount')}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">
                      <strong>{job.applicantCount}</strong> {t('applicantsCount')}
                    </span>
                    <JobStatusBadge status="active" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* ================================================================ */}
      {/* TAB 2: ENTERPRISE PROFILE & ONBOARDING (Check sheet fields) */}
      {/* ================================================================ */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          {!isEditingProfile ? (
            /* VIEW MODE: Rich Enterprise Profile Dossier */
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900">{t('profileHeading')}</h2>
                  <p className="text-xs text-gray-500">{t('profileSubheading')}</p>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setIsEditingProfile(true)}
                  className="inline-flex items-center gap-1.5"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>{t('editProfile')}</span>
                </Button>
              </div>

              {/* 1. Basic Info & Leadership Card */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange border-b border-gray-100 pb-2">
                  1. Organization & Leadership Identity
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-gray-500">{t('labelCompanyName')}</span>
                    <p className="font-bold text-gray-900 mt-0.5 text-sm">{company.name}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('labelOwnershipType')}</span>
                    <p className="font-bold text-gray-900 mt-0.5">{company.ownershipType}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('labelSector')}</span>
                    <p className="font-bold text-gray-900 mt-0.5">{company.sector}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Founder / Director</span>
                    <p className="font-bold text-gray-900 mt-0.5">{company.founderOrDirector || '—'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Designation</span>
                    <p className="font-bold text-gray-900 mt-0.5">{company.designation || 'Director'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('labelEnterpriseSize')}</span>
                    <p className="font-bold text-gray-900 mt-0.5">{company.enterpriseSize} {t('enterprise')}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Year of Registration</span>
                    <p className="font-mono text-gray-900 mt-0.5">{company.yearOfRegistration || '—'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Commencement of Business</span>
                    <p className="font-mono text-gray-900 mt-0.5">{company.commencementYear || '—'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Official Website</span>
                    <p className="mt-0.5">
                      {company.website ? (
                        <a
                          href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-orange hover:underline font-medium"
                        >
                          {company.website}
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* 2. Contact & Premise Location Card */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange border-b border-gray-100 pb-2">
                  2. Operating Premise & Contact Channels
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div className="sm:col-span-2">
                    <span className="text-gray-500">{t('labelPlantLocation')}</span>
                    <p className="font-medium text-gray-900 mt-0.5">{company.address}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('labelJobCity')} / {t('labelJobDistrict')}</span>
                    <p className="font-medium text-gray-900 mt-0.5">{company.city}, {company.district}, {company.state}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('contactMobile')}</span>
                    <p className="font-mono text-gray-900 mt-0.5 font-bold">+91 {company.phone || '9876543210'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('emailAddress')}</span>
                    <p className="font-medium text-gray-900 mt-0.5">{company.email || '—'}</p>
                  </div>
                </div>
              </div>

              {/* 3. Know My Business & Offerings */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange border-b border-gray-100 pb-2">
                  3. Business Profile & What We Offer
                </h3>
                <div className="space-y-3 text-xs">
                  <div>
                    <span className="text-gray-500 font-semibold">Know My Business (Overview)</span>
                    <p className="text-gray-800 leading-relaxed mt-1 bg-gray-50 p-3 rounded-xl border border-gray-100">
                      {company.knowMyBusiness || company.description}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <span className="text-gray-500 font-semibold">Products</span>
                      <p className="text-gray-800 mt-1 bg-gray-50 p-3 rounded-xl border border-gray-100">
                        {company.productsBrief || '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500 font-semibold">Services</span>
                      <p className="text-gray-800 mt-1 bg-gray-50 p-3 rounded-xl border border-gray-100">
                        {company.servicesBrief || '—'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Registrations & Social Media */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange border-b border-gray-100 pb-2">
                    4. Government Registrations
                  </h3>
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
                      <div>
                        <span className="font-bold text-emerald-950">{t('labelUdyamNumber')}</span>
                        <p className="font-mono text-emerald-800 mt-0.5">{company.udyamNumber || '—'}</p>
                      </div>
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    </div>

                    <div className="flex items-center justify-between p-3 bg-blue-50/60 rounded-xl border border-blue-100">
                      <div>
                        <span className="font-bold text-blue-950">{t('labelDpiitNumber')}</span>
                        <p className="font-mono text-blue-800 mt-0.5">{company.dpiitNumber || '—'}</p>
                      </div>
                      <Award className="w-5 h-5 text-blue-600" />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange border-b border-gray-100 pb-2">
                    5. Social Media Presence
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between py-1.5 border-b border-gray-50">
                      <span className="text-gray-500">Instagram</span>
                      <span className="font-mono text-gray-800 truncate max-w-[200px]">
                        {company.socialMedia?.instagram || '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-gray-50">
                      <span className="text-gray-500">Facebook</span>
                      <span className="font-mono text-gray-800 truncate max-w-[200px]">
                        {company.socialMedia?.facebook || '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-gray-50">
                      <span className="text-gray-500">YouTube</span>
                      <span className="font-mono text-gray-800 truncate max-w-[200px]">
                        {company.socialMedia?.youtube || '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* EDIT MODE: Complete Onboarding & Profile Form with Check sheet fields */
            <form onSubmit={handleSaveProfile} className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-xs space-y-8 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-gray-200 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {t('profileHeading')}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {t('profileSubheading')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(false)}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    {t('cancel')}
                  </button>
                  <Button type="submit" variant="primary" size="sm" className="inline-flex items-center gap-1.5">
                    <Save className="w-4 h-4" />
                    <span>{t('saveBusinessProfile')}</span>
                  </Button>
                </div>
              </div>

              {/* Section 1: Organization & Identity */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange">
                  1. Organization Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelCompanyName')} *
                    </label>
                    <input
                      type="text"
                      value={formOrgName}
                      onChange={(e) => setFormOrgName(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelOwnershipType')} *
                    </label>
                    <select
                      value={formOwnership}
                      onChange={(e) => setFormOwnership(e.target.value as CompanyItem['ownershipType'])}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden bg-white"
                      required
                    >
                      <option value="Proprietorship">Proprietor / Proprietorship</option>
                      <option value="Private Limited">Private Limited</option>
                      <option value="LLP">Limited Liability Partnership (LLP)</option>
                      <option value="Partnership">Partnership</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelSector')} *
                    </label>
                    <input
                      type="text"
                      value={formSector}
                      onChange={(e) => setFormSector(e.target.value)}
                      placeholder="e.g. Manufacturing, Consultancy, Textiles"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Year of Registration *
                    </label>
                    <input
                      type="text"
                      value={formYearReg}
                      onChange={(e) => setFormYearReg(e.target.value)}
                      placeholder="e.g. 2021"
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Commencement of Business *
                    </label>
                    <input
                      type="text"
                      value={formCommenceYear}
                      onChange={(e) => setFormCommenceYear(e.target.value)}
                      placeholder="e.g. 2019"
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Official Website (Optional)
                    </label>
                    <input
                      type="text"
                      value={formWebsite}
                      onChange={(e) => setFormWebsite(e.target.value)}
                      placeholder="www.company.in"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Leadership & Direct Contact */}
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange">
                  2. Founder / Leadership & Contact
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Founder / Director Name *
                    </label>
                    <input
                      type="text"
                      value={formFounder}
                      onChange={(e) => setFormFounder(e.target.value)}
                      placeholder="Adhyant Patil"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Designation *
                    </label>
                    <input
                      type="text"
                      value={formDesignation}
                      onChange={(e) => setFormDesignation(e.target.value)}
                      placeholder="Founder Director, Managing Director"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Director Photo URL / Filename (Optional)
                    </label>
                    <input
                      type="text"
                      value={formDirectorPhoto}
                      onChange={(e) => setFormDirectorPhoto(e.target.value)}
                      placeholder="photo.jpeg"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('contactMobile')} *
                    </label>
                    <div className="flex rounded-xl border border-gray-300 shadow-2xs overflow-hidden focus-within:ring-2 focus-within:ring-brand-orange">
                      <span className="inline-flex items-center px-3 bg-gray-50 border-r border-gray-300 text-gray-600 text-xs font-semibold">
                        +91
                      </span>
                      <input
                        type="tel"
                        maxLength={10}
                        value={formPhone}
                        onChange={(e) => setFormPhone(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono focus:outline-hidden"
                        required
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('emailAddress')} (Optional)
                    </label>
                    <input
                      type="email"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="contact@company.in"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Know My Business & Offerings */}
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange">
                  3. Business Profile & What We Offer
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Know My Business (Brief Description) (Optional)
                    </label>
                    <textarea
                      rows={3}
                      value={formKnowMyBusiness}
                      onChange={(e) => setFormKnowMyBusiness(e.target.value)}
                      placeholder="We are a Ujjain/Pune based enterprise working as a manufacturing/consultancy unit..."
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Products (Brief Only) (Optional)
                      </label>
                      <input
                        type="text"
                        value={formProductsBrief}
                        onChange={(e) => setFormProductsBrief(e.target.value)}
                        placeholder="e.g. CNC Machine Components, Precision Valves"
                        className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Services (Brief Only) (Optional)
                      </label>
                      <input
                        type="text"
                        value={formServicesBrief}
                        onChange={(e) => setFormServicesBrief(e.target.value)}
                        placeholder="e.g. Business Development Solutions, Fabrication"
                        className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 4: Location & Operating Premise */}
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange">
                  4. Physical Location & Scale
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelPlantLocation')} *
                    </label>
                    <input
                      type="text"
                      value={formAddress}
                      onChange={(e) => setFormAddress(e.target.value)}
                      placeholder="Plot 14, Sector C, Industrial Area"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelJobCity')} *
                    </label>
                    <input
                      type="text"
                      value={formCity}
                      onChange={(e) => setFormCity(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelJobDistrict')} *
                    </label>
                    <input
                      type="text"
                      value={formDistrict}
                      onChange={(e) => setFormDistrict(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      State *
                    </label>
                    <input
                      type="text"
                      value={formState}
                      onChange={(e) => setFormState(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelEnterpriseSize')} *
                    </label>
                    <select
                      value={formCompanySize}
                      onChange={(e) => setFormCompanySize(e.target.value as CompanyItem['enterpriseSize'])}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden bg-white"
                      required
                    >
                      <option value="Micro">Micro {t('enterprise')}</option>
                      <option value="Small">Small {t('enterprise')}</option>
                      <option value="Medium">Medium {t('enterprise')}</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 5: Government Recognitions */}
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange">
                  5. Government Registrations (MSME & DPIIT)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* MSME Udyam */}
                  <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>MSME Registered?</span>
                      </label>
                      <input
                        type="checkbox"
                        checked={formIsMsme}
                        onChange={(e) => setFormIsMsme(e.target.checked)}
                        className="w-4 h-4 text-emerald-600 rounded"
                      />
                    </div>
                    {formIsMsme && (
                      <div>
                        <label className="block text-[11px] font-semibold text-emerald-900 mb-1">
                          {t('labelUdyamNumber')}
                        </label>
                        <input
                          type="text"
                          value={formUdyamNumber}
                          onChange={(e) => setFormUdyamNumber(e.target.value.toUpperCase())}
                          placeholder="UDYAM-MH-26-0019482"
                          className="w-full px-3 py-2 text-xs font-mono uppercase bg-white rounded-xl border border-emerald-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                          required={formIsMsme}
                        />
                      </div>
                    )}
                  </div>

                  {/* DPIIT Startup */}
                  <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                        <Award className="w-4 h-4 text-blue-600" />
                        <span>DPIIT Startup India Registered?</span>
                      </label>
                      <input
                        type="checkbox"
                        checked={formIsDpiit}
                        onChange={(e) => setFormIsDpiit(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                    </div>
                    {formIsDpiit && (
                      <div>
                        <label className="block text-[11px] font-semibold text-blue-900 mb-1">
                          {t('labelDpiitNumber')}
                        </label>
                        <input
                          type="text"
                          value={formDpiitNumber}
                          onChange={(e) => setFormDpiitNumber(e.target.value.toUpperCase())}
                          placeholder="DIPP-89102-MH"
                          className="w-full px-3 py-2 text-xs font-mono uppercase bg-white rounded-xl border border-blue-300 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                          required={formIsDpiit}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Section 6: Social Media Links */}
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange">
                  6. Social Media Links (Optional)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Instagram URL
                    </label>
                    <input
                      type="url"
                      value={formInstagram}
                      onChange={(e) => setFormInstagram(e.target.value)}
                      placeholder="https://instagram.com/company"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Facebook URL
                    </label>
                    <input
                      type="url"
                      value={formFacebook}
                      onChange={(e) => setFormFacebook(e.target.value)}
                      placeholder="https://facebook.com/company"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      YouTube URL
                    </label>
                    <input
                      type="url"
                      value={formYoutube}
                      onChange={(e) => setFormYoutube(e.target.value)}
                      placeholder="https://youtube.com/@company"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Other Professional / Social Profile
                    </label>
                    <input
                      type="url"
                      value={formOtherSocial}
                      onChange={(e) => setFormOtherSocial(e.target.value)}
                      placeholder="https://linkedin.com/company/profile"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pt-4 border-t border-gray-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(false)}
                  className="px-4 py-2.5 rounded-xl border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  {t('cancel')}
                </button>
                <Button type="submit" variant="primary" size="md" className="inline-flex items-center gap-1.5 font-semibold">
                  <Save className="w-4 h-4" />
                  <span>{t('saveBusinessProfile')}</span>
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* ================================================================ */}
      {/* TAB 3: MANAGE JOBS */}
      {/* ================================================================ */}
      {activeTab === 'manage-jobs' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">
              {t('manageJobsHeading')} ({companyJobs.length})
            </h2>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setActiveTab('post-job')}
              className="inline-flex items-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{t('postNewVacancy')}</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {companyJobs.map((job) => (
              <div
                key={job.id}
                className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-gray-900">{job.title}</h3>
                    <JobStatusBadge status={job.status ?? 'active'} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-gray-400" />
                      {job.location}
                    </span>
                    <span>•</span>
                    <span className="font-semibold text-gray-700">
                      ₹{job.salaryMin.toLocaleString('en-IN')} - ₹{job.salaryMax.toLocaleString('en-IN')}{t('perMonth')}
                    </span>
                    <span>•</span>
                    <span>{job.openings} {t('openingsCount')}</span>
                    <span>•</span>
                    <span>{t('appliedOn')} {job.postedDate}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {job.skills.map((skill, sIdx) => (
                      <span
                        key={sIdx}
                        className="px-2 py-0.5 text-[11px] rounded bg-gray-100 text-gray-700 font-medium"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <Link
                    href={`/jobs/${job.id}`}
                    className="p-2 text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    title="View public posting"
                  >
                    <Eye className="w-4 h-4" />
                  </Link>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveTab('applicants')}
                  >
                    {t('reviewApplicants')} ({job.applicantCount})
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 4: POST A VACANCY */}
      {/* ================================================================ */}
      {activeTab === 'post-job' && (
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-xs max-w-3xl mx-auto space-y-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{t('postJobHeading')}</h2>
            <p className="text-xs text-gray-500">
              {t('postJobSubheading')}
            </p>
          </div>

          {formErrors.length > 0 && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 space-y-1">
              <div className="flex items-center gap-2 font-bold text-red-900">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>Please fix the following validation errors:</span>
              </div>
              <ul className="list-disc pl-5 space-y-0.5 text-red-700">
                {formErrors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {successNotice && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successNotice}</span>
            </div>
          )}

          <form onSubmit={handlePostJob} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {t('labelJobTitle')} *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. CNC Machine Operator & Programmer"
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('labelCategory')} *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as IndustryCategory)}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden bg-white"
                >
                  <option value="manufacturing">Manufacturing & Trades</option>
                  <option value="technology">Technology & Software</option>
                  <option value="sales_operations">Sales & Operations</option>
                  <option value="logistics_supply">Logistics & Supply Chain</option>
                  <option value="creative_services">Creative & Design</option>
                  <option value="healthcare_services">Healthcare & Services</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('labelEmploymentType')} *
                </label>
                <select
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden bg-white"
                >
                  {employmentTypeValues.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('labelExperienceLevel')}
                </label>
                <select
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value as ExperienceLevel)}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden bg-white"
                >
                  {experienceLevelValues.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('labelWorkShift')}
                </label>
                <select
                  value={workShift}
                  onChange={(e) => setWorkShift(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden bg-white"
                >
                  <option value="Rotational">Rotational Shifts (A/B/C)</option>
                  <option value="Day Shift">Day Shift Only (8 AM - 5 PM)</option>
                  <option value="Night Shift">Night Shift Only</option>
                  <option value="General Shift">General Shift (9 AM - 6 PM)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('labelQualification')}
                </label>
                <select
                  value={qualification}
                  onChange={(e) => setQualification(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden bg-white"
                >
                  <option value="ITI / Trade Certificate">ITI / Trade Certificate</option>
                  <option value="Diploma / Polytechnic">Diploma / Polytechnic</option>
                  <option value="Graduate / Degree">Graduate / B.E. / B.Tech</option>
                  <option value="10th / 12th Pass">10th / 12th Pass</option>
                  <option value="Any Qualification">Any / No Barrier</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('labelPlantLocation')}
                </label>
                <input
                  type="text"
                  value={plantLocation}
                  onChange={(e) => setPlantLocation(e.target.value)}
                  placeholder="e.g. Unit 4, Phase II"
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('labelJobCity')} *
                </label>
                <input
                  type="text"
                  value={jobCity}
                  onChange={(e) => setJobCity(e.target.value)}
                  placeholder="e.g. Pune"
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('labelJobDistrict')} *
                </label>
                <input
                  type="text"
                  value={jobDistrict}
                  onChange={(e) => setJobDistrict(e.target.value)}
                  placeholder="e.g. Pune"
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('labelSalaryMin')} *
                </label>
                <input
                  type="number"
                  value={salaryMin}
                  onChange={(e) => setSalaryMin(Number(e.target.value))}
                  className="w-full px-3 py-2.5 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('labelSalaryMax')} *
                </label>
                <input
                  type="number"
                  value={salaryMax}
                  onChange={(e) => setSalaryMax(Number(e.target.value))}
                  className="w-full px-3 py-2.5 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('labelOpenings')} *
                </label>
                <input
                  type="number"
                  min={1}
                  value={openings}
                  onChange={(e) => setOpenings(Number(e.target.value))}
                  className="w-full px-3 py-2.5 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {t('labelSkills')}
              </label>
              <input
                type="text"
                value={skillsInput}
                onChange={(e) => setSkillsInput(e.target.value)}
                placeholder="CNC Milling, Blueprint Reading, Fanuc"
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {t('labelJobDesc')} *
              </label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detail the daily responsibilities, machine operations, shift patterns, and quality checks..."
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
                required
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full justify-center font-semibold"
            >
              {t('btnPublishJob')}
            </Button>
          </form>
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 5: APPLICANTS PIPELINE */}
      {/* ================================================================ */}
      {activeTab === 'applicants' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  {t('applicantsHeading')} ({filteredApplicants.length})
                </h2>
                <p className="text-xs text-gray-500">
                  {t('applicantsSubheading')}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:outline-hidden"
                >
                  <option value="all">{t('filterAll')}</option>
                  <option value="applied">{t('filterApplied')}</option>
                  <option value="shortlisted">{t('filterShortlisted')}</option>
                  <option value="interview_scheduled">Interview Scheduled</option>
                  <option value="offered">Offered</option>
                  <option value="rejected">{t('filterRejected')}</option>
                </select>
              </div>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              <input
                type="text"
                value={applicantSearch}
                onChange={(e) => setApplicantSearch(e.target.value)}
                placeholder={t('searchApplicantPlaceholder')}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-brand-orange focus:outline-hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {filteredApplicants.map((app) => (
              <div
                key={app.id}
                className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-gray-900">{app.candidateName}</h3>
                    <StatusBadge status={app.status} />
                  </div>
                  <p className="text-xs text-gray-600 font-medium">{t('appliedFor')} {app.jobTitle}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1 font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      {t('contactMaskedNotice')}
                    </span>
                    <span>•</span>
                    <span>{t('candidateRef')} {app.candidateId}</span>
                    <span>•</span>
                    <span>{t('appliedOn')} {app.appliedDate}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setViewingApplicant(app)}
                  >
                    {t('viewProfile')}
                  </Button>
                  {app.status === 'applied' && (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => handleUpdateStatus(app.id, 'shortlisted')}
                    >
                      {t('shortlistCandidate')}
                    </Button>
                  )}
                  {app.status === 'shortlisted' && (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => handleUpdateStatus(app.id, 'interview_scheduled')}
                    >
                      {t('scheduleInterview')}
                    </Button>
                  )}
                  {app.status !== 'rejected' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleUpdateStatus(app.id, 'rejected')}
                      className="text-red-600 hover:bg-red-50"
                    >
                      {t('reject')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Candidate Profile Inspection Modal (Hard Invariant #1) */}
          {viewingApplicant && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
              <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-gray-200 shadow-xl space-y-6">
                <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-orange-100 text-brand-orange flex items-center justify-center font-bold text-lg">
                      {viewingApplicant.candidateName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{viewingApplicant.candidateName}</h3>
                      <p className="text-xs text-gray-500 font-medium">{t('appliedFor')} {viewingApplicant.jobTitle}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewingApplicant(null)}
                    className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Hard Invariant #1 Banner */}
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-800 leading-relaxed">
                    <p className="font-bold">{t('modalCandidatePiiMasked')}</p>
                    <p className="mt-0.5">
                      {t('modalMaskedDesc')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                    <span className="text-gray-400 uppercase tracking-wider font-semibold text-[10px]">{t('contactMobile')}</span>
                    <p className="font-mono text-gray-900 font-bold mt-1">+91 ••••• ••829</p>
                    <span className="text-[10px] text-emerald-600 font-medium">{t('maskedPerInvariant')}</span>
                  </div>
                  <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                    <span className="text-gray-400 uppercase tracking-wider font-semibold text-[10px]">{t('emailAddress')}</span>
                    <p className="font-mono text-gray-900 font-bold mt-1">••••••••••@••••.in</p>
                    <span className="text-[10px] text-emerald-600 font-medium">{t('inAppChatOnly')}</span>
                  </div>
                  <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                    <span className="text-gray-400 uppercase tracking-wider font-semibold text-[10px]">{t('educationTrade')}</span>
                    <p className="text-gray-900 font-bold mt-1">{viewingApplicant.candidateEducation || 'Trade Certificate'}</p>
                  </div>
                  <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                    <span className="text-gray-400 uppercase tracking-wider font-semibold text-[10px]">{t('applicationStatus')}</span>
                    <div className="mt-1">
                      <StatusBadge status={viewingApplicant.status} />
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider text-[10px]">{t('verifiedTechSkills')}</span>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {viewingApplicant.candidateSkills && viewingApplicant.candidateSkills.length > 0 ? (
                      viewingApplicant.candidateSkills.map((sk) => (
                        <span key={sk} className="px-2.5 py-1 rounded-lg bg-orange-50 text-brand-orange font-medium text-xs border border-orange-100">
                          {sk}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-gray-400">Standard vocational curriculum verified</span>
                    )}
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2 border-t border-gray-100">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setViewingApplicant(null)}
                  >
                    {t('btnClose')}
                  </Button>
                  {viewingApplicant.status === 'applied' && (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        handleUpdateStatus(viewingApplicant.id, 'shortlisted');
                        setViewingApplicant(null);
                      }}
                    >
                      {t('shortlistCandidate')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 6: WALK-IN QR POSTER */}
      {/* ================================================================ */}
      {activeTab === 'qr-code' && (
        <div className="max-w-2xl mx-auto space-y-6">
          <ProfileQrShareCard
            title={company.name}
            subtitle={`${company.sector} • ${company.enterpriseSize} Enterprise`}
            path={`/company/${company.id}`}
            badgeText="Factory Gate & Entrance Walk-in QR Poster"
            description="Display this official QR code at your factory main gate, security cabin, or office reception. Job seekers scan with their smartphone camera to view open positions and apply with verified digital CVs."
            downloadFileName={`${company.name}-walkin-poster`}
            isMsme={company.isMsme ?? true}
            udyamOrAffiliation={company.udyamNumber}
            locationText={`${company.address}, ${company.city}`}
          />
        </div>
      )}
    </div>
  );
}
