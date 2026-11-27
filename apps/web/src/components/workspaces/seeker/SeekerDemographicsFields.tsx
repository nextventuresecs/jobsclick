'use client';

import React, { useId } from 'react';
import { useTranslations } from 'next-intl';
import type { SeekerFormData } from './seekerFormTypes';
import type { SeekerProfileData } from '../../../data/sampleWorkspaces';
import { StateDistrictPicker } from '../../common/StateDistrictPicker';

interface SeekerDemographicsFieldsProps {
  formData: SeekerFormData;
  updateField: <K extends keyof SeekerFormData>(key: K, value: SeekerFormData[K]) => void;
}

export function SeekerDemographicsFields({ formData, updateField }: SeekerDemographicsFieldsProps) {
  const t = useTranslations('SeekerWorkspace');
  const id = useId();

  return (
    <div className="space-y-4">
      <h4 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2">
        {t('secPersonalInfo')}
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor={`${id}-formName`} className="block text-base font-semibold text-gray-700 mb-1">
            {t('labelFullName')} <span className="text-red-500">*</span>
          </label>
          <input
            id={`${id}-formName`}
            autoComplete="name"
            type="text"
            value={formData.formName}
            onChange={(e) => updateField('formName', e.target.value)}
            className="min-h-12 w-full px-3 py-2 text-base rounded-xl border border-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            required
          />
        </div>

        <div>
          <label htmlFor={`${id}-formGender`} className="block text-base font-semibold text-gray-700 mb-1">{t('labelGender')}</label>
          <select
            id={`${id}-formGender`}
            value={formData.formGender}
            onChange={(e) => updateField('formGender', e.target.value as SeekerProfileData['gender'])}
            className="min-h-12 w-full px-3 py-2 text-base rounded-xl border border-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 bg-white"
          >
            <option value="Male">{t('genderMale')}</option>
            <option value="Female">{t('genderFemale')}</option>
            <option value="Other">{t('genderOther')}</option>
          </select>
        </div>

        <div>
          <label htmlFor={`${id}-formDob`} className="block text-base font-semibold text-gray-700 mb-1">{t('labelDob')}</label>
          <input
            id={`${id}-formDob`}
            autoComplete="bday"
            type="date"
            value={formData.formDob}
            onChange={(e) => updateField('formDob', e.target.value)}
            className="min-h-12 w-full px-3 py-2 text-base rounded-xl border border-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
          />
        </div>

        <div>
          <label htmlFor={`${id}-formSeekerType`} className="block text-base font-semibold text-gray-700 mb-1">{t('labelCandidateType')}</label>
          <select
            id={`${id}-formSeekerType`}
            value={formData.formSeekerType}
            onChange={(e) => updateField('formSeekerType', e.target.value as SeekerProfileData['seekerType'])}
            className="min-h-12 w-full px-3 py-2 text-base rounded-xl border border-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 bg-white"
          >
            <option value="student">{t('typeStudent')}</option>
            <option value="individual">{t('typeIndividual')}</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={`${id}-formAddress`} className="block text-base font-semibold text-gray-700 mb-1">{t('labelPermanentAddress')}</label>
          <input
            id={`${id}-formAddress`}
            autoComplete="street-address"
            type="text"
            value={formData.formAddress}
            onChange={(e) => updateField('formAddress', e.target.value)}
            className="min-h-12 w-full px-3 py-2 text-base rounded-xl border border-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
          />
        </div>

        <div>
          <label htmlFor={`${id}-formCity`} className="block text-base font-semibold text-gray-700 mb-1">
            {t('labelCity')} <span className="text-red-500">*</span>
          </label>
          <input
            id={`${id}-formCity`}
            autoComplete="address-level2"
            type="text"
            value={formData.formCity}
            onChange={(e) => updateField('formCity', e.target.value)}
            className="min-h-12 w-full px-3 py-2 text-base rounded-xl border border-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            required
          />
        </div>

        <div className="sm:col-span-3">
          <StateDistrictPicker
            stateCode={formData.formStateCode}
            districtId={formData.formDistrictId}
            stateName={formData.formState}
            districtName={formData.formDistrict}
            pincode={formData.formPincode}
            showPincode
            onChange={(loc) => {
              updateField('formStateCode', loc.stateCode);
              updateField('formDistrictId', loc.districtId);
              updateField('formState', loc.stateName);
              updateField('formDistrict', loc.districtName);
              if (loc.pincode !== undefined) {
                updateField('formPincode', loc.pincode);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
