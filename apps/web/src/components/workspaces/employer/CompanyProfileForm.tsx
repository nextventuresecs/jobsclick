'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@indian-job-portal/ui';
import type { CompanyItem } from '../../../data/sampleCompanies';
import { Save } from 'lucide-react';
import { CompanyBasicDetailsFields } from './CompanyBasicDetailsFields';
import { CompanyGovAndSocialFields } from './CompanyGovAndSocialFields';

export interface CompanyEditFormData {
  formOrgName: string;
  setFormOrgName: (val: string) => void;
  formOwnership: CompanyItem['ownershipType'];
  setFormOwnership: (val: CompanyItem['ownershipType']) => void;
  formPhone: string;
  setFormPhone: (val: string) => void;
  formEmail: string;
  setFormEmail: (val: string) => void;
  formWebsite: string;
  setFormWebsite: (val: string) => void;
  formSector: string;
  setFormSector: (val: string) => void;
  formYearReg: string;
  setFormYearReg: (val: string) => void;
  formCommenceYear: string;
  setFormCommenceYear: (val: string) => void;
  formFounder: string;
  setFormFounder: (val: string) => void;
  formDesignation: string;
  setFormDesignation: (val: string) => void;
  formDirectorPhoto: string;
  setFormDirectorPhoto: (val: string) => void;
  formKnowMyBusiness: string;
  setFormKnowMyBusiness: (val: string) => void;
  formProductsBrief: string;
  setFormProductsBrief: (val: string) => void;
  formServicesBrief: string;
  setFormServicesBrief: (val: string) => void;
  formAddress: string;
  setFormAddress: (val: string) => void;
  formCity: string;
  setFormCity: (val: string) => void;
  formDistrict: string;
  setFormDistrict: (val: string) => void;
  formState: string;
  setFormState: (val: string) => void;
  formCompanySize: CompanyItem['enterpriseSize'];
  setFormCompanySize: (val: CompanyItem['enterpriseSize']) => void;
  formIsMsme: boolean;
  setFormIsMsme: (val: boolean) => void;
  formUdyamNumber: string;
  setFormUdyamNumber: (val: string) => void;
  formIsDpiit: boolean;
  setFormIsDpiit: (val: boolean) => void;
  formDpiitNumber: string;
  setFormDpiitNumber: (val: string) => void;
  formInstagram: string;
  setFormInstagram: (val: string) => void;
  formFacebook: string;
  setFormFacebook: (val: string) => void;
  formYoutube: string;
  setFormYoutube: (val: string) => void;
  formOtherSocial: string;
  setFormOtherSocial: (val: string) => void;
}

interface CompanyProfileFormProps {
  readonly formData: CompanyEditFormData;
  readonly onSubmit: (e: React.FormEvent) => void;
  readonly onCancel: () => void;
}

export function CompanyProfileForm({ formData: d, onSubmit, onCancel }: CompanyProfileFormProps) {
  const t = useTranslations('EmployerWorkspace');

  return (
    <form onSubmit={onSubmit} className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-xs space-y-8 animate-in fade-in">
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{t('profileHeading')}</h2>
          <p className="text-xs text-gray-500">{t('profileSubheading')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50">
            {t('cancel')}
          </button>
          <Button type="submit" variant="primary" size="sm" className="inline-flex items-center gap-1.5">
            <Save className="w-4 h-4" />
            <span>{t('saveBusinessProfile')}</span>
          </Button>
        </div>
      </div>

      {/* Sections 1, 2, 3, 4 */}
      <CompanyBasicDetailsFields formData={d} />

      {/* Sections 5 & 6 */}
      <CompanyGovAndSocialFields formData={d} />

      {/* Bottom Actions */}
      <div className="pt-4 border-t border-gray-200 flex items-center justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2.5 rounded-xl border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50">
          {t('cancel')}
        </button>
        <Button type="submit" variant="primary" size="md" className="inline-flex items-center gap-1.5 font-semibold">
          <Save className="w-4 h-4" />
          <span>{t('saveBusinessProfile')}</span>
        </Button>
      </div>
    </form>
  );
}
