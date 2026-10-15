'use client';

import React, { useState } from 'react';
import Link from 'next/link';
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
} from 'lucide-react';

export function EmployerWorkspace() {
  const { addToast } = useApp();
  const [activeTab, setActiveTab] = useState<'overview' | 'post-job' | 'manage-jobs' | 'applicants' | 'qr-code' | 'profile'>('overview');

  // Dynamic Company State (Default from sample, fully editable)
  const [company, setCompany] = useState<CompanyItem>(SAMPLE_COMPANIES[0]!);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(true);

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

  const handlePostJob = (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors([]);

    const parsedSkills = skillsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const validation = createJobSchema.safeParse({
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
    });

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

    const newJob: JobItem = {
      id: `job-${Date.now()}`,
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

  const handleUpdateStatus = (appId: string, newStatus: ApplicationStatus) => {
    setApplicants((prev) =>
      prev.map((a) => (a.id === appId ? { ...a, status: newStatus } : a))
    );
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
                Action Required: Complete Enterprise Onboarding Form
              </h2>
              <p className="text-xs text-orange-800 mt-0.5">
                Your enterprise was pre-registered via batch import. Complete your profile details (founder, registrations, offerings) to publish job vacancies and review candidate applications.
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
            Complete Onboarding Now
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
                  <span>Udyam Verified</span>
                </span>
              )}
              {company.isDpiitStartup && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                  <Award className="w-3 h-3 text-blue-600" />
                  <span>DPIIT Startup</span>
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-2">
              {company.udyamNumber && (
                <span className="font-mono text-gray-700 font-semibold">{company.udyamNumber}</span>
              )}
              <span>•</span>
              <span>{company.enterpriseSize} Enterprise</span>
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
            <span>Public Profile</span>
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
            <span>Edit Profile</span>
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setActiveTab('post-job')}
            className="inline-flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Post Vacancy</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setActiveTab('qr-code')}
            className="inline-flex items-center gap-1.5"
          >
            <QrCode className="w-4 h-4" />
            <span>Walk-in QR</span>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto gap-2">
        {([
          { id: 'overview', label: 'Recruitment Overview', icon: Briefcase },
          { id: 'manage-jobs', label: `Active Jobs (${companyJobs.length})`, icon: Eye },
          { id: 'post-job', label: 'Post a Vacancy', icon: PlusCircle },
          { id: 'applicants', label: `Applicant Pipeline (${applicants.length})`, icon: Users },
          { id: 'profile', label: 'Enterprise Profile & KYC', icon: Building2 },
          { id: 'qr-code', label: 'Walk-in QR Poster', icon: QrCode },
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
              <span className="text-xs font-semibold text-gray-500">Live Postings</span>
              <p className="text-2xl font-bold text-gray-900 mt-1">{companyJobs.length}</p>
              <p className="text-[11px] text-gray-500 mt-1">Published to national pool</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">Total Applicants</span>
              <p className="text-2xl font-bold text-blue-600 mt-1">{applicants.length}</p>
              <p className="text-[11px] text-gray-500 mt-1">Candidates awaiting review</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">Udyam Registration</span>
              <div className="flex items-center gap-1.5 mt-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-emerald-800">Verified Active</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">Registry Validated</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">Candidate Privacy</span>
              <div className="flex items-center gap-1.5 mt-2 text-emerald-700 font-semibold text-xs">
                <ShieldCheck className="w-4 h-4" />
                <span>Masked by Default</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">Hard Invariant #1 Active</p>
            </div>
          </div>

          {/* Quick Active Jobs Table */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-900">Current Job Vacancies</h2>
              <button
                type="button"
                onClick={() => setActiveTab('manage-jobs')}
                className="text-xs font-semibold text-[#F97316] hover:underline"
              >
                Manage all
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
                      <span>₹{job.salaryMin.toLocaleString('en-IN')} - ₹{job.salaryMax.toLocaleString('en-IN')}/mo</span>
                      <span>•</span>
                      <span>{job.openings} Openings</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">
                      <strong>{job.applicantCount}</strong> applicants
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
      {/* TAB 2: ENTERPRISE PROFILE & ONBOARDING (Check sheet fields) */}
      {/* ================================================================ */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          {!isEditingProfile ? (
            /* VIEW MODE: Rich Enterprise Profile Dossier */
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Enterprise Profile Details</h2>
                  <p className="text-xs text-gray-500">All fields verified as per official onboarding guidelines.</p>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setIsEditingProfile(true)}
                  className="inline-flex items-center gap-1.5"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Edit Profile</span>
                </Button>
              </div>

              {/* 1. Basic Info & Leadership Card */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange border-b border-gray-100 pb-2">
                  1. Organization & Leadership Identity
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-gray-500">Organization Name</span>
                    <p className="font-bold text-gray-900 mt-0.5 text-sm">{company.name}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Ownership Type</span>
                    <p className="font-bold text-gray-900 mt-0.5">{company.ownershipType}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Sector / Industry</span>
                    <p className="font-bold text-gray-900 mt-0.5">{company.sector}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Founder / Director</span>
                    <p className="font-bold text-gray-900 mt-0.5">{company.founderOrDirector || 'Not Specified'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Designation</span>
                    <p className="font-bold text-gray-900 mt-0.5">{company.designation || 'Director'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Enterprise Scale</span>
                    <p className="font-bold text-gray-900 mt-0.5">{company.enterpriseSize} Scale</p>
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
                    <span className="text-gray-500">Physical Premise Address</span>
                    <p className="font-medium text-gray-900 mt-0.5">{company.address}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">City / District / State</span>
                    <p className="font-medium text-gray-900 mt-0.5">{company.city}, {company.district}, {company.state}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Contact Mobile (Protected from candidates)</span>
                    <p className="font-mono text-gray-900 mt-0.5 font-bold">+91 {company.phone || '9876543210'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Official Email</span>
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
                      <span className="text-gray-500 font-semibold">Products (Brief Only)</span>
                      <p className="text-gray-800 mt-1 bg-gray-50 p-3 rounded-xl border border-gray-100">
                        {company.productsBrief || 'Not specified'}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500 font-semibold">Services (Brief Only)</span>
                      <p className="text-gray-800 mt-1 bg-gray-50 p-3 rounded-xl border border-gray-100">
                        {company.servicesBrief || 'Not specified'}
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
                        <span className="font-bold text-emerald-950">MSME / Udyam Registration</span>
                        <p className="font-mono text-emerald-800 mt-0.5">{company.udyamNumber || 'Pending'}</p>
                      </div>
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    </div>

                    <div className="flex items-center justify-between p-3 bg-blue-50/60 rounded-xl border border-blue-100">
                      <div>
                        <span className="font-bold text-blue-950">DPIIT Startup India</span>
                        <p className="font-mono text-blue-800 mt-0.5">{company.dpiitNumber || 'Not registered'}</p>
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
                    Edit Enterprise Profile & Onboarding Data
                  </h2>
                  <p className="text-xs text-gray-500">
                    Fields directly conform to the official MSME Onboarding Template (Check Sheet).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(false)}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <Button type="submit" variant="primary" size="sm" className="inline-flex items-center gap-1.5">
                    <Save className="w-4 h-4" />
                    <span>Save Enterprise Profile</span>
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
                      Organization Name *
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
                      Ownership Type *
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
                      Sector / Industry *
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
                      Contact Mobile Number *
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
                      Official Email Address (Optional)
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
                      Premise Address *
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
                      City *
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
                      District *
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
                      Enterprise Scale *
                    </label>
                    <select
                      value={formCompanySize}
                      onChange={(e) => setFormCompanySize(e.target.value as CompanyItem['enterpriseSize'])}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden bg-white"
                      required
                    >
                      <option value="Micro">Micro Enterprise</option>
                      <option value="Small">Small Enterprise</option>
                      <option value="Medium">Medium Enterprise</option>
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
                          Udyam Registration Number (URN)
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
                          DPIIT Recognition Number
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
                  Cancel
                </button>
                <Button type="submit" variant="primary" size="md" className="inline-flex items-center gap-1.5 font-semibold">
                  <Save className="w-4 h-4" />
                  <span>Save Enterprise Profile</span>
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 3: MANAGE JOBS */}
      {/* ================================================================ */}
      {activeTab === 'manage-jobs' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">
              Active Vacancies ({companyJobs.length})
            </h2>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setActiveTab('post-job')}
              className="inline-flex items-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Post New Vacancy</span>
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
                      ₹{job.salaryMin.toLocaleString('en-IN')} - ₹{job.salaryMax.toLocaleString('en-IN')}/mo
                    </span>
                    <span>•</span>
                    <span>{job.openings} Openings</span>
                    <span>•</span>
                    <span>Posted {job.postedDate}</span>
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
                    Review Applicants ({job.applicantCount})
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
            <h2 className="text-lg font-bold text-gray-900">Post a New Vacancy</h2>
            <p className="text-xs text-gray-500">
              Target certified vocational and technical candidates with clear salary, shift timings, and trade criteria.
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
                Job Title *
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
                  Industry Category *
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
                  Employment Type *
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
                  Experience Level
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
                  Work Shift Pattern
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
                  Minimum Qualification
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
                  Plant / Unit Location
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
                  City *
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
                  District *
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
                  Min Salary (₹/month) *
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
                  Max Salary (₹/month) *
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
                  Total Openings *
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
                Required Skills / Trade Certifications (comma separated)
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
                Job Description & Machine / Role Responsibilities *
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
              Publish Vacancy to Candidate Network
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
                  Applicant Pipeline ({filteredApplicants.length})
                </h2>
                <p className="text-xs text-gray-500">
                  Hard Invariant #1: Candidate phone and email strictly masked until platform interview setup.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:outline-hidden"
                >
                  <option value="all">All Statuses</option>
                  <option value="applied">Applied</option>
                  <option value="shortlisted">Shortlisted</option>
                  <option value="interview_scheduled">Interview Scheduled</option>
                  <option value="offered">Offered</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              <input
                type="text"
                value={applicantSearch}
                onChange={(e) => setApplicantSearch(e.target.value)}
                placeholder="Search applicants by name or applied role..."
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
                  <p className="text-xs text-gray-600 font-medium">Applied for: {app.jobTitle}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1 font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      Contact Masked (In-App Messaging Only)
                    </span>
                    <span>•</span>
                    <span>Candidate Ref: {app.candidateId}</span>
                    <span>•</span>
                    <span>Applied on {app.appliedDate}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {app.status === 'applied' && (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => handleUpdateStatus(app.id, 'shortlisted')}
                    >
                      Shortlist Candidate
                    </Button>
                  )}
                  {app.status === 'shortlisted' && (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => handleUpdateStatus(app.id, 'interview_scheduled')}
                    >
                      Schedule Interview
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
                      Reject
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
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
