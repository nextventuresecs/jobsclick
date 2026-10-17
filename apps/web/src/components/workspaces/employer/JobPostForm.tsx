'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@indian-job-portal/ui';
import type {
  IndustryCategory,
  EmploymentType,
  ExperienceLevel,
} from '@indian-job-portal/validation';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { JobPostFormFields } from './JobPostFormFields';

export interface JobPostFormData {
  title: string;
  setTitle: (val: string) => void;
  category: IndustryCategory;
  setCategory: (val: IndustryCategory) => void;
  employmentType: EmploymentType;
  setEmploymentType: (val: EmploymentType) => void;
  experienceLevel: ExperienceLevel;
  setExperienceLevel: (val: ExperienceLevel) => void;
  workShift: string;
  setWorkShift: (val: string) => void;
  qualification: string;
  setQualification: (val: string) => void;
  plantLocation: string;
  setPlantLocation: (val: string) => void;
  jobCity: string;
  setJobCity: (val: string) => void;
  jobDistrict: string;
  setJobDistrict: (val: string) => void;
  salaryMin: number;
  setSalaryMin: (val: number) => void;
  salaryMax: number;
  setSalaryMax: (val: number) => void;
  openings: number;
  setOpenings: (val: number) => void;
  skillsInput: string;
  setSkillsInput: (val: string) => void;
  description: string;
  setDescription: (val: string) => void;
}

interface JobPostFormProps {
  readonly formData: JobPostFormData;
  readonly formErrors: readonly string[];
  readonly successNotice: string;
  readonly onSubmit: (e: React.FormEvent) => void;
}

export function JobPostForm({
  formData: d,
  formErrors,
  successNotice,
  onSubmit,
}: JobPostFormProps) {
  const t = useTranslations('EmployerWorkspace');

  return (
    <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-xs max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">{t('postJobHeading')}</h2>
        <p className="text-xs text-gray-500">{t('postJobSubheading')}</p>
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

      <form onSubmit={onSubmit} className="space-y-5">
        <JobPostFormFields formData={d} />

        <Button type="submit" variant="primary" size="md" className="w-full justify-center font-semibold">
          {t('btnPublishJob')}
        </Button>
      </form>
    </div>
  );
}
