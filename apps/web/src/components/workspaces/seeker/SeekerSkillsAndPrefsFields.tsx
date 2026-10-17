'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { SeekerFormData } from './seekerFormTypes';

interface SeekerSkillsAndPrefsFieldsProps {
  formData: SeekerFormData;
  updateField: <K extends keyof SeekerFormData>(key: K, value: SeekerFormData[K]) => void;
}

export function SeekerSkillsAndPrefsFields({ formData, updateField }: SeekerSkillsAndPrefsFieldsProps) {
  const t = useTranslations('SeekerWorkspace');

  return (
    <>
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2">
          {t('secSkills')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              {t('labelExpYears')}
            </label>
            <input
              type="number"
              step="0.5"
              value={formData.formExperienceYears}
              onChange={(e) => updateField('formExperienceYears', Number(e.target.value))}
              placeholder="1.5"
              className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelCurrentRole')}</label>
            <input
              type="text"
              value={formData.formCurrentRole}
              onChange={(e) => updateField('formCurrentRole', e.target.value)}
              placeholder="Junior CNC Machinist"
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelLanguages')}</label>
            <input
              type="text"
              value={formData.formLanguagesInput}
              onChange={(e) => updateField('formLanguagesInput', e.target.value)}
              placeholder="Hindi, English, Marathi"
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              {t('labelTradeSkills')}
            </label>
            <input
              type="text"
              value={formData.formSkillsInput}
              onChange={(e) => updateField('formSkillsInput', e.target.value)}
              placeholder="CNC Milling, VMC Operating, Blueprint Reading, Vernier Inspection, 5S Workplace Safety"
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              {t('secBio')}
            </label>
            <textarea
              rows={3}
              value={formData.formBio}
              onChange={(e) => updateField('formBio', e.target.value)}
              placeholder="Skilled precision machinist with hands-on industrial training in CNC setup, component gauging, and lean production..."
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2">
          {t('labelRelocate')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              {t('labelPreferredLocations')}
            </label>
            <input
              type="text"
              value={formData.formLocationsInput}
              onChange={(e) => updateField('formLocationsInput', e.target.value)}
              placeholder="Pune, Bengaluru, Delhi NCR, Ahmedabad"
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
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
