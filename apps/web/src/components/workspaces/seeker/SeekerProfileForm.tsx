'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@indian-job-portal/ui';
import { Save } from 'lucide-react';
import type { SeekerFormData } from './seekerFormTypes';
import { SeekerDemographicsFields } from './SeekerDemographicsFields';
import { SeekerKycAndEduFields } from './SeekerKycAndEduFields';
import { SeekerSkillsAndPrefsFields } from './SeekerSkillsAndPrefsFields';

interface SeekerProfileFormProps {
  formData: SeekerFormData;
  updateField: <K extends keyof SeekerFormData>(key: K, value: SeekerFormData[K]) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

export function SeekerProfileForm({
  formData,
  updateField,
  onSubmit,
  onCancel,
}: SeekerProfileFormProps) {
  const t = useTranslations('SeekerWorkspace');

  return (
    <form onSubmit={onSubmit} className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-xs space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
        <div>
          <h2 className="text-base font-bold text-gray-900">{t('formEditHeading')}</h2>
          <p className="text-xs text-gray-500">{t('formEditSubheading')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
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

      <SeekerDemographicsFields formData={formData} updateField={updateField} />
      <SeekerKycAndEduFields formData={formData} updateField={updateField} />
      <SeekerSkillsAndPrefsFields formData={formData} updateField={updateField} />

      <div className="pt-4 border-t border-gray-200 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
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
  );
}
