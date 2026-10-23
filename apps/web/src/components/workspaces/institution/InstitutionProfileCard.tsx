'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@indian-job-portal/ui';
import type { InstitutionProfileData } from '../../../data/sampleWorkspaces';
import {
  Award,
  Briefcase,
  MapPin,
  BookOpen,
  Edit3,
  ExternalLink,
  Download,
} from 'lucide-react';

interface InstitutionProfileCardProps {
  readonly institution: InstitutionProfileData;
  readonly onEdit: () => void;
}

export function InstitutionProfileCard({ institution, onEdit }: InstitutionProfileCardProps) {
  const t = useTranslations('InstitutionWorkspace');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">{t('profileHeading')}</h2>
          <p className="text-xs text-gray-500">{t('profileSubheading')}</p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5"
        >
          <Edit3 className="w-4 h-4" />
          <span>{t('editProfile')}</span>
        </Button>
      </div>

      {/* 1. Identity & Accreditation Card */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 border-b border-gray-100 pb-2 flex items-center gap-1.5">
          <Award className="w-4 h-4 text-teal-600" />
          <span>1. Institutional Identity & Affiliation</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-gray-500">{t('labelInstName')}</span>
            <p className="font-bold text-gray-900 mt-0.5 text-sm">{institution.institutionName}</p>
          </div>
          <div>
            <span className="text-gray-500">{t('labelInstType')}</span>
            <p className="font-bold text-gray-900 mt-0.5 uppercase tracking-wide">{institution.institutionType}</p>
          </div>
          <div>
            <span className="text-gray-500">{t('labelAffiliation')}</span>
            <p className="font-bold text-teal-700 mt-0.5">{institution.affiliation}</p>
          </div>
          <div>
            <span className="text-gray-500">{t('labelAffiliationCode')}</span>
            <p className="font-mono font-bold text-gray-900 mt-0.5">{institution.affiliationCode}</p>
          </div>
          <div>
            <span className="text-gray-500">{t('labelEstYear')}</span>
            <p className="font-mono text-gray-900 mt-0.5">{institution.establishmentYear}</p>
          </div>
          <div>
            <span className="text-gray-500">{t('labelPrincipal')}</span>
            <p className="font-bold text-gray-900 mt-0.5">{institution.principalName || '—'}</p>
          </div>
        </div>
      </div>

      {/* 2. Training & Placement Cell Card */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 border-b border-gray-100 pb-2 flex items-center gap-1.5">
          <Briefcase className="w-4 h-4 text-teal-600" />
          <span>2. Training & Placement Cell (TPO)</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-gray-500">{t('labelContactPerson')}</span>
            <p className="font-bold text-gray-900 mt-0.5 text-sm">{institution.contactPerson}</p>
          </div>
          <div>
            <span className="text-gray-500">{t('labelContactDesignation')}</span>
            <p className="font-bold text-gray-900 mt-0.5">{institution.contactDesignation}</p>
          </div>
          <div>
            <span className="text-gray-500">{t('labelContactEmail')}</span>
            <p className="font-mono text-gray-900 mt-0.5">{institution.contactEmail}</p>
          </div>
          <div>
            <span className="text-gray-500">{t('labelContactPhone')}</span>
            <p className="font-mono text-gray-900 mt-0.5">{institution.contactPhone}</p>
          </div>
          <div>
            <span className="text-gray-500">Official Website</span>
            <p className="mt-0.5">
              {institution.website ? (
                <a
                  href={institution.website.startsWith('http') ? institution.website : `https://${institution.website}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-teal-700 hover:underline font-medium inline-flex items-center gap-1"
                >
                  <span>{institution.website}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </p>
          </div>
          <div>
            <span className="text-gray-500">Placement Brochure</span>
            <p className="mt-0.5">
              {institution.placementBrochureUrl ? (
                <a
                  href={institution.placementBrochureUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-teal-700 hover:underline font-medium inline-flex items-center gap-1"
                >
                  <span>Download Placement Brochure</span>
                  <Download className="w-3 h-3" />
                </a>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* 3. Campus Location & Infrastructure */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 border-b border-gray-100 pb-2 flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-teal-600" />
          <span>3. Campus Location & Capacity</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
          <div className="sm:col-span-2">
            <span className="text-gray-500">Campus Address</span>
            <p className="font-bold text-gray-900 mt-0.5">{institution.address}</p>
          </div>
          <div>
            <span className="text-gray-500">City & District</span>
            <p className="font-bold text-gray-900 mt-0.5">{institution.city}, {institution.district}</p>
          </div>
          <div>
            <span className="text-gray-500">State & Pincode</span>
            <p className="font-bold text-gray-900 mt-0.5">{institution.state} - {institution.pincode}</p>
          </div>
          <div>
            <span className="text-gray-500">{t('labelAnnualCapacity')}</span>
            <p className="font-bold text-gray-900 mt-0.5">{institution.annualCapacity} {t('studentsPerYr')}</p>
          </div>
        </div>
      </div>

      {/* 4. Vocational Trades & Specializations */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 border-b border-gray-100 pb-2 flex items-center gap-1.5">
          <BookOpen className="w-4 h-4 text-teal-600" />
          <span>{t('labelTradesOffered')}</span>
        </h3>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {institution.tradesOffered.map((trade, idx) => (
              <span
                key={idx}
                className="px-3 py-1 rounded-lg text-xs font-semibold bg-teal-50 text-teal-900 border border-teal-200"
              >
                {trade}
              </span>
            ))}
          </div>

          <div className="pt-2 text-xs">
            <span className="text-gray-500 font-semibold">{t('labelAbout')}:</span>
            <p className="text-gray-700 mt-1 leading-relaxed">{institution.about}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
