'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { SeekerFormData } from './seekerFormTypes';

interface SeekerKycAndEduFieldsProps {
  formData: SeekerFormData;
  updateField: <K extends keyof SeekerFormData>(key: K, value: SeekerFormData[K]) => void;
}

export function SeekerKycAndEduFields({ formData, updateField }: SeekerKycAndEduFieldsProps) {
  const t = useTranslations('SeekerWorkspace');

  return (
    <>
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2">
          {t('secDpdp')}
        </h3>

        <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-700 space-y-2">
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              id="dpdp-consent-checkbox"
              checked={formData.formDpdpConsent}
              onChange={(e) => updateField('formDpdpConsent', e.target.checked)}
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
              value={formData.formAadhaarLastFour}
              onChange={(e) => updateField('formAadhaarLastFour', e.target.value.replace(/\D/g, ''))}
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
              value={formData.formApaarId}
              onChange={(e) => updateField('formApaarId', e.target.value)}
              placeholder="e.g. 2024-EDU-99214"
              className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
            />
          </div>
        </div>
      </div>

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
              value={formData.formQualification}
              onChange={(e) => updateField('formQualification', e.target.value)}
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
              value={formData.formInstitution}
              onChange={(e) => updateField('formInstitution', e.target.value)}
              placeholder="Government ITI"
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelPassingYear')}</label>
            <input
              type="text"
              value={formData.formGraduationYear}
              onChange={(e) => updateField('formGraduationYear', e.target.value)}
              placeholder="2024"
              className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
            />
          </div>
        </div>
      </div>
    </>
  );
}
