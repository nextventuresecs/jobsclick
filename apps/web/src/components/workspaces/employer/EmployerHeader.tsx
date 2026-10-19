'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@indian-job-portal/ui';
import type { CompanyItem } from '../../../data/sampleCompanies';
import {
  Building2,
  CheckCircle2,
  Award,
  ExternalLink,
  Edit3,
  PlusCircle,
  QrCode,
  AlertCircle,
} from 'lucide-react';

interface EmployerHeaderProps {
  readonly company: CompanyItem;
  readonly isOnboardingComplete: boolean;
  readonly onOpenProfileEdit: () => void;
  readonly onOpenPostJob: () => void;
  readonly onOpenQrPoster: () => void;
}

export function EmployerHeader({
  company,
  isOnboardingComplete,
  onOpenProfileEdit,
  onOpenPostJob,
  onOpenQrPoster,
}: EmployerHeaderProps) {
  const t = useTranslations('EmployerWorkspace');

  return (
    <div className="space-y-4">
      {!isOnboardingComplete && (
        <div className="p-4 bg-orange-50 border border-orange-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-brand-orange shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-bold text-orange-950">
                {t('onboardingIncompleteTitle')}
              </h2>
              <p className="text-xs text-orange-800 mt-0.5">
                {t('onboardingIncompleteDesc')}
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenProfileEdit}
            className="shrink-0"
          >
            {t('completeOnboardingNow')}
          </Button>
        </div>
      )}

      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-orange-50 border-2 border-orange-200 flex items-center justify-center shrink-0">
            <Building2 className="w-8 h-8 text-brand-orange" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{company.name}</h1>
              {company.isMsme && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>{t('verifiedMsmeBadge')}</span>
                </span>
              )}
              {company.isDpiitStartup && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                  <Award className="w-3 h-3 text-blue-600" />
                  <span>{t('dpiitBadge')}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-2">
              {company.udyamNumber && (
                <span className="font-mono text-gray-700 font-semibold">{company.udyamNumber}</span>
              )}
              <span>•</span>
              <span>{company.enterpriseSize} {t('enterprise')}</span>
              <span>•</span>
              <span>{company.ownershipType}</span>
              <span>•</span>
              <span>{company.city}, {company.state}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href={`/company/${company.id}`}
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
            onClick={onOpenProfileEdit}
            className="inline-flex items-center gap-1.5"
          >
            <Edit3 className="w-4 h-4 text-gray-600" />
            <span>{t('editProfile')}</span>
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onOpenPostJob}
            className="inline-flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{t('postVacancy')}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenQrPoster}
            className="inline-flex items-center gap-1.5"
          >
            <QrCode className="w-4 h-4" />
            <span>{t('walkinQr')}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
