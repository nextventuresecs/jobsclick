'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@indian-job-portal/ui';
import type { CompanyItem } from '../../../data/sampleCompanies';
import { Edit3, CheckCircle2, Award } from 'lucide-react';

interface CompanyProfileCardProps {
  readonly company: CompanyItem;
  readonly onEdit: () => void;
}

export function CompanyProfileCard({ company, onEdit }: CompanyProfileCardProps) {
  const t = useTranslations('EmployerWorkspace');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">{t('profileHeading')}</h2>
          <p className="text-xs text-gray-500">{t('profileSubheading')}</p>
        </div>
        <Button type="button" variant="primary" size="sm" onClick={onEdit} className="inline-flex items-center gap-1.5">
          <Edit3 className="w-4 h-4" />
          <span>{t('editProfile')}</span>
        </Button>
      </div>

      {/* 1. Basic Info & Leadership Card */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange border-b border-gray-100 pb-2">
          1. Organization & Leadership Identity
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div><span className="text-gray-500">{t('labelCompanyName')}</span><p className="font-bold text-gray-900 mt-0.5 text-sm">{company.name}</p></div>
          <div><span className="text-gray-500">{t('labelOwnershipType')}</span><p className="font-bold text-gray-900 mt-0.5">{company.ownershipType}</p></div>
          <div><span className="text-gray-500">{t('labelSector')}</span><p className="font-bold text-gray-900 mt-0.5">{company.sector}</p></div>
          <div><span className="text-gray-500">Founder / Director</span><p className="font-bold text-gray-900 mt-0.5">{company.founderOrDirector || '—'}</p></div>
          <div><span className="text-gray-500">Designation</span><p className="font-bold text-gray-900 mt-0.5">{company.designation || 'Director'}</p></div>
          <div><span className="text-gray-500">{t('labelEnterpriseSize')}</span><p className="font-bold text-gray-900 mt-0.5">{company.enterpriseSize} {t('enterprise')}</p></div>
          <div><span className="text-gray-500">Year of Registration</span><p className="font-mono text-gray-900 mt-0.5">{company.yearOfRegistration || '—'}</p></div>
          <div><span className="text-gray-500">Commencement of Business</span><p className="font-mono text-gray-900 mt-0.5">{company.commencementYear || '—'}</p></div>
          <div>
            <span className="text-gray-500">Official Website</span>
            <p className="mt-0.5">
              {company.website ? (
                <a href={company.website.startsWith('http') ? company.website : `https://${company.website}`} target="_blank" rel="noreferrer" className="text-brand-orange hover:underline font-medium">
                  {company.website}
                </a>
              ) : <span className="text-gray-400">—</span>}
            </p>
          </div>
        </div>
      </div>

      {/* 2. Contact & Premise Location Card */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange border-b border-gray-100 pb-2">
          2. Operating Premise & Contact Channels
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="sm:col-span-2"><span className="text-gray-500">{t('labelPlantLocation')}</span><p className="font-medium text-gray-900 mt-0.5">{company.address}</p></div>
          <div><span className="text-gray-500">{t('labelJobCity')} / {t('labelJobDistrict')}</span><p className="font-medium text-gray-900 mt-0.5">{company.city}, {company.district}, {company.state}</p></div>
          <div><span className="text-gray-500">{t('contactMobile')}</span><p className="font-mono text-gray-900 mt-0.5 font-bold">+91 {company.phone || '9876543210'}</p></div>
          <div><span className="text-gray-500">{t('emailAddress')}</span><p className="font-medium text-gray-900 mt-0.5">{company.email || '—'}</p></div>
        </div>
      </div>

      {/* 3. Know My Business & Offerings */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange border-b border-gray-100 pb-2">
          3. Business Profile & What We Offer
        </h3>
        <div className="space-y-3 text-xs">
          <div>
            <span className="text-gray-500 font-semibold">Know My Business (Overview)</span>
            <p className="text-gray-800 leading-relaxed mt-1 bg-gray-50 p-3 rounded-xl border border-gray-100">
              {company.knowMyBusiness || company.description}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div><span className="text-gray-500 font-semibold">Products</span><p className="text-gray-800 mt-1 bg-gray-50 p-3 rounded-xl border border-gray-100">{company.productsBrief || '—'}</p></div>
            <div><span className="text-gray-500 font-semibold">Services</span><p className="text-gray-800 mt-1 bg-gray-50 p-3 rounded-xl border border-gray-100">{company.servicesBrief || '—'}</p></div>
          </div>
        </div>
      </div>

      {/* 4. Registrations & Social Media */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange border-b border-gray-100 pb-2">4. Government Registrations</h3>
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
              <div><span className="font-bold text-emerald-950">{t('labelUdyamNumber')}</span><p className="font-mono text-emerald-800 mt-0.5">{company.udyamNumber || '—'}</p></div>
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex items-center justify-between p-3 bg-blue-50/60 rounded-xl border border-blue-100">
              <div><span className="font-bold text-blue-950">{t('labelDpiitNumber')}</span><p className="font-mono text-blue-800 mt-0.5">{company.dpiitNumber || '—'}</p></div>
              <Award className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange border-b border-gray-100 pb-2">5. Social Media Presence</h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-gray-50"><span className="text-gray-500">Instagram</span><span className="font-mono text-gray-800 truncate max-w-[200px]">{company.socialMedia?.instagram || '—'}</span></div>
            <div className="flex items-center justify-between py-1.5 border-b border-gray-50"><span className="text-gray-500">Facebook</span><span className="font-mono text-gray-800 truncate max-w-[200px]">{company.socialMedia?.facebook || '—'}</span></div>
            <div className="flex items-center justify-between py-1.5 border-b border-gray-50"><span className="text-gray-500">YouTube</span><span className="font-mono text-gray-800 truncate max-w-[200px]">{company.socialMedia?.youtube || '—'}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
