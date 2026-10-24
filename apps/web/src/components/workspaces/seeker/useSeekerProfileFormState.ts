'use client';

import { useState } from 'react';
import type { SeekerProfileData } from '../../../data/sampleWorkspaces';
import type { SeekerFormData } from './seekerFormTypes';

export function useSeekerProfileFormState(initialProfile: SeekerProfileData) {
  const [formData, setFormData] = useState<SeekerFormData>({
    formName: initialProfile.name,
    formGender: initialProfile.gender,
    formDob: initialProfile.dob,
    formSeekerType: initialProfile.seekerType,
    formAddress: initialProfile.address || '',
    formCity: initialProfile.city,
    formDistrict: initialProfile.district,
    formState: initialProfile.state,
    formPincode: initialProfile.pincode,
    formQualification: initialProfile.qualification,
    formInstitution: initialProfile.institution,
    formGraduationYear: initialProfile.graduationYear,
    formExperienceYears: initialProfile.experienceYears,
    formCurrentRole: initialProfile.currentRole || '',
    formSkillsInput: initialProfile.skills.join(', '),
    formLanguagesInput: initialProfile.languages.join(', '),
    formLocationsInput: initialProfile.preferredLocations.join(', '),
    formWillingToRelocate: initialProfile.willingToRelocate,
    formBio: initialProfile.bio,
    formAadhaarLastFour: initialProfile.aadhaarLastFour || '',
    formApaarId: initialProfile.apaarId || '',
    formDpdpConsent: initialProfile.dpdpConsentGiven,
  });

  const updateField = <K extends keyof SeekerFormData>(key: K, value: SeekerFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
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
  };
}
