'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { SeekerFormData } from './seekerFormTypes';
import type { SeekerProfileData } from '../../../data/sampleWorkspaces';

interface SeekerDemographicsFieldsProps {
  formData: SeekerFormData;
  updateField: <K extends keyof SeekerFormData>(key: K, value: SeekerFormData[K]) => void;
}

export function SeekerDemographicsFields({ formData, updateField }: SeekerDemographicsFieldsProps) {
  const t = useTranslations('SeekerWorkspace');

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2">
        {t('secPersonalInfo')}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            {t('labelFullName')} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.formName}
            onChange={(e) => updateField('formName', e.target.value)}
            placeholder="e.g. Rahul Sharma"
            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelGender')}</label>
          <select
            value={formData.formGender}
            onChange={(e) => updateField('formGender', e.target.value as SeekerProfileData['gender'])}
            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden bg-white"
          >
            <option value="Male">{t('genderMale')}</option>
            <option value="Female">{t('genderFemale')}</option>
            <option value="Other">{t('genderOther')}</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelDob')}</label>
          <input
            type="date"
            value={formData.formDob}
            onChange={(e) => updateField('formDob', e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelCandidateType')}</label>
          <select
            value={formData.formSeekerType}
            onChange={(e) => updateField('formSeekerType', e.target.value as SeekerProfileData['seekerType'])}
            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden bg-white"
          >
            <option value="student">{t('typeStudent')}</option>
            <option value="individual">{t('typeIndividual')}</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelPermanentAddress')}</label>
          <input
            type="text"
            value={formData.formAddress}
            onChange={(e) => updateField('formAddress', e.target.value)}
            placeholder="Plot 42, MIDC Industrial Area"
            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            {t('labelCity')} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.formCity}
            onChange={(e) => updateField('formCity', e.target.value)}
            placeholder="Pune"
            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelDistrict')}</label>
          <input
            type="text"
            value={formData.formDistrict}
            onChange={(e) => updateField('formDistrict', e.target.value)}
            placeholder="Pune"
            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelState')}</label>
          <input
            type="text"
            value={formData.formState}
            onChange={(e) => updateField('formState', e.target.value)}
            placeholder="Maharashtra"
            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelPincode')}</label>
          <input
            type="text"
            maxLength={6}
            value={formData.formPincode}
            onChange={(e) => updateField('formPincode', e.target.value)}
            placeholder="411026"
            className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
          />
        </div>
      </div>
    </div>
  );
}
