'use client';

import React, { useId } from 'react';
import { useTranslations } from 'next-intl';
import type { SeekerFormData } from './seekerFormTypes';

interface SeekerSkillsAndPrefsFieldsProps {
  formData: SeekerFormData;
  updateField: <K extends keyof SeekerFormData>(key: K, value: SeekerFormData[K]) => void;
}

export function SeekerSkillsAndPrefsFields({ formData, updateField }: SeekerSkillsAndPrefsFieldsProps) {
  const t = useTranslations('SeekerWorkspace');
  const id = useId();

  return (
    <>
      <div className="space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2">
          {t('secSkills')}
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor={`${id}-formExperienceYears`} className="block text-base font-semibold text-gray-700 mb-1">
              {t('labelExpYears')}
            </label>
            <input
              id={`${id}-formExperienceYears`}
              type="number"
              step="0.5"
              value={formData.formExperienceYears}
              onChange={(e) => updateField('formExperienceYears', Number(e.target.value))}
              className="min-h-12 w-full px-3 py-2 text-base font-mono rounded-xl border border-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            />
          </div>

          <div>
            <label htmlFor={`${id}-formCurrentRole`} className="block text-base font-semibold text-gray-700 mb-1">{t('labelCurrentRole')}</label>
            <input
              id={`${id}-formCurrentRole`}
              type="text"
              value={formData.formCurrentRole}
              onChange={(e) => updateField('formCurrentRole', e.target.value)}
              className="min-h-12 w-full px-3 py-2 text-base rounded-xl border border-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            />
          </div>

          <div>
            <label htmlFor={`${id}-formLanguagesInput`} className="block text-base font-semibold text-gray-700 mb-1">{t('labelLanguages')}</label>
            <input
              id={`${id}-formLanguagesInput`}
              type="text"
              value={formData.formLanguagesInput}
              onChange={(e) => updateField('formLanguagesInput', e.target.value)}
              className="min-h-12 w-full px-3 py-2 text-base rounded-xl border border-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            />
          </div>

          <div className="sm:col-span-3">
            <label htmlFor={`${id}-formSkillsInput`} className="block text-base font-semibold text-gray-700 mb-1">
              {t('labelTradeSkills')}
            </label>
            <input
              id={`${id}-formSkillsInput`}
              type="text"
              value={formData.formSkillsInput}
              onChange={(e) => updateField('formSkillsInput', e.target.value)}
              className="min-h-12 w-full px-3 py-2 text-base rounded-xl border border-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            />
          </div>

          <div className="sm:col-span-3">
            <label htmlFor={`${id}-formBio`} className="block text-base font-semibold text-gray-700 mb-1">
              {t('secBio')}
            </label>
            <textarea
              id={`${id}-formBio`}
              rows={3}
              value={formData.formBio}
              onChange={(e) => updateField('formBio', e.target.value)}
              className="min-h-12 w-full px-3 py-2 text-base rounded-xl border border-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2">
          {t('labelRelocate')}
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor={`${id}-formLocationsInput`} className="block text-base font-semibold text-gray-700 mb-1">
              {t('labelPreferredLocations')}
            </label>
            <input
              id={`${id}-formLocationsInput`}
              type="text"
              value={formData.formLocationsInput}
              onChange={(e) => updateField('formLocationsInput', e.target.value)}
              className="min-h-12 w-full px-3 py-2 text-base rounded-xl border border-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            />
          </div>

          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="relocate-checkbox"
              checked={formData.formWillingToRelocate}
              onChange={(e) => updateField('formWillingToRelocate', e.target.checked)}
              className="rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
            />
            <label htmlFor="relocate-checkbox" className="text-xs font-semibold text-gray-700 cursor-pointer">
              {t('labelRelocateCheckbox')}
            </label>
          </div>
        </div>
      </div>
    </>
  );
}
