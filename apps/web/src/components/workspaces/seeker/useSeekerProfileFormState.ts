'use client';

import { useState } from 'react';
import type { SeekerProfileData } from '../../../data/sampleWorkspaces';
import type { SeekerFormData } from './seekerFormTypes';

export function profileToFormData(profile: SeekerProfileData): SeekerFormData {
  return {
    formName: profile.name,
    formGender: profile.gender,
    formDob: profile.dob,
    formSeekerType: profile.seekerType,
    formAddress: profile.address || '',
    formCity: profile.city,
    formDistrict: profile.district,
    formState: profile.state,
    formStateCode: profile.stateCode ?? null,
    formDistrictId: profile.districtId ?? null,
    formPincode: profile.pincode,
    formQualification: profile.qualification,
    formInstitution: profile.institution,
    formGraduationYear: profile.graduationYear,
    formExperienceYears: profile.experienceYears,
    formCurrentRole: profile.currentRole || '',
    formSkillsInput: profile.skills.join(', '),
    formLanguagesInput: profile.languages.join(', '),
    formLocationsInput: profile.preferredLocations.join(', '),
    formWillingToRelocate: profile.willingToRelocate,
    formBio: profile.bio,
    formAadhaarLastFour: profile.aadhaarLastFour || '',
    formApaarId: profile.apaarId || '',
    formDpdpConsent: profile.dpdpConsentGiven,
  };
}

export function useSeekerProfileFormState(initialProfile: SeekerProfileData) {
  const [formData, setFormData] = useState<SeekerFormData>(() => profileToFormData(initialProfile));

  const updateField = <K extends keyof SeekerFormData>(key: K, value: SeekerFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const resetFromProfile = (profile: SeekerProfileData) => {
    setFormData(profileToFormData(profile));
  };

  const syncFromProfile = (data: Partial<SeekerProfileData>) => {
    setFormData((prev) => ({
      ...prev,
      formName: data.name ?? prev.formName,
      formSeekerType: data.seekerType ?? prev.formSeekerType,
      formGender: data.gender ?? prev.formGender,
      formDob: data.dob ?? prev.formDob,
      formAddress: data.address ?? prev.formAddress,
      formCity: data.city ?? prev.formCity,
      formDistrict: data.district ?? prev.formDistrict,
      formState: data.state ?? prev.formState,
      formStateCode: data.stateCode !== undefined ? data.stateCode : prev.formStateCode,
      formDistrictId: data.districtId !== undefined ? data.districtId : prev.formDistrictId,
      formPincode: data.pincode ?? prev.formPincode,
      formQualification: data.qualification ?? prev.formQualification,
      formInstitution: data.institution ?? prev.formInstitution,
      formGraduationYear: data.graduationYear ?? prev.formGraduationYear,
      formExperienceYears: data.experienceYears !== undefined ? data.experienceYears : prev.formExperienceYears,
      formCurrentRole: data.currentRole ?? prev.formCurrentRole,
      formSkillsInput: data.skills && data.skills.length > 0 ? data.skills.join(', ') : prev.formSkillsInput,
      formLanguagesInput: data.languages && data.languages.length > 0 ? data.languages.join(', ') : prev.formLanguagesInput,
      formLocationsInput:
        data.preferredLocations && data.preferredLocations.length > 0
          ? data.preferredLocations.join(', ')
          : prev.formLocationsInput,
      formWillingToRelocate: data.willingToRelocate !== undefined ? data.willingToRelocate : prev.formWillingToRelocate,
      formBio: data.bio ?? prev.formBio,
      formAadhaarLastFour: data.aadhaarLastFour ?? prev.formAadhaarLastFour,
      formApaarId: data.apaarId ?? prev.formApaarId,
      formDpdpConsent: data.dpdpConsentGiven !== undefined ? data.dpdpConsentGiven : prev.formDpdpConsent,
    }));
  };

  return {
    formData,
    updateField,
    syncFromProfile,
    resetFromProfile,
  };
}
