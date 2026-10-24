'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { InstitutionProfileData } from '../../../data/sampleWorkspaces';
import type { InstitutionEditFormData } from './InstitutionProfileForm';

export function InstitutionGovernanceFields({ formData: d }: { readonly formData: InstitutionEditFormData }) {
  const t = useTranslations('InstitutionWorkspace');

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 border-b border-gray-100 pb-2">
        1. Institutional Identity & Governance
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelInstName')} *</label>
          <input type="text" value={d.formInstName} onChange={(e) => d.setFormInstName(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden" required />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelInstType')} *</label>
          <select value={d.formInstType} onChange={(e) => d.setFormInstType(e.target.value as InstitutionProfileData['institutionType'])} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden bg-white" required>
            <option value="iti">ITI</option>
            <option value="polytechnic">Polytechnic / Diploma</option>
            <option value="engineering">Engineering College</option>
            <option value="vocational_training">Vocational Training Partner</option>
            <option value="degree_college">Degree College</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelAffiliation')} *</label>
          <input type="text" value={d.formAffiliation} onChange={(e) => d.setFormAffiliation(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden" required />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelAffiliationCode')}</label>
          <input type="text" value={d.formAffiliationCode} onChange={(e) => d.setFormAffiliationCode(e.target.value)} className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelEstYear')} *</label>
          <input type="number" value={d.formEstablishmentYear} onChange={(e) => d.setFormEstablishmentYear(Number(e.target.value))} className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden" required />
        </div>
        <div className="sm:col-span-3">
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelPrincipal')}</label>
          <input type="text" value={d.formPrincipalName} onChange={(e) => d.setFormPrincipalName(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden" />
        </div>
      </div>
    </div>
  );
}
