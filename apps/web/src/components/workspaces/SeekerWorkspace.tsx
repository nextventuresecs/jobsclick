'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../context/AppContext';
import {
  INITIAL_SEEKER_PROFILE,
  INITIAL_APPLICATIONS,
  SeekerProfileData,
  ApplicationData,
} from '../../data/sampleWorkspaces';
import { SAMPLE_JOBS } from '../../data/sampleJobs';
import {
  CategoryBadge,
  StatusBadge,
  getCategoryCardBorderClass,
  Button,
  JobsClickLogo,
} from '@indian-job-portal/ui';
import { jobSeekerProfileSchema } from '@indian-job-portal/validation';
import {
  User,
  Briefcase,
  FileText,
  Printer,
  CheckCircle2,
  Clock,
  MapPin,
  Building2,
  ShieldCheck,
  Calendar,
  Edit3,
  ArrowRight,
  Save,
  AlertCircle,
  GraduationCap,
  Lock,
  Award,
} from 'lucide-react';

export function SeekerWorkspace() {
  const { addToast } = useApp();
  const [activeTab, setActiveTab] = useState<'overview' | 'applications' | 'profile' | 'cv-preview'>('overview');
  const [profile, setProfile] = useState<SeekerProfileData>(INITIAL_SEEKER_PROFILE);
  const [applications] = useState<readonly ApplicationData[]>(INITIAL_APPLICATIONS);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(profile.isOnboardingComplete);
  const [isEditing, setIsEditing] = useState(false);

  // Edit Form State
  const [formName, setFormName] = useState(profile.name);
  const [formGender, setFormGender] = useState<SeekerProfileData['gender']>(profile.gender);
  const [formDob, setFormDob] = useState(profile.dob);
  const [formSeekerType, setFormSeekerType] = useState<SeekerProfileData['seekerType']>(profile.seekerType);
  const [formAddress, setFormAddress] = useState(profile.address || '');
  const [formCity, setFormCity] = useState(profile.city);
  const [formDistrict, setFormDistrict] = useState(profile.district);
  const [formState, setFormState] = useState(profile.state);
  const [formPincode, setFormPincode] = useState(profile.pincode);
  const [formQualification, setFormQualification] = useState(profile.qualification);
  const [formInstitution, setFormInstitution] = useState(profile.institution);
  const [formGraduationYear, setFormGraduationYear] = useState(profile.graduationYear);
  const [formExperienceYears, setFormExperienceYears] = useState(profile.experienceYears);
  const [formCurrentRole, setFormCurrentRole] = useState(profile.currentRole || '');
  const [formSkillsInput, setFormSkillsInput] = useState(profile.skills.join(', '));
  const [formLanguagesInput, setFormLanguagesInput] = useState(profile.languages.join(', '));
  const [formLocationsInput, setFormLocationsInput] = useState(profile.preferredLocations.join(', '));
  const [formWillingToRelocate, setFormWillingToRelocate] = useState(profile.willingToRelocate);
  const [formBio, setFormBio] = useState(profile.bio);
  const [formAadhaarLastFour, setFormAadhaarLastFour] = useState(profile.aadhaarLastFour || '');
  const [formApaarId, setFormApaarId] = useState(profile.apaarId || '');
  const [formDpdpConsent, setFormDpdpConsent] = useState(profile.dpdpConsentGiven);

  const myApplications = applications.filter((a) => a.candidateId === profile.id);
  const recommendedJobs = SAMPLE_JOBS.filter((j) =>
    profile.preferredCategories.includes(j.category)
  ).slice(0, 3);

  // Save profile with validation against jobSeekerProfileSchema
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();

    const skillsArray = formSkillsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const languagesArray = formLanguagesInput
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean);

    const locationsArray = formLocationsInput
      .split(',')
      .map((loc) => loc.trim())
      .filter(Boolean);

    // Validate using Zod schema
    const validationResult = jobSeekerProfileSchema.safeParse({
      fullName: formName,
      seekerType: formSeekerType,
      gender: formGender,
      dob: formDob,
      city: formCity,
      district: formDistrict,
      state: formState,
      pincode: formPincode || undefined,
      qualification: formQualification,
      institution: formInstitution,
      graduationYear: formGraduationYear,
      experienceYears: Number(formExperienceYears),
      currentRole: formCurrentRole,
      skills: skillsArray,
      languages: languagesArray,
      preferredCategories: profile.preferredCategories,
      preferredLocations: locationsArray,
      willingToRelocate: formWillingToRelocate,
      bio: formBio,
      aadhaarLastFour: formAadhaarLastFour || undefined,
      apaarId: formApaarId || undefined,
      dpdpConsentGiven: formDpdpConsent,
    });

    if (!validationResult.success) {
      const err = validationResult.error.errors[0]?.message || 'Please check your profile details.';
      addToast({ type: 'error', title: 'Validation Error', message: err });
      return;
    }

    setProfile({
      ...profile,
      name: formName,
      seekerType: formSeekerType,
      gender: formGender,
      dob: formDob,
      address: formAddress,
      city: formCity,
      district: formDistrict,
      state: formState,
      pincode: formPincode,
      qualification: formQualification,
      institution: formInstitution,
      graduationYear: formGraduationYear,
      experienceYears: Number(formExperienceYears),
      currentRole: formCurrentRole,
      skills: skillsArray.length > 0 ? skillsArray : profile.skills,
      languages: languagesArray.length > 0 ? languagesArray : profile.languages,
      preferredLocations: locationsArray.length > 0 ? locationsArray : profile.preferredLocations,
      willingToRelocate: formWillingToRelocate,
      bio: formBio,
      aadhaarLastFour: formAadhaarLastFour,
      aadhaarVerified: Boolean(formAadhaarLastFour),
      apaarId: formApaarId,
      dpdpConsentGiven: formDpdpConsent,
      completionPercentage: 100,
      isOnboardingComplete: true,
    });

    setIsOnboardingComplete(true);
    setIsEditing(false);
    addToast({
      type: 'success',
      title: 'Profile Saved',
      message: 'Your candidate profile & trade certifications are up to date.',
    });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-8">
      {/* Candidate Banner */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-orange-200 bg-gray-100 shrink-0">
            {profile.avatar ? (
              <img
                src={profile.avatar}
                alt={profile.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[#FFF0E5] text-[#F97316] font-bold text-xl">
                {profile.name.charAt(0)}
              </div>
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{profile.name}</h1>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>JobsClick Verified Candidate</span>
              </span>
              {profile.enrolledViaInstitution && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
                  <GraduationCap className="w-3 h-3 text-teal-600" />
                  <span>Enrolled via {profile.enrolledViaInstitution}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-2">
              <span>{profile.currentRole || 'Technical Candidate'}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3 text-gray-400" />
                {profile.city}, {profile.state}
              </span>
              <span>•</span>
              <span className="font-mono text-gray-400">ID: {profile.id}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-xs font-semibold text-gray-500">Profile Readiness</span>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-28 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${profile.completionPercentage}%` }}
                />
              </div>
              <span className="text-xs font-bold text-gray-900">{profile.completionPercentage}%</span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setActiveTab('cv-preview')}
            className="hidden sm:inline-flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4 text-gray-600" />
            <span>Digital CV</span>
          </Button>
        </div>
      </div>

      {/* Onboarding Incomplete Alert Banner */}
      {!isOnboardingComplete && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-950">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-xs font-bold">Candidate Profile Setup Incomplete</p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Complete your trade certifications, vocational stream, and DPDP consent to activate job applications.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => {
              setActiveTab('profile');
              setIsEditing(true);
            }}
            className="shrink-0"
          >
            Complete Profile Now
          </Button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto gap-2">
        {([
          { id: 'overview', label: 'Dashboard Overview', icon: Briefcase },
          { id: 'applications', label: `My Applications (${myApplications.length})`, icon: Clock },
          { id: 'profile', label: 'Professional Profile & KYC', icon: User },
          { id: 'cv-preview', label: 'Verified CV & PDF', icon: FileText },
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
          {/* Quick Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">Active Applications</span>
              <p className="text-2xl font-bold text-gray-900 mt-1">{myApplications.length}</p>
              <p className="text-[11px] text-gray-500 mt-1">Submitted to verified enterprises</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">Shortlisted / Under Review</span>
              <p className="text-2xl font-bold text-blue-600 mt-1">
                {myApplications.filter((a) => a.status === 'shortlisted' || a.status === 'under_review').length}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">Employer evaluation active</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">Privacy Status</span>
              <div className="flex items-center gap-1.5 mt-1.5">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <span className="text-sm font-bold text-emerald-700">100% PII Protected</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">Hard Invariant #1: Phone & email hidden</p>
            </div>
          </div>

          {/* Active Applications preview */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-900">Application Pipeline</h2>
              <button
                type="button"
                onClick={() => setActiveTab('applications')}
                className="text-xs font-semibold text-[#F97316] hover:underline"
              >
                View all ({myApplications.length})
              </button>
            </div>

            <div className="space-y-3">
              {myApplications.map((app) => (
                <div
                  key={app.id}
                  className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">{app.jobTitle}</h3>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-gray-400" />
                      <span>{app.companyName}</span>
                      <span>•</span>
                      <span>Applied on {app.appliedDate}</span>
                    </p>
                    {app.interviewDate && (
                      <p className="text-xs font-semibold text-blue-700 mt-1.5 flex items-center gap-1 bg-blue-50 px-2.5 py-1 rounded-md w-fit">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Interview Scheduled: {app.interviewDate}</span>
                      </p>
                    )}
                  </div>
                  <div className="shrink-0">
                    <StatusBadge status={app.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recommended Jobs */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-gray-900">Recommended Opportunities</h2>
                <p className="text-xs text-gray-500">Based on your skills & vocational preferences</p>
              </div>
              <Link
                href="/jobs"
                className="text-xs font-semibold text-[#F97316] hover:underline inline-flex items-center gap-1"
              >
                <span>Browse All Jobs</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {recommendedJobs.map((job) => (
                <div
                  key={job.id}
                  className={`bg-white rounded-xl border border-gray-200 p-4 shadow-2xs hover:shadow-md transition-all ${getCategoryCardBorderClass(
                    job.category
                  )} flex flex-col justify-between`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <CategoryBadge category={job.category} />
                      <span className="text-xs font-bold text-gray-900">
                        ₹{(job.salaryMin / 1000).toFixed(0)}k - ₹{(job.salaryMax / 1000).toFixed(0)}k/mo
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-gray-900 line-clamp-1">{job.title}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{job.companyName}</p>
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      <span>{job.location}</span>
                    </p>
                  </div>
                  <Link
                    href={`/jobs/${job.id}`}
                    className="mt-4 block text-center py-2 px-3 rounded-lg text-xs font-semibold text-[#F97316] bg-orange-50 hover:bg-orange-100 transition-colors"
                  >
                    View Details & Apply
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 2: APPLICATIONS */}
      {/* ================================================================ */}
      {activeTab === 'applications' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">My Job Applications</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Live status updates for your direct submissions to verified MSME employers.
            </p>
          </div>

          <div className="space-y-4">
            {myApplications.map((app) => (
              <div
                key={app.id}
                className="p-5 rounded-xl border border-gray-200 bg-gray-50/50 hover:bg-white transition-all space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">{app.jobTitle}</h3>
                    <p className="text-xs text-gray-600 mt-1 flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-gray-400" />
                      <span className="font-semibold">{app.companyName}</span>
                      <span>•</span>
                      <span>Applied on {app.appliedDate}</span>
                    </p>
                  </div>
                  <StatusBadge status={app.status} />
                </div>

                {app.notes && (
                  <div className="p-3 rounded-lg bg-orange-50 border border-orange-200 text-xs text-orange-950">
                    <span className="font-semibold">Recruiter Note:</span> {app.notes}
                  </div>
                )}

                {app.interviewDate && (
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-950 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>
                      <strong className="font-semibold">Interview Scheduled:</strong> {app.interviewDate}
                    </span>
                  </div>
                )}

                <div className="pt-2 border-t border-gray-200 flex flex-wrap items-center justify-between text-xs text-gray-500 gap-2">
                  <span>Candidate Ref: {app.candidateId}</span>
                  <span className="flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Hard Invariant #1: Contact details masked for privacy</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 3: PROFESSIONAL PROFILE & ONBOARDING KYC (JS-02, JS-06, JS-07) */}
      {/* ================================================================ */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          {!isEditing ? (
            /* VIEW MODE: Candidate Profile Dossier */
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Verified Candidate Dossier</h2>
                  <p className="text-xs text-gray-500">Candidate credentials, verified trade skills, and DPDP consent.</p>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center gap-1.5"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Edit Profile</span>
                </Button>
              </div>

              {/* 1. Identity & Demographics */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2 flex items-center gap-1.5">
                  <User className="w-4 h-4" />
                  <span>1. Personal & Demographic Details</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-gray-500">Full Name</span>
                    <p className="font-bold text-gray-900 mt-0.5 text-sm">{profile.name}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Candidate Type</span>
                    <p className="font-bold text-gray-900 mt-0.5 capitalize">
                      {profile.seekerType === 'student' ? 'Institutional Student' : 'Individual Candidate'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Gender & DOB</span>
                    <p className="font-bold text-gray-900 mt-0.5">{profile.gender} • {profile.dob}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Current Role</span>
                    <p className="font-bold text-gray-900 mt-0.5">{profile.currentRole || 'Fresher / Trainee'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Location</span>
                    <p className="font-bold text-gray-900 mt-0.5">
                      {profile.city}, {profile.district}, {profile.state} ({profile.pincode})
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Campus Affiliation</span>
                    <p className="font-bold text-gray-900 mt-0.5">
                      {profile.enrolledViaInstitution || profile.institution || 'Direct Registration'}
                    </p>
                  </div>
                </div>
              </div>

              {/* 2. DPDP Act & Statutory KYC (Hard Invariant #8) */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>2. Statutory Identity & Privacy (DPDP Act & Aadhaar)</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-gray-500">Aadhaar (Last 4 Digits Only)</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono font-bold text-gray-900">
                        {profile.aadhaarLastFour ? `•••• •••• ${profile.aadhaarLastFour}` : 'Not Provided'}
                      </span>
                      {profile.aadhaarVerified && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Verified</span>
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">Full number is never stored (Hard Invariant #8)</p>
                  </div>

                  <div>
                    <span className="text-gray-500">APAAR ID (MoE Edu ID)</span>
                    <p className="font-mono font-bold text-gray-900 mt-0.5">{profile.apaarId || 'Optional — Not Provided'}</p>
                  </div>

                  <div>
                    <span className="text-gray-500">DPDP Consent</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="font-bold text-emerald-700">Consent Recorded & Active</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">Data processed per DPDP Act guidelines</p>
                  </div>
                </div>
              </div>

              {/* 3. Education & Trade Qualifications */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2 flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4" />
                  <span>3. Technical Education & Vocational Stream</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-gray-500">Highest Qualification</span>
                    <p className="font-bold text-gray-900 mt-0.5">{profile.qualification}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Institute / College</span>
                    <p className="font-bold text-gray-900 mt-0.5">{profile.institution}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Passing Year & Experience</span>
                    <p className="font-bold text-gray-900 mt-0.5">
                      Batch of {profile.graduationYear} • {profile.experienceYears} Years Exp.
                    </p>
                  </div>
                </div>
              </div>

              {/* 4. Skills & Competencies */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2 flex items-center gap-1.5">
                  <Award className="w-4 h-4" />
                  <span>4. Certified Skills, Tools & Languages</span>
                </h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-xs font-semibold text-gray-500 block mb-1.5">
                      Certified Skills & Machine Competencies:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {profile.skills.map((s, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-orange-50 text-orange-800 text-xs font-semibold rounded-lg border border-orange-200"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 text-xs">
                    <span className="text-gray-500 font-semibold">Languages:</span>
                    <span className="font-bold text-gray-800 ml-2">{profile.languages.join(', ')}</span>
                  </div>

                  <div className="pt-2 text-xs">
                    <span className="text-gray-500 font-semibold">Professional Summary / Bio:</span>
                    <p className="text-gray-700 mt-1 leading-relaxed bg-gray-50 p-4 rounded-xl border border-gray-200">
                      {profile.bio}
                    </p>
                  </div>
                </div>
              </div>

              {/* 5. Career Preferences & Invariant Protection */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2 flex items-center gap-1.5">
                  <Briefcase className="w-4 h-4" />
                  <span>5. Job Preferences & Relocation</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-gray-500">Preferred Locations</span>
                    <p className="font-bold text-gray-900 mt-0.5">{profile.preferredLocations.join(', ')}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Willing to Relocate</span>
                    <p className="font-bold text-gray-900 mt-0.5">{profile.willingToRelocate ? 'Yes' : 'No'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Recruiter Contact Policy</span>
                    <div className="flex items-center gap-1 mt-0.5 text-emerald-700 font-semibold">
                      <Lock className="w-3.5 h-3.5 text-emerald-600" />
                      <span>In-Platform Messaging Only (PII Protected)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* EDIT MODE: Interactive Candidate Onboarding Form */
            <form onSubmit={handleSaveProfile} className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-xs space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Edit Professional Profile & KYC</h2>
                  <p className="text-xs text-gray-500">Ensure your trade skills and contact privacy preferences are accurate.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 rounded-lg border border-gray-300"
                  >
                    Cancel
                  </button>
                  <Button type="submit" variant="primary" size="sm" className="inline-flex items-center gap-1.5">
                    <Save className="w-4 h-4" />
                    <span>Save Candidate Profile</span>
                  </Button>
                </div>
              </div>

              {/* Section 1: Demographics */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2">
                  1. Personal & Demographics
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Full Legal Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g. Rahul Sharma"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Gender</label>
                    <select
                      value={formGender}
                      onChange={(e) => setFormGender(e.target.value as SeekerProfileData['gender'])}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden bg-white"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Date of Birth</label>
                    <input
                      type="date"
                      value={formDob}
                      onChange={(e) => setFormDob(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Candidate Enrolment Type</label>
                    <select
                      value={formSeekerType}
                      onChange={(e) => setFormSeekerType(e.target.value as SeekerProfileData['seekerType'])}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden bg-white"
                    >
                      <option value="student">Institutional Student (College / ITI)</option>
                      <option value="individual">Individual Job Seeker</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Street Address</label>
                    <input
                      type="text"
                      value={formAddress}
                      onChange={(e) => setFormAddress(e.target.value)}
                      placeholder="Plot 42, MIDC Industrial Area"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      City <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formCity}
                      onChange={(e) => setFormCity(e.target.value)}
                      placeholder="Pune"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">District</label>
                    <input
                      type="text"
                      value={formDistrict}
                      onChange={(e) => setFormDistrict(e.target.value)}
                      placeholder="Pune"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">State</label>
                    <input
                      type="text"
                      value={formState}
                      onChange={(e) => setFormState(e.target.value)}
                      placeholder="Maharashtra"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">PIN Code</label>
                    <input
                      type="text"
                      maxLength={6}
                      value={formPincode}
                      onChange={(e) => setFormPincode(e.target.value)}
                      placeholder="411026"
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Statutory Identity & DPDP Consent (Hard Invariant #8) */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2">
                  2. Statutory Identity & DPDP Consent (Hard Invariant #8)
                </h3>

                <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-700 space-y-2">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      id="dpdp-consent-checkbox"
                      checked={formDpdpConsent}
                      onChange={(e) => setFormDpdpConsent(e.target.checked)}
                      className="mt-0.5 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                    />
                    <label htmlFor="dpdp-consent-checkbox" className="leading-relaxed cursor-pointer font-medium">
                      <strong>DPDP Act Consent:</strong> I authorize JobsClick to securely store and process my last 4 digits of Aadhaar and/or APAAR ID strictly for employment verification with certified partners. I understand my phone number and email will never be exposed to recruiters.
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Aadhaar Number (Last 4 Digits Only)
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      value={formAadhaarLastFour}
                      onChange={(e) => setFormAadhaarLastFour(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 4829"
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Optional. Only last 4 digits stored. Full Aadhaar is never saved (Hard Invariant #8).
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      APAAR ID (Automated Permanent Academic Account Registry)
                    </label>
                    <input
                      type="text"
                      value={formApaarId}
                      onChange={(e) => setFormApaarId(e.target.value)}
                      placeholder="e.g. 2024-EDU-99214"
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">Optional 12-digit student academic registry identifier.</p>
                  </div>
                </div>
              </div>

              {/* Section 3: Education & Trades */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2">
                  3. Technical Education & Vocational Stream
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Highest Technical Qualification
                    </label>
                    <input
                      type="text"
                      value={formQualification}
                      onChange={(e) => setFormQualification(e.target.value)}
                      placeholder="ITI Machinist / Diploma Mechanical"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Institution / Training College
                    </label>
                    <input
                      type="text"
                      value={formInstitution}
                      onChange={(e) => setFormInstitution(e.target.value)}
                      placeholder="Government ITI"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Graduation Year</label>
                    <input
                      type="text"
                      value={formGraduationYear}
                      onChange={(e) => setFormGraduationYear(e.target.value)}
                      placeholder="2024"
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Section 4: Experience & Skills */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2">
                  4. Experience & Technical Competencies
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Experience in Years
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={formExperienceYears}
                      onChange={(e) => setFormExperienceYears(Number(e.target.value))}
                      placeholder="1.5"
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Current Job Role</label>
                    <input
                      type="text"
                      value={formCurrentRole}
                      onChange={(e) => setFormCurrentRole(e.target.value)}
                      placeholder="Junior CNC Machinist"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Languages (Comma Separated)</label>
                    <input
                      type="text"
                      value={formLanguagesInput}
                      onChange={(e) => setFormLanguagesInput(e.target.value)}
                      placeholder="Hindi, English, Marathi"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Certified Skills & Machine Competencies (Comma Separated)
                    </label>
                    <input
                      type="text"
                      value={formSkillsInput}
                      onChange={(e) => setFormSkillsInput(e.target.value)}
                      placeholder="CNC Milling, VMC Operating, Blueprint Reading, Vernier Inspection, 5S Workplace Safety"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Professional Bio / Summary
                    </label>
                    <textarea
                      rows={3}
                      value={formBio}
                      onChange={(e) => setFormBio(e.target.value)}
                      placeholder="Skilled precision machinist with hands-on industrial training in CNC setup, component gauging, and lean production..."
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Section 5: Preferences */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2">
                  5. Job Preferences & Relocation
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Preferred Work Locations (Comma Separated)
                    </label>
                    <input
                      type="text"
                      value={formLocationsInput}
                      onChange={(e) => setFormLocationsInput(e.target.value)}
                      placeholder="Pune, Bengaluru, Delhi NCR, Ahmedabad"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-6">
                    <input
                      type="checkbox"
                      id="relocate-checkbox"
                      checked={formWillingToRelocate}
                      onChange={(e) => setFormWillingToRelocate(e.target.checked)}
                      className="rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                    />
                    <label htmlFor="relocate-checkbox" className="text-xs font-semibold text-gray-700 cursor-pointer">
                      Willing to relocate across Indian industrial clusters
                    </label>
                  </div>
                </div>
              </div>

              {/* Form Bottom Controls */}
              <div className="pt-4 border-t border-gray-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2.5 rounded-xl border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <Button type="submit" variant="primary" size="md" className="inline-flex items-center gap-1.5 font-semibold">
                  <Save className="w-4 h-4" />
                  <span>Save Candidate Profile</span>
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 4: CV PREVIEW & PRINT (JS-03) */}
      {/* ================================================================ */}
      {activeTab === 'cv-preview' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-2xs">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Authenticated JobsClick Digital CV</h2>
              <p className="text-xs text-gray-500">
                Hard Invariant #1 & #8a: Bilingual ready, privacy-shielded format.
              </p>
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Download PDF</span>
            </Button>
          </div>

          {/* Printable CV sheet */}
          <div
            id="candidate-cv-sheet"
            className="bg-white p-8 sm:p-12 rounded-2xl border border-gray-300 shadow-lg max-w-4xl mx-auto space-y-6 print:border-none print:shadow-none print:p-0"
          >
            {/* CV Header */}
            <div className="flex items-start justify-between border-b-2 border-orange-500 pb-6">
              <div>
                <JobsClickLogo variant="full" size="md" />
                <h2 className="text-2xl font-bold text-gray-900 mt-4">{profile.name}</h2>
                <p className="text-sm font-semibold text-gray-600 mt-0.5">
                  {profile.qualification} • {profile.city}, {profile.state}
                </p>
                {profile.enrolledViaInstitution && (
                  <p className="text-xs text-teal-700 font-medium mt-1 flex items-center gap-1">
                    <GraduationCap className="w-3.5 h-3.5" />
                    <span>Enrolled via {profile.enrolledViaInstitution}</span>
                  </p>
                )}
              </div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>JobsClick Verified</span>
                </span>
                <p className="text-[11px] text-gray-400 font-mono mt-2">Candidate Ref: {profile.id}</p>
                {profile.aadhaarLastFour && (
                  <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                    Aadhaar: •••• •••• {profile.aadhaarLastFour} (Verified)
                  </p>
                )}
              </div>
            </div>

            {/* Privacy notice banner */}
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 flex items-center justify-between">
              <span className="font-semibold text-gray-800">
                Contact Privacy Protocol Enforced:
              </span>
              <span>Direct communication via verified platform messaging only.</span>
            </div>

            {/* Profile summary */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">
                Professional Summary
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed">{profile.bio}</p>
            </div>

            {/* Qualifications */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">
                  Technical Education
                </h3>
                <p className="font-bold text-gray-900 text-sm">{profile.qualification}</p>
                <p className="text-xs text-gray-600 mt-0.5">{profile.institution}</p>
                <p className="text-xs text-gray-500 mt-0.5">Batch of {profile.graduationYear}</p>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">
                  Experience & Roles
                </h3>
                <p className="font-bold text-gray-900 text-sm">
                  {profile.experienceYears} Years Hands-on Experience
                </p>
                <p className="text-xs text-gray-600 mt-0.5">Current Role: {profile.currentRole || 'Fresher'}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Willing to Relocate: {profile.willingToRelocate ? 'Yes' : 'No'}
                </p>
              </div>
            </div>

            {/* Skills */}
            <div className="pt-4 border-t border-gray-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">
                Certified Skills & Tools
              </h3>
              <div className="flex flex-wrap gap-2">
                {profile.skills.map((s, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 bg-gray-100 text-gray-800 text-xs font-semibold rounded-md border border-gray-200"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
