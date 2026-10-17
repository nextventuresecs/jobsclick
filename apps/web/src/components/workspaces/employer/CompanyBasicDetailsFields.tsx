'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { CompanyEditFormData } from './CompanyProfileForm';
import type { CompanyItem } from '../../../data/sampleCompanies';

interface CompanyBasicDetailsFieldsProps {
  readonly formData: CompanyEditFormData;
}

export function CompanyBasicDetailsFields({ formData: d }: CompanyBasicDetailsFieldsProps) {
  const t = useTranslations('EmployerWorkspace');

  return (
    <>
      {/* Section 1: Organization Details */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange">1. Organization Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelCompanyName')} *</label>
            <input type="text" value={d.formOrgName} onChange={(e) => d.setFormOrgName(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelOwnershipType')} *</label>
            <select value={d.formOwnership} onChange={(e) => d.setFormOwnership(e.target.value as CompanyItem['ownershipType'])} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden bg-white" required>
              <option value="Proprietorship">Proprietor / Proprietorship</option>
              <option value="Private Limited">Private Limited</option>
              <option value="LLP">Limited Liability Partnership (LLP)</option>
              <option value="Partnership">Partnership</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelSector')} *</label>
            <input type="text" value={d.formSector} onChange={(e) => d.setFormSector(e.target.value)} placeholder="e.g. Manufacturing, Consultancy" className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Year of Registration *</label>
            <input type="text" value={d.formYearReg} onChange={(e) => d.setFormYearReg(e.target.value)} className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Commencement of Business *</label>
            <input type="text" value={d.formCommenceYear} onChange={(e) => d.setFormCommenceYear(e.target.value)} className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Official Website (Optional)</label>
            <input type="text" value={d.formWebsite} onChange={(e) => d.setFormWebsite(e.target.value)} placeholder="www.company.in" className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden" />
          </div>
        </div>
      </div>

      {/* Section 2: Leadership & Direct Contact */}
      <div className="space-y-4 pt-4 border-t border-gray-100">
        <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange">2. Founder / Leadership & Contact</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Founder / Director Name *</label>
            <input type="text" value={d.formFounder} onChange={(e) => d.setFormFounder(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Designation *</label>
            <input type="text" value={d.formDesignation} onChange={(e) => d.setFormDesignation(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Director Photo URL (Optional)</label>
            <input type="text" value={d.formDirectorPhoto} onChange={(e) => d.setFormDirectorPhoto(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('contactMobile')} *</label>
            <div className="flex rounded-xl border border-gray-300 shadow-2xs overflow-hidden focus-within:ring-2 focus-within:ring-brand-orange">
              <span className="inline-flex items-center px-3 bg-gray-50 border-r border-gray-300 text-gray-600 text-xs font-semibold">+91</span>
              <input type="tel" maxLength={10} value={d.formPhone} onChange={(e) => d.setFormPhone(e.target.value)} className="w-full px-3 py-2 text-sm font-mono focus:outline-hidden" required />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('emailAddress')} (Optional)</label>
            <input type="email" value={d.formEmail} onChange={(e) => d.setFormEmail(e.target.value)} placeholder="contact@company.in" className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden" />
          </div>
        </div>
      </div>

      {/* Section 3: Business Offerings */}
      <div className="space-y-4 pt-4 border-t border-gray-100">
        <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange">3. Business Profile & Offerings</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Know My Business (Brief Description) (Optional)</label>
            <textarea rows={3} value={d.formKnowMyBusiness} onChange={(e) => d.setFormKnowMyBusiness(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Products (Brief Only) (Optional)</label>
              <input type="text" value={d.formProductsBrief} onChange={(e) => d.setFormProductsBrief(e.target.value)} placeholder="e.g. Precision CNC Machined Gears" className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Services (Brief Only) (Optional)</label>
              <input type="text" value={d.formServicesBrief} onChange={(e) => d.setFormServicesBrief(e.target.value)} placeholder="e.g. VMC Milling, CMM Inspection" className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden" />
            </div>
          </div>
        </div>
      </div>

      {/* Section 4: Physical Location & Scale */}
      <div className="space-y-4 pt-4 border-t border-gray-100">
        <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange">4. Physical Location & Scale</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelPlantLocation')} *</label>
            <input type="text" value={d.formAddress} onChange={(e) => d.setFormAddress(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelJobCity')} *</label>
            <input type="text" value={d.formCity} onChange={(e) => d.setFormCity(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelJobDistrict')} *</label>
            <input type="text" value={d.formDistrict} onChange={(e) => d.setFormDistrict(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">State *</label>
            <input type="text" value={d.formState} onChange={(e) => d.setFormState(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelEnterpriseSize')} *</label>
            <select value={d.formCompanySize} onChange={(e) => d.setFormCompanySize(e.target.value as CompanyItem['enterpriseSize'])} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden bg-white" required>
              <option value="Micro">Micro {t('enterprise')}</option>
              <option value="Small">Small {t('enterprise')}</option>
              <option value="Medium">Medium {t('enterprise')}</option>
            </select>
          </div>
        </div>
      </div>
    </>
  );
}
