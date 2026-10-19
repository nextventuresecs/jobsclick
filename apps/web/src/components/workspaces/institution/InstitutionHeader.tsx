'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@indian-job-portal/ui';
import type { InstitutionProfileData } from '../../../data/sampleWorkspaces';
import {
  GraduationCap,
  CheckCircle2,
  ExternalLink,
  QrCode,
  Edit3,
  Upload,
  AlertCircle,
} from 'lucide-react';

interface InstitutionHeaderProps {
  readonly institution: InstitutionProfileData;
  readonly isOnboardingComplete: boolean;
  readonly onOpenProfileEdit: () => void;
  readonly onOpenBulkImport: () => void;
  readonly onOpenQrCode: () => void;
}

export function InstitutionHeader({
  institution,
  isOnboardingComplete,
  onOpenProfileEdit,
  onOpenBulkImport,
  onOpenQrCode,
}: InstitutionHeaderProps) {
  const t = useTranslations('InstitutionWorkspace');

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-teal-50 border-2 border-teal-200 flex items-center justify-center shrink-0">
            <GraduationCap className="w-8 h-8 text-teal-600" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                {institution.institutionName}
              </h1>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-teal-600" />
                <span>{institution.affiliation}</span>
              </span>
              <span className="text-[11px] font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                Ref: {institution.affiliationCode}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
              <span>{institution.city}, {institution.state}</span>
              <span>•</span>
              <span>{t('tpo')} {institution.contactPerson} ({institution.contactDesignation})</span>
              <span>•</span>
              <span className="font-semibold text-teal-700">{t('capacityPrefix')} {institution.annualCapacity} {t('studentsPerYr')}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link
            href={`/institution/${institution.id}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
            <span>{t('viewPublicProfile')}</span>
          </Link>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenQrCode}
            className="inline-flex items-center gap-1.5"
          >
            <QrCode className="w-4 h-4 text-brand-orange" />
            <span>{t('campusQr')}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenProfileEdit}
            className="inline-flex items-center gap-1.5"
          >
            <Edit3 className="w-4 h-4" />
            <span>{t('editProfile')}</span>
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onOpenBulkImport}
            className="inline-flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4" />
            <span>{t('bulkStudentOnboarding')}</span>
          </Button>
        </div>
      </div>

      {/* Onboarding Incomplete Alert Banner */}
      {!isOnboardingComplete && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-950">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-xs font-bold">{t('alertIncompleteTitle')}</p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                {t('alertIncompleteDesc')}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onOpenProfileEdit}
            className="shrink-0"
          >
            {t('btnCompleteProfileNow')}
          </Button>
        </div>
      )}
    </div>
  );
}
