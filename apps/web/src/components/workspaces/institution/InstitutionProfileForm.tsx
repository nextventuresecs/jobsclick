'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@indian-job-portal/ui';
import type { InstitutionProfileData } from '../../../data/sampleWorkspaces';
import { Save } from 'lucide-react';
import { InstitutionGovernanceFields } from './InstitutionGovernanceFields';

export interface InstitutionEditFormData {
  formInstName: string;
  setFormInstName: (val: string) => void;
  formInstType: InstitutionProfileData['institutionType'];
  setFormInstType: (val: InstitutionProfileData['institutionType']) => void;
  formAffiliation: string;
  setFormAffiliation: (val: string) => void;
  formAffiliationCode: string;
  setFormAffiliationCode: (val: string) => void;
  formEstablishmentYear: number;
  setFormEstablishmentYear: (val: number) => void;
  formPrincipalName: string;
  setFormPrincipalName: (val: string) => void;
  formContactPerson: string;
  setFormContactPerson: (val: string) => void;
  formContactDesignation: string;
  setFormContactDesignation: (val: string) => void;
  formContactEmail: string;
  setFormContactEmail: (val: string) => void;
  formContactPhone: string;
  setFormContactPhone: (val: string) => void;
  formWebsite: string;
  setFormWebsite: (val: string) => void;
  formAddress: string;
  setFormAddress: (val: string) => void;
  formCity: string;
  setFormCity: (val: string) => void;
  formDistrict: string;
  setFormDistrict: (val: string) => void;
  formState: string;
  setFormState: (val: string) => void;
  formPincode: string;
  setFormPincode: (val: string) => void;
  formTradesInput: string;
  setFormTradesInput: (val: string) => void;
  formAnnualCapacity: number;
  setFormAnnualCapacity: (val: number) => void;
  formBrochureUrl: string;
  setFormBrochureUrl: (val: string) => void;
  formAbout: string;
  setFormAbout: (val: string) => void;
}

interface InstitutionProfileFormProps {
  readonly formData: InstitutionEditFormData;
  readonly onSubmit: (e: React.FormEvent) => void;
  readonly onCancel: () => void;
}

export function InstitutionProfileForm({ formData: d, onSubmit, onCancel }: InstitutionProfileFormProps) {
  const t = useTranslations('InstitutionWorkspace');

  return (
    <form onSubmit={onSubmit} className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-xs space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
        <div>
          <h2 className="text-base font-bold text-gray-900">{t('profileHeading')}</h2>
          <p className="text-xs text-gray-500">{t('profileSubheading')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 rounded-lg border border-gray-300">
            {t('cancel')}
          </button>
          <Button type="submit" variant="primary" size="sm" className="inline-flex items-center gap-1.5">
            <Save className="w-4 h-4" />
            <span>{t('saveInstituteProfile')}</span>
          </Button>
        </div>
      </div>

      <InstitutionGovernanceFields formData={d} />

      {/* TPO */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 border-b border-gray-100 pb-2">
          2. Training & Placement Officer (TPO)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelContactPerson')} *</label>
            <input type="text" value={d.formContactPerson} onChange={(e) => d.setFormContactPerson(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelContactDesignation')} *</label>
            <input type="text" value={d.formContactDesignation} onChange={(e) => d.setFormContactDesignation(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelContactEmail')}</label>
            <input type="email" value={d.formContactEmail} onChange={(e) => d.setFormContactEmail(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelContactPhone')} *</label>
            <input type="tel" value={d.formContactPhone} onChange={(e) => d.setFormContactPhone(e.target.value)} className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Official Website</label>
            <input type="url" value={d.formWebsite} onChange={(e) => d.setFormWebsite(e.target.value)} placeholder="https://iti-ujjain.edu.in" className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Placement Brochure URL</label>
            <input type="url" value={d.formBrochureUrl} onChange={(e) => d.setFormBrochureUrl(e.target.value)} placeholder="https://iti.edu/brochure.pdf" className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden" />
          </div>
        </div>
      </div>

      {/* Location & Trades */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 border-b border-gray-100 pb-2">
          3. Campus Location & Trades
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-700 mb-1">Campus Address *</label>
            <input type="text" value={d.formAddress} onChange={(e) => d.setFormAddress(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">City *</label>
            <input type="text" value={d.formCity} onChange={(e) => d.setFormCity(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">District</label>
            <input type="text" value={d.formDistrict} onChange={(e) => d.setFormDistrict(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">State</label>
            <input type="text" value={d.formState} onChange={(e) => d.setFormState(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">PIN Code</label>
            <input type="text" maxLength={6} value={d.formPincode} onChange={(e) => d.setFormPincode(e.target.value)} className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelTradesOffered')}</label>
            <input type="text" value={d.formTradesInput} onChange={(e) => d.setFormTradesInput(e.target.value)} placeholder="CNC Machinist, Fitter, Welder" className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelAnnualCapacity')}</label>
            <input type="number" value={d.formAnnualCapacity} onChange={(e) => d.setFormAnnualCapacity(Number(e.target.value))} className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden" />
          </div>
          <div className="sm:col-span-4">
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelAbout')}</label>
            <textarea rows={3} value={d.formAbout} onChange={(e) => d.setFormAbout(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden" />
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-gray-200 flex items-center justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2.5 rounded-xl border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50">
          {t('cancel')}
        </button>
        <Button type="submit" variant="primary" size="md" className="inline-flex items-center gap-1.5 font-semibold">
          <Save className="w-4 h-4" />
          <span>{t('saveInstituteProfile')}</span>
        </Button>
      </div>
    </form>
  );
}
