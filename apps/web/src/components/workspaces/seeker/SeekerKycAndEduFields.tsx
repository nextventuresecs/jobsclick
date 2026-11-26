'use client';

import React, { useId } from 'react';
import { useTranslations } from 'next-intl';
import type { SeekerFormData } from './seekerFormTypes';

interface SeekerKycAndEduFieldsProps {
  formData: SeekerFormData;
  updateField: <K extends keyof SeekerFormData>(key: K, value: SeekerFormData[K]) => void;
}

export function SeekerKycAndEduFields({ formData, updateField }: SeekerKycAndEduFieldsProps) {
  const t = useTranslations('SeekerWorkspace');
  const id = useId();

  return (
    <>
      <div className="space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2">
          {t('secDpdp')}
        </h4>

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
            <label htmlFor={`${id}-formAadhaarLastFour`} className="block text-base font-semibold text-gray-700 mb-1">
              {t('labelAadhaarInput')}
            </label>
            <input
              id={`${id}-formAadhaarLastFour`}
              inputMode="numeric"
              type="text"
              maxLength={4}
              value={formData.formAadhaarLastFour}
              onChange={(e) => updateField('formAadhaarLastFour', e.target.value.replace(/\D/g, ''))}
              className="min-h-12 w-full px-3 py-2 text-base font-mono rounded-xl border border-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              {t('labelAadhaarHelp')}
            </p>
          </div>

          <div>
            <label htmlFor={`${id}-formApaarId`} className="block text-base font-semibold text-gray-700 mb-1">
              {t('labelApaarInput')}
            </label>
            <input
              id={`${id}-formApaarId`}
              type="text"
              value={formData.formApaarId}
              onChange={(e) => updateField('formApaarId', e.target.value)}
              className="min-h-12 w-full px-3 py-2 text-base font-mono rounded-xl border border-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2">
          {t('secEducation')}
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor={`${id}-formQualification`} className="block text-base font-semibold text-gray-700 mb-1">
              {t('labelHighestQual')}
            </label>
            <input
              id={`${id}-formQualification`}
              type="text"
              value={formData.formQualification}
              onChange={(e) => updateField('formQualification', e.target.value)}
              className="min-h-12 w-full px-3 py-2 text-base rounded-xl border border-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            />
          </div>

          <div>
            <label htmlFor={`${id}-formInstitution`} className="block text-base font-semibold text-gray-700 mb-1">
              {t('labelTrainingInstitute')}
            </label>
            <input
              id={`${id}-formInstitution`}
              type="text"
              value={formData.formInstitution}
              onChange={(e) => updateField('formInstitution', e.target.value)}
              className="min-h-12 w-full px-3 py-2 text-base rounded-xl border border-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            />
          </div>

          <div>
            <label htmlFor={`${id}-formGraduationYear`} className="block text-base font-semibold text-gray-700 mb-1">{t('labelPassingYear')}</label>
            <input
              id={`${id}-formGraduationYear`}
              inputMode="numeric"
              type="text"
              value={formData.formGraduationYear}
              onChange={(e) => updateField('formGraduationYear', e.target.value)}
              className="min-h-12 w-full px-3 py-2 text-base font-mono rounded-xl border border-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            />
          </div>
        </div>
      </div>
    </>
  );
}
