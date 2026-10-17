'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button, JobsClickLogo } from '@indian-job-portal/ui';
import type { SeekerProfileData } from '../../../data/sampleWorkspaces';
import { ShieldCheck, GraduationCap, Printer } from 'lucide-react';

interface SeekerDigitalCvPreviewProps {
  readonly profile: SeekerProfileData;
  readonly onPrint: () => void;
}

export function SeekerDigitalCvPreview({ profile, onPrint }: SeekerDigitalCvPreviewProps) {
  const t = useTranslations('SeekerWorkspace');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-2xs">
        <div>
          <h2 className="text-sm font-bold text-gray-900">{t('cvHeading')}</h2>
          <p className="text-xs text-gray-500">
            {t('statPrivacyStatusDesc')}
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onPrint}
          className="inline-flex items-center gap-1.5"
        >
          <Printer className="w-4 h-4" />
          <span>{t('printResume')}</span>
        </Button>
      </div>

      {/* Printable CV sheet */}
      <div
        id="candidate-cv-sheet"
        className="bg-white p-8 sm:p-12 rounded-2xl border border-gray-300 shadow-lg max-w-4xl mx-auto space-y-6 print:border-none print:shadow-none print:p-0"
      >
        {/* CV Header */}
        <div className="flex items-start justify-between border-b-2 border-orange-500 pb-6">
          <div>
            <JobsClickLogo variant="full" size="md" />
            <h2 className="text-2xl font-bold text-gray-900 mt-4">{profile.name}</h2>
            <p className="text-sm font-semibold text-gray-600 mt-0.5">
              {profile.qualification} • {profile.city}, {profile.state}
            </p>
            {profile.enrolledViaInstitution && (
              <p className="text-xs text-teal-700 font-medium mt-1 flex items-center gap-1">
                <GraduationCap className="w-3.5 h-3.5" />
                <span>{t('enrolledVia')} {profile.enrolledViaInstitution}</span>
              </p>
            )}
          </div>
          <div className="text-right">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>{t('verifiedCandidate')}</span>
            </span>
            <p className="text-[11px] text-gray-400 font-mono mt-2">{t('candidateRef')} {profile.id}</p>
            {profile.aadhaarLastFour && (
              <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                {t('labelAadhaarLastFour')}: •••• •••• {profile.aadhaarLastFour} ({t('verified')})
              </p>
            )}
          </div>
        </div>

        {/* Privacy notice banner */}
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 flex items-center justify-between">
          <span className="font-semibold text-gray-800">
            {t('hardInvariant1Notice')}:
          </span>
          <span>{t('statPrivacyStatusDesc')}</span>
        </div>

        {/* Profile summary */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">
            {t('secBio')}
          </h3>
          <p className="text-sm text-gray-700 leading-relaxed">{profile.bio}</p>
        </div>

        {/* Qualifications */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">
              {t('secEducation')}
            </h3>
            <p className="font-bold text-gray-900 text-sm">{profile.qualification}</p>
            <p className="text-xs text-gray-600 mt-0.5">{profile.institution}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t('labelPassingYear')}: {profile.graduationYear}</p>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">
              {t('experienceHeading')}
            </h3>
            <p className="font-bold text-gray-900 text-sm">
              {profile.experienceYears} {t('yearsExp')} {t('labelExpYears')}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">{t('labelCurrentRole')}: {profile.currentRole || t('roleFresher')}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {t('labelRelocate')}: {profile.willingToRelocate ? t('yes') : t('no')}
            </p>
          </div>
        </div>

        {/* Skills */}
        <div className="pt-4 border-t border-gray-100">
          <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">
            {t('secSkills')}
          </h3>
          <div className="flex flex-wrap gap-2">
            {profile.skills.map((s, idx) => (
              <span
                key={idx}
                className="px-3 py-1 bg-gray-100 text-gray-800 text-xs font-semibold rounded-md border border-gray-200"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
