'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('SeekerWorkspace');
  const { user, accessToken, addToast } = useApp();
  const [activeTab, setActiveTab] = useState<'overview' | 'applications' | 'profile' | 'cv-preview'>('overview');
  const [profile, setProfile] = useState<SeekerProfileData>(INITIAL_SEEKER_PROFILE);
  const [applications, setApplications] = useState<readonly ApplicationData[]>(INITIAL_APPLICATIONS);
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

  // Refresh simulation: load seeker profile and submitted applications on mount
  useEffect(() => {
    let isMounted = true;
    const apiUrl =
      process.env['NEXT_PUBLIC_API_URL'] ||
      process.env['API_URL'] ||
      'http://localhost:3001';
    const authHeader = accessToken
      ? `Bearer ${accessToken}`
      : `Bearer jwt_session_${user?.id || 'usr_seeker_77'}_${Date.now()}`;
    const userId = user?.id || 'usr_seeker_77';

    // 1. Fetch Seeker Profile
    fetch(`${apiUrl}/profiles/seeker/me`, {
      headers: {
        Authorization: authHeader,
        'x-user-id': userId,
      },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || !isMounted) return;
        if (data.fullName) {
          setProfile((prev) => ({
            ...prev,
            id: data.id || prev.id,
            name: data.fullName || prev.name,
            seekerType: data.seekerType || prev.seekerType,
            gender: data.gender || prev.gender,
            dob: data.dob || prev.dob,
            address: data.address || prev.address,
            city: data.city || prev.city,
            district: data.district || prev.district,
            state: data.state || prev.state,
            pincode: data.pincode || prev.pincode,
            qualification: data.qualification || prev.qualification,
            institution: data.institution || prev.institution,
            graduationYear: data.graduationYear || prev.graduationYear,
            experienceYears: data.experienceYears ?? prev.experienceYears,
            currentRole: data.currentRole || prev.currentRole,
            skills: data.skills && data.skills.length > 0 ? data.skills : prev.skills,
            languages: data.languages && data.languages.length > 0 ? data.languages : prev.languages,
            preferredLocations:
              data.preferredLocations && data.preferredLocations.length > 0
                ? data.preferredLocations
                : prev.preferredLocations,
            willingToRelocate: data.willingToRelocate ?? prev.willingToRelocate,
            bio: data.bio || prev.bio,
            aadhaarLastFour: data.aadhaarLastFour || prev.aadhaarLastFour,
            apaarId: data.apaarId || prev.apaarId,
            dpdpConsentGiven: data.dpdpConsentGiven ?? prev.dpdpConsentGiven,
            completionPercentage: data.completenessScore ?? prev.completionPercentage,
            isOnboardingComplete: true,
          }));

          setFormName(data.fullName);
          if (data.seekerType) setFormSeekerType(data.seekerType);
          if (data.gender) setFormGender(data.gender);
          if (data.dob) setFormDob(data.dob);
          if (data.address) setFormAddress(data.address);
          if (data.city) setFormCity(data.city);
          if (data.district) setFormDistrict(data.district);
          if (data.state) setFormState(data.state);
          if (data.pincode) setFormPincode(data.pincode);
          if (data.qualification) setFormQualification(data.qualification);
          if (data.institution) setFormInstitution(data.institution);
          if (data.graduationYear) setFormGraduationYear(data.graduationYear);
          if (data.experienceYears !== undefined) setFormExperienceYears(data.experienceYears);
          if (data.currentRole) setFormCurrentRole(data.currentRole);
          if (data.skills && data.skills.length > 0) setFormSkillsInput(data.skills.join(', '));
          if (data.languages && data.languages.length > 0) setFormLanguagesInput(data.languages.join(', '));
          if (data.preferredLocations && data.preferredLocations.length > 0)
            setFormLocationsInput(data.preferredLocations.join(', '));
          if (data.willingToRelocate !== undefined) setFormWillingToRelocate(data.willingToRelocate);
          if (data.bio) setFormBio(data.bio);
          if (data.aadhaarLastFour) setFormAadhaarLastFour(data.aadhaarLastFour);
          if (data.apaarId) setFormApaarId(data.apaarId);
          if (data.dpdpConsentGiven !== undefined) setFormDpdpConsent(data.dpdpConsentGiven);
        }
      })
      .catch(() => {});

    // 2. Fetch Seeker's Submitted Applications
    fetch(`${apiUrl}/jobs/applications/my`, {
      headers: {
        Authorization: authHeader,
        'x-user-id': userId,
      },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((appsData) => {
        if (!appsData || !Array.isArray(appsData) || !isMounted) return;
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

        const mappedApps: ApplicationData[] = (appsData as ApiCandidateAppRow[]).map((a) => ({
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
          appliedDate: (a.createdAt?.split('T')[0] ?? '2026-10-16'),
          status: a.status || 'applied',
        }));

        if (mappedApps.length > 0) {
          setApplications((prev) => {
            const mappedIds = new Set(mappedApps.map((m) => m.id));
            return [...mappedApps, ...prev.filter((p) => !mappedIds.has(p.id))];
          });
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [accessToken, user]);

  // Save profile with validation against jobSeekerProfileSchema and PUT /profiles/seeker/me
  const handleSaveProfile = async (e: React.FormEvent) => {
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
      const err = validationResult.error.errors[0]?.message || t('toastValidationError');
      addToast({ type: 'error', title: t('toastValidationError'), message: err });
      return;
    }

    const apiUrl =
      process.env['NEXT_PUBLIC_API_URL'] ||
      process.env['API_URL'] ||
      'http://localhost:3001';
    const authHeader = accessToken
      ? `Bearer ${accessToken}`
      : `Bearer jwt_session_${user?.id || 'usr_seeker_77'}_${Date.now()}`;
    const userId = user?.id || 'usr_seeker_77';

    let completeness = 100;
    try {
      const res = await fetch(`${apiUrl}/profiles/seeker/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
          'x-user-id': userId,
        },
        body: JSON.stringify(validationResult.data),
      });

      if (res.ok) {
        const saved = await res.json();
        if (saved?.completenessScore) {
          completeness = saved.completenessScore;
        }
      }
    } catch {
      // Offline fallback
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
      completionPercentage: completeness,
      isOnboardingComplete: true,
    });

    setIsOnboardingComplete(true);
    setIsEditing(false);
    addToast({
      type: 'success',
      title: t('toastProfileSaved'),
      message: t('toastProfileSavedDesc'),
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
                <span>{t('verifiedCandidate')}</span>
              </span>
              {profile.enrolledViaInstitution && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
                  <GraduationCap className="w-3 h-3 text-teal-600" />
                  <span>{t('enrolledVia')} {profile.enrolledViaInstitution}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-2">
              <span>{profile.currentRole || t('defaultRole')}</span>
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
            <span className="text-xs font-semibold text-gray-500">{t('profileReadiness')}</span>
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
            <span>{t('digitalCv')}</span>
          </Button>
        </div>
      </div>

      {/* Onboarding Incomplete Alert Banner */}
      {!isOnboardingComplete && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-950">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-xs font-bold">{t('onboardingIncompleteTitle')}</p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                {t('onboardingIncompleteDesc')}
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
            {t('completeProfileNow')}
          </Button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto gap-2">
        {([
          { id: 'overview', label: t('tabOverview'), icon: Briefcase },
          { id: 'applications', label: `${t('tabApplications')} (${myApplications.length})`, icon: Clock },
          { id: 'profile', label: t('tabProfile'), icon: User },
          { id: 'cv-preview', label: t('tabCvPreview'), icon: FileText },
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
              <span className="text-xs font-semibold text-gray-500">{t('statActiveApplications')}</span>
              <p className="text-2xl font-bold text-gray-900 mt-1">{myApplications.length}</p>
              <p className="text-[11px] text-gray-500 mt-1">{t('statActiveApplicationsDesc')}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">{t('statShortlisted')}</span>
              <p className="text-2xl font-bold text-blue-600 mt-1">
                {myApplications.filter((a) => a.status === 'shortlisted' || a.status === 'under_review').length}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">{t('statShortlistedDesc')}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">{t('statPrivacyStatus')}</span>
              <div className="flex items-center gap-1.5 mt-1.5">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <span className="text-sm font-bold text-emerald-700">{t('statPrivacyStatusVal')}</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">{t('statPrivacyStatusDesc')}</p>
            </div>
          </div>

          {/* Active Applications preview */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-900">{t('pipelineHeading')}</h2>
              <button
                type="button"
                onClick={() => setActiveTab('applications')}
                className="text-xs font-semibold text-[#F97316] hover:underline"
              >
                {t('viewAll')} ({myApplications.length})
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
                      <span>{t('appliedOn')} {app.appliedDate}</span>
                    </p>
                    {app.interviewDate && (
                      <p className="text-xs font-semibold text-blue-700 mt-1.5 flex items-center gap-1 bg-blue-50 px-2.5 py-1 rounded-md w-fit">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{t('interviewScheduled')} {app.interviewDate}</span>
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
                <h2 className="text-sm font-bold text-gray-900">{t('recommendedJobsHeading')}</h2>
                <p className="text-xs text-gray-500">{t('recommendedJobsDesc')}</p>
              </div>
              <Link
                href="/jobs"
                className="text-xs font-semibold text-[#F97316] hover:underline inline-flex items-center gap-1"
              >
                <span>{t('browseAllJobs')}</span>
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
                    {t('viewDetailsApply')}
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
            <h2 className="text-base font-bold text-gray-900">{t('applicationsHeading')}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {t('applicationsSubheading')}
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
                      <span>{t('appliedOn')} {app.appliedDate}</span>
                    </p>
                  </div>
                  <StatusBadge status={app.status} />
                </div>

                {app.notes && (
                  <div className="p-3 rounded-lg bg-orange-50 border border-orange-200 text-xs text-orange-950">
                    <span className="font-semibold">{t('recruiterNote')}</span> {app.notes}
                  </div>
                )}

                {app.interviewDate && (
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-950 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>
                      <strong className="font-semibold">{t('interviewScheduled')}</strong> {app.interviewDate}
                    </span>
                  </div>
                )}

                <div className="pt-2 border-t border-gray-200 flex flex-wrap items-center justify-between text-xs text-gray-500 gap-2">
                  <span>{t('candidateRef')} {app.candidateId}</span>
                  <span className="flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{t('hardInvariant1Notice')}</span>
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
                  <h2 className="text-base font-bold text-gray-900">{t('dossierHeading')}</h2>
                  <p className="text-xs text-gray-500">{t('dossierSubheading')}</p>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center gap-1.5"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>{t('editProfile')}</span>
                </Button>
              </div>

              {/* 1. Identity & Demographics */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2 flex items-center gap-1.5">
                  <User className="w-4 h-4" />
                  <span>{t('secPersonalInfo')}</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-gray-500">{t('labelFullName')}</span>
                    <p className="font-bold text-gray-900 mt-0.5 text-sm">{profile.name}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('labelCandidateType')}</span>
                    <p className="font-bold text-gray-900 mt-0.5 capitalize">
                      {profile.seekerType === 'student' ? t('typeStudent') : t('typeIndividual')}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('labelGenderDob')}</span>
                    <p className="font-bold text-gray-900 mt-0.5">{profile.gender} • {profile.dob}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('labelCurrentRole')}</span>
                    <p className="font-bold text-gray-900 mt-0.5">{profile.currentRole || t('roleFresher')}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('labelLocation')}</span>
                    <p className="font-bold text-gray-900 mt-0.5">
                      {profile.city}, {profile.district}, {profile.state} ({profile.pincode})
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('labelCampusAffiliation')}</span>
                    <p className="font-bold text-gray-900 mt-0.5">
                      {profile.enrolledViaInstitution || profile.institution || t('directRegistration')}
                    </p>
                  </div>
                </div>
              </div>

              {/* 2. DPDP Act & Statutory KYC (Hard Invariant #8) */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>{t('secDpdp')}</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-gray-500">{t('labelAadhaarLastFour')}</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono font-bold text-gray-900">
                        {profile.aadhaarLastFour ? `•••• •••• ${profile.aadhaarLastFour}` : t('notProvided')}
                      </span>
                      {profile.aadhaarVerified && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>{t('verified')}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{t('aadhaarNotice')}</p>
                  </div>

                  <div>
                    <span className="text-gray-500">{t('labelApaarId')}</span>
                    <p className="font-mono font-bold text-gray-900 mt-0.5">{profile.apaarId || t('optionalNotProvided')}</p>
                  </div>

                  <div>
                    <span className="text-gray-500">{t('labelDpdpConsent')}</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="font-bold text-emerald-700">{t('consentActive')}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{t('dpdpGuidelines')}</p>
                  </div>
                </div>
              </div>

              {/* 3. Education & Trade Qualifications */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2 flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4" />
                  <span>{t('secEducation')}</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-gray-500">{t('labelHighestQual')}</span>
                    <p className="font-bold text-gray-900 mt-0.5">{profile.qualification}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('labelTrainingInstitute')}</span>
                    <p className="font-bold text-gray-900 mt-0.5">{profile.institution}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('labelPassingYear')}</span>
                    <p className="font-bold text-gray-900 mt-0.5">
                      Batch of {profile.graduationYear} • {profile.experienceYears} {t('yearsExp')}
                    </p>
                  </div>
                </div>
              </div>

              {/* 4. Skills & Competencies */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2 flex items-center gap-1.5">
                  <Award className="w-4 h-4" />
                  <span>{t('secSkills')}</span>
                </h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-xs font-semibold text-gray-500 block mb-1.5">
                      {t('labelTradeSkills')}:
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
                    <span className="text-gray-500 font-semibold">{t('labelLanguages')}:</span>
                    <span className="font-bold text-gray-800 ml-2">{profile.languages.join(', ')}</span>
                  </div>

                  <div className="pt-2 text-xs">
                    <span className="text-gray-500 font-semibold">{t('secBio')}:</span>
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
                  <span>{t('labelRelocate')}</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-gray-500">{t('preferredLocationsHeading')}</span>
                    <p className="font-bold text-gray-900 mt-0.5">{profile.preferredLocations.join(', ')}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('labelRelocate')}</span>
                    <p className="font-bold text-gray-900 mt-0.5">{profile.willingToRelocate ? t('yes') : t('no')}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('hardInvariant1Notice')}</span>
                    <div className="flex items-center gap-1 mt-0.5 text-emerald-700 font-semibold">
                      <Lock className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{t('hardInvariant1Notice')}</span>
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
                  <h2 className="text-base font-bold text-gray-900">{t('formEditHeading')}</h2>
                  <p className="text-xs text-gray-500">{t('formEditSubheading')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 rounded-lg border border-gray-300"
                  >
                    {t('cancel')}
                  </button>
                  <Button type="submit" variant="primary" size="sm" className="inline-flex items-center gap-1.5">
                    <Save className="w-4 h-4" />
                    <span>{t('saveProfile')}</span>
                  </Button>
                </div>
              </div>

              {/* Section 1: Demographics */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2">
                  {t('secPersonalInfo')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelFullName')} <span className="text-red-500">*</span>
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
                    <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelGender')}</label>
                    <select
                      value={formGender}
                      onChange={(e) => setFormGender(e.target.value as SeekerProfileData['gender'])}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden bg-white"
                    >
                      <option value="Male">{t('genderMale')}</option>
                      <option value="Female">{t('genderFemale')}</option>
                      <option value="Other">{t('genderOther')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelDob')}</label>
                    <input
                      type="date"
                      value={formDob}
                      onChange={(e) => setFormDob(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelCandidateType')}</label>
                    <select
                      value={formSeekerType}
                      onChange={(e) => setFormSeekerType(e.target.value as SeekerProfileData['seekerType'])}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden bg-white"
                    >
                      <option value="student">{t('typeStudent')}</option>
                      <option value="individual">{t('typeIndividual')}</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelPermanentAddress')}</label>
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
                      {t('labelCity')} <span className="text-red-500">*</span>
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
                    <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelDistrict')}</label>
                    <input
                      type="text"
                      value={formDistrict}
                      onChange={(e) => setFormDistrict(e.target.value)}
                      placeholder="Pune"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelState')}</label>
                    <input
                      type="text"
                      value={formState}
                      onChange={(e) => setFormState(e.target.value)}
                      placeholder="Maharashtra"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelPincode')}</label>
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
                  {t('secDpdp')}
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
                      {t('labelDpdpCheckbox')}
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelAadhaarInput')}
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
                      {t('labelAadhaarHelp')}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelApaarInput')}
                    </label>
                    <input
                      type="text"
                      value={formApaarId}
                      onChange={(e) => setFormApaarId(e.target.value)}
                      placeholder="e.g. 2024-EDU-99214"
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Education & Trades */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2">
                  {t('secEducation')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelHighestQual')}
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
                      {t('labelTrainingInstitute')}
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
                    <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelPassingYear')}</label>
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
                  {t('secSkills')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelExpYears')}
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
                    <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelCurrentRole')}</label>
                    <input
                      type="text"
                      value={formCurrentRole}
                      onChange={(e) => setFormCurrentRole(e.target.value)}
                      placeholder="Junior CNC Machinist"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelLanguages')}</label>
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
                      {t('labelTradeSkills')}
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
                      {t('secBio')}
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
                  {t('labelRelocate')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelPreferredLocations')}
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
                      {t('labelRelocateCheckbox')}
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
                  {t('cancel')}
                </button>
                <Button type="submit" variant="primary" size="md" className="inline-flex items-center gap-1.5 font-semibold">
                  <Save className="w-4 h-4" />
                  <span>{t('saveProfile')}</span>
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
              <h2 className="text-sm font-bold text-gray-900">{t('cvHeading')}</h2>
              <p className="text-xs text-gray-500">
                {t('statPrivacyStatusDesc')}
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
              <span>{t('printResume')}</span>
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
                    <span>{t('enrolledVia')} {profile.enrolledViaInstitution}</span>
                  </p>
                )}
              </div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{t('verifiedCandidate')}</span>
                </span>
                <p className="text-[11px] text-gray-400 font-mono mt-2">{t('candidateRef')} {profile.id}</p>
                {profile.aadhaarLastFour && (
                  <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                    {t('labelAadhaarLastFour')}: •••• •••• {profile.aadhaarLastFour} ({t('verified')})
                  </p>
                )}
              </div>
            </div>

            {/* Privacy notice banner */}
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 flex items-center justify-between">
              <span className="font-semibold text-gray-800">
                {t('hardInvariant1Notice')}:
              </span>
              <span>{t('statPrivacyStatusDesc')}</span>
            </div>

            {/* Profile summary */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">
                {t('secBio')}
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed">{profile.bio}</p>
            </div>

            {/* Qualifications */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">
                  {t('secEducation')}
                </h3>
                <p className="font-bold text-gray-900 text-sm">{profile.qualification}</p>
                <p className="text-xs text-gray-600 mt-0.5">{profile.institution}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t('labelPassingYear')}: {profile.graduationYear}</p>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">
                  {t('experienceHeading')}
                </h3>
                <p className="font-bold text-gray-900 text-sm">
                  {profile.experienceYears} {t('yearsExp')} {t('labelExpYears')}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">{t('labelCurrentRole')}: {profile.currentRole || t('roleFresher')}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t('labelRelocate')}: {profile.willingToRelocate ? t('yes') : t('no')}
                </p>
              </div>
            </div>

            {/* Skills */}
            <div className="pt-4 border-t border-gray-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">
                {t('secSkills')}
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
