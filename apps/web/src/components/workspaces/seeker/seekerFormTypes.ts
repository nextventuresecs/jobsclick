import type { SeekerProfileData } from '../../../data/sampleWorkspaces';

export interface SeekerFormData {
  formName: string;
  formGender: SeekerProfileData['gender'];
  formDob: string;
  formSeekerType: SeekerProfileData['seekerType'];
  formAddress: string;
  formCity: string;
  formDistrict: string;
  formState: string;
  formPincode: string;
  formQualification: string;
  formInstitution: string;
  formGraduationYear: string;
  formExperienceYears: number;
  formCurrentRole: string;
  formSkillsInput: string;
  formLanguagesInput: string;
  formLocationsInput: string;
  formWillingToRelocate: boolean;
  formBio: string;
  formAadhaarLastFour: string;
  formApaarId: string;
  formDpdpConsent: boolean;
}
