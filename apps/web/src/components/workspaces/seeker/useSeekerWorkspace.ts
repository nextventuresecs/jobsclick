'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useApp } from '../../../context/AppContext';
import type {
  SeekerProfileData,
  ApplicationData,
} from '../../../data/sampleWorkspaces';
import type { JobItem } from '../../../data/sampleJobs';
import { mapApiJobToJobItem, type ApiJobPayload } from '../../../lib/job-mapper';
import { jobSeekerProfileSchema } from '@indian-job-portal/validation';
import { fetchSeekerProfile, fetchSeekerApplications, saveSeekerProfile } from './seekerApi';
import { useSeekerProfileFormState } from './useSeekerProfileFormState';

const defaultEmptySeekerProfile: SeekerProfileData = {
  id: '',
  name: '',
  phone: '',
  email: '',
  seekerType: 'individual',
  gender: 'Male',
  dob: '',
  address: '',
  city: '',
  district: '',
  state: '',
  pincode: '',
  qualification: '',
  institution: '',
  graduationYear: '',
  experienceYears: 0,
  skills: [],
  languages: [],
  preferredCategories: [],
  preferredLocations: [],
  willingToRelocate: false,
  completionPercentage: 0,
  bio: '',
  dpdpConsentGiven: false,
  isOnboardingComplete: false,
};

export function useSeekerWorkspace() {
  const t = useTranslations('SeekerWorkspace');
  const { user, accessToken, addToast } = useApp();
  const [activeTab, setActiveTab] = useState<'overview' | 'applications' | 'profile' | 'cv-preview'>('overview');
  const [profile, setProfile] = useState<SeekerProfileData>(defaultEmptySeekerProfile);
  const [applications, setApplications] = useState<readonly ApplicationData[]>([]);
  const [recommendedJobs, setRecommendedJobs] = useState<readonly JobItem[]>([]);
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const { formData, updateField, syncFromProfile } = useSeekerProfileFormState(profile);

  const myApplications = applications;

  // Mount effect to fetch remote profile, applications, credit balance, & live recommendations
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

    if (!user?.id && !accessToken) {
      return () => { isMounted = false; };
    }

    const loadRecommendations = (category?: string) => {
      const categoryParam = category ? `?category=${encodeURIComponent(category)}` : '';
      fetch(`${apiUrl}/jobs${categoryParam}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((jobsData) => {
          if (!isMounted || !jobsData?.jobs) return;
          const mapped = jobsData.jobs.map((j: ApiJobPayload) => mapApiJobToJobItem(j));
          setRecommendedJobs(mapped.slice(0, 3));
        })
        .catch(() => {});
    };

    // 1. Fetch Seeker Profile & trigger recommendations
    fetchSeekerProfile(apiUrl, authHeader, userId).then((data) => {
      if (!isMounted) return;
      if (data) {
        setProfile((prev) => ({
          ...prev,
          ...data,
          id: data.id || prev.id || userId,
          skills: data.skills || prev.skills,
          languages: data.languages || prev.languages,
          preferredLocations: data.preferredLocations || prev.preferredLocations,
        }));
        if (data.isOnboardingComplete !== undefined) {
          setIsOnboardingComplete(data.isOnboardingComplete);
        }
        syncFromProfile(data);
        loadRecommendations(data.preferredCategories?.[0]);
      } else {
        loadRecommendations();
      }
    });

    // 2. Fetch Seeker Applications
    fetchSeekerApplications(apiUrl, authHeader, userId).then((mappedApps) => {
      if (!isMounted) return;
      setApplications(mappedApps);
    });

    // 3. Fetch Credit Ledger Balance
    fetch(`${apiUrl}/wallet/balance`, {
      headers: { Authorization: authHeader, 'x-user-id': userId },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((balanceData) => {
        if (!isMounted || balanceData?.balance === undefined) return;
        setCreditsBalance(balanceData.balance);
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    const skillsArray = formData.formSkillsInput.split(',').map((s) => s.trim()).filter(Boolean);
    const languagesArray = formData.formLanguagesInput.split(',').map((l) => l.trim()).filter(Boolean);
    const locationsArray = formData.formLocationsInput.split(',').map((loc) => loc.trim()).filter(Boolean);

    const validationResult = jobSeekerProfileSchema.safeParse({
      fullName: formData.formName,
      seekerType: formData.formSeekerType,
      gender: formData.formGender,
      dob: formData.formDob,
      city: formData.formCity,
      district: formData.formDistrict,
      state: formData.formState,
      pincode: formData.formPincode || undefined,
      qualification: formData.formQualification,
      institution: formData.formInstitution,
      graduationYear: formData.formGraduationYear,
      experienceYears: Number(formData.formExperienceYears),
      currentRole: formData.formCurrentRole,
      skills: skillsArray,
      languages: languagesArray,
      preferredCategories: profile.preferredCategories,
      preferredLocations: locationsArray,
      willingToRelocate: formData.formWillingToRelocate,
      bio: formData.formBio,
      aadhaarLastFour: formData.formAadhaarLastFour || undefined,
      apaarId: formData.formApaarId || undefined,
      dpdpConsentGiven: formData.formDpdpConsent,
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

    const saveResult = await saveSeekerProfile(apiUrl, authHeader, userId, validationResult.data);
    const completeness = saveResult.completenessScore ?? 100;

    setProfile({
      ...profile,
      name: formData.formName,
      seekerType: formData.formSeekerType,
      gender: formData.formGender,
      dob: formData.formDob,
      address: formData.formAddress,
      city: formData.formCity,
      district: formData.formDistrict,
      state: formData.formState,
      pincode: formData.formPincode,
      qualification: formData.formQualification,
      institution: formData.formInstitution,
      graduationYear: formData.formGraduationYear,
      experienceYears: Number(formData.formExperienceYears),
      currentRole: formData.formCurrentRole,
      skills: skillsArray.length > 0 ? skillsArray : profile.skills,
      languages: languagesArray.length > 0 ? languagesArray : profile.languages,
      preferredLocations: locationsArray.length > 0 ? locationsArray : profile.preferredLocations,
      willingToRelocate: formData.formWillingToRelocate,
      bio: formData.formBio,
      aadhaarLastFour: formData.formAadhaarLastFour,
      aadhaarVerified: Boolean(formData.formAadhaarLastFour),
      apaarId: formData.formApaarId,
      dpdpConsentGiven: formData.formDpdpConsent,
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

  return {
    activeTab,
    setActiveTab,
    profile,
    myApplications,
    recommendedJobs,
    creditsBalance,
    isOnboardingComplete,
    isEditing,
    setIsEditing,
    formData,
    updateField,
    handleSaveProfile,
    handlePrint,
  };
}
