'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@indian-job-portal/ui';
import type { SeekerProfileData } from '../../../data/sampleWorkspaces';
import {
  CheckCircle2,
  GraduationCap,
  MapPin,
  Printer,
  AlertCircle,
} from 'lucide-react';

interface SeekerHeaderProps {
  readonly profile: SeekerProfileData;
  readonly isOnboardingComplete: boolean;
  readonly onOpenCvPreview: () => void;
  readonly onCompleteProfile: () => void;
}

export function SeekerHeader({
  profile,
  isOnboardingComplete,
  onOpenCvPreview,
  onCompleteProfile,
}: SeekerHeaderProps) {
  const t = useTranslations('SeekerWorkspace');

  return (
    <div className="space-y-4">
      {/* Candidate Banner */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-orange-200 bg-gray-100 shrink-0">
            {profile.avatar ? (
              <img
                src={profile.avatar}
                alt={profile.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[#FFF0E5] text-[#F97316] font-bold text-xl">
                {profile.name.charAt(0)}
              </div>
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{profile.name}</h1>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>{t('verifiedCandidate')}</span>
              </span>
              {profile.enrolledViaInstitution && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
                  <GraduationCap className="w-3 h-3 text-teal-600" />
                  <span>{t('enrolledVia')} {profile.enrolledViaInstitution}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-2">
              <span>{profile.currentRole || t('defaultRole')}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3 text-gray-400" />
                {profile.city}, {profile.state}
              </span>
              <span>•</span>
              <span className="font-mono text-gray-400">ID: {profile.id}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-xs font-semibold text-gray-500">{t('profileReadiness')}</span>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-28 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${profile.completionPercentage}%` }}
                />
              </div>
              <span className="text-xs font-bold text-gray-900">{profile.completionPercentage}%</span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenCvPreview}
            className="hidden sm:inline-flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4 text-gray-600" />
            <span>{t('digitalCv')}</span>
          </Button>
        </div>
      </div>

      {/* Onboarding Incomplete Alert Banner */}
      {!isOnboardingComplete && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-950">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-xs font-bold">{t('onboardingIncompleteTitle')}</p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                {t('onboardingIncompleteDesc')}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onCompleteProfile}
            className="shrink-0"
          >
            {t('completeProfileNow')}
          </Button>
        </div>
      )}
    </div>
  );
}
