'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useApp } from '../../../context/AppContext';
import {
  INITIAL_SEEKER_PROFILE,
  INITIAL_APPLICATIONS,
  SeekerProfileData,
  ApplicationData,
} from '../../../data/sampleWorkspaces';
import { SAMPLE_JOBS } from '../../../data/sampleJobs';
import { jobSeekerProfileSchema } from '@indian-job-portal/validation';
import { fetchSeekerProfile, fetchSeekerApplications, saveSeekerProfile } from './seekerApi';
import { useSeekerProfileFormState } from './useSeekerProfileFormState';

export function useSeekerWorkspace() {
  const t = useTranslations('SeekerWorkspace');
  const { user, accessToken, addToast } = useApp();
  const [activeTab, setActiveTab] = useState<'overview' | 'applications' | 'profile' | 'cv-preview'>('overview');
  const [profile, setProfile] = useState<SeekerProfileData>(INITIAL_SEEKER_PROFILE);
  const [applications, setApplications] = useState<readonly ApplicationData[]>(INITIAL_APPLICATIONS);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(profile.isOnboardingComplete);
  const [isEditing, setIsEditing] = useState(false);

  const { formData, updateField, syncFromProfile } = useSeekerProfileFormState(profile);

  const myApplications = applications.filter((a) => a.candidateId === profile.id);
  const recommendedJobs = SAMPLE_JOBS.filter((j) =>
    profile.preferredCategories.includes(j.category)
  ).slice(0, 3);

  // Mount effect to fetch remote profile & applications
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

    fetchSeekerProfile(apiUrl, authHeader, userId).then((data) => {
      if (!data || !isMounted) return;
      setProfile((prev) => ({
        ...prev,
        ...data,
        skills: data.skills || prev.skills,
        languages: data.languages || prev.languages,
        preferredLocations: data.preferredLocations || prev.preferredLocations,
      }));
      syncFromProfile(data);
    });

    fetchSeekerApplications(apiUrl, authHeader, userId).then((mappedApps) => {
      if (!isMounted || mappedApps.length === 0) return;
      setApplications((prev) => {
        const mappedIds = new Set(mappedApps.map((m) => m.id));
        return [...mappedApps, ...prev.filter((p) => !mappedIds.has(p.id))];
      });
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user]);

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
    isOnboardingComplete,
    isEditing,
    setIsEditing,
    formData,
    updateField,
    handleSaveProfile,
    handlePrint,
  };
}
