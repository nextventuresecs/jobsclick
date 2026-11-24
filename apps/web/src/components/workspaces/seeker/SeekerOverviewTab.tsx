'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CategoryBadge, StatusBadge, getCategoryCardBorderClass } from '@indian-job-portal/ui';
import type { ApplicationData } from '../../../data/sampleWorkspaces';
import type { JobItem } from '../../../data/sampleJobs';
import { useWalletBalance } from '../../wallet/useWalletBalance';
import { RechargeModal } from '../../wallet/RechargeModal';
import {
  ShieldCheck,
  Building2,
  Calendar,
  MapPin,
  ArrowRight,
  CreditCard,
  AlertCircle,
} from 'lucide-react';

interface SeekerOverviewTabProps {
  readonly myApplications: readonly ApplicationData[];
  readonly recommendedJobs: readonly JobItem[];
  readonly onNavigateToApplications: () => void;
}

export function SeekerOverviewTab({
  myApplications,
  recommendedJobs,
  onNavigateToApplications,
}: SeekerOverviewTabProps) {
  const t = useTranslations('SeekerWorkspace');
  const tWallet = useTranslations('wallet');
  const [isRechargeOpen, setIsRechargeOpen] = useState(false);
  const { balance, isLoading: isBalanceLoading } = useWalletBalance();

  const shortlistedCount = myApplications.filter(
    (a) => a.status === 'shortlisted' || a.status === 'under_review'
  ).length;

  const freeAppsExhausted = myApplications.length >= 10 && (balance ?? 0) <= 0;

  return (
    <div className="space-y-6">
      {/* 10 Free Applications Exhausted Alert */}
      {freeAppsExhausted && (
        <div className="p-4 bg-orange-50 border border-orange-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-brand-orange shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-bold text-orange-950">
                {tWallet('freeApplicationsUsed')}
              </h2>
              <p className="text-xs text-orange-800 mt-0.5">
                {tWallet('zeroBalancePrompt')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsRechargeOpen(true)}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition shadow-xs shrink-0 cursor-pointer"
          >
            {tWallet('rechargeButton')}
          </button>
        </div>
      )}

      {/* Quick Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-xs font-semibold text-gray-500">{t('statActiveApplications')}</span>
          <p className="text-2xl font-bold text-gray-900 mt-1">{myApplications.length}</p>
          <p className="text-[11px] text-gray-500 mt-1">{t('statActiveApplicationsDesc')}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-xs font-semibold text-gray-500">{t('statShortlisted')}</span>
          <p className="text-2xl font-bold text-blue-600 mt-1">{shortlistedCount}</p>
          <p className="text-[11px] text-gray-500 mt-1">{t('statShortlistedDesc')}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-xs font-semibold text-gray-500">{t('statPrivacyStatus')}</span>
          <div className="flex items-center gap-1.5 mt-1.5">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <span className="text-sm font-bold text-emerald-700">{t('statPrivacyStatusVal')}</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">{t('statPrivacyStatusDesc')}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold text-gray-500">{tWallet('currentBalance')}</span>
            <div className="flex items-center gap-2 mt-1">
              <CreditCard className="w-5 h-5 text-sky-600" />
              <p className="text-2xl font-bold text-sky-700">
                {isBalanceLoading ? '...' : `${balance ?? 0}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsRechargeOpen(true)}
            className="mt-2 text-xs font-bold text-sky-600 hover:text-sky-700 text-left cursor-pointer"
          >
            + {tWallet('rechargeButton')}
          </button>
        </div>
      </div>

      {/* Active Applications preview */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-900">{t('pipelineHeading')}</h2>
          <button
            type="button"
            onClick={onNavigateToApplications}
            className="text-xs font-semibold text-[#F97316] hover:underline"
          >
            {t('viewAll')} ({myApplications.length})
          </button>
        </div>

        {myApplications.length === 0 ? (
          <div className="text-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <p className="text-xs text-gray-500 font-medium">{t('noRecentApplications')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {myApplications.map((app) => (
              <div
                key={app.id}
                className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <h3 className="text-sm font-bold text-gray-900">{app.jobTitle}</h3>
                  <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-gray-400" />
                    <span>{app.companyName}</span>
                    <span>•</span>
                    <span>{t('appliedOn')} {app.appliedDate}</span>
                  </p>
                  {app.interviewDate && (
                    <p className="text-xs font-semibold text-blue-700 mt-1.5 flex items-center gap-1 bg-blue-50 px-2.5 py-1 rounded-md w-fit">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{t('interviewScheduled')} {app.interviewDate}</span>
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  <StatusBadge status={app.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recommended Jobs */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-gray-900">{t('recommendedJobsHeading')}</h2>
            <p className="text-xs text-gray-500">{t('recommendedJobsDesc')}</p>
          </div>
          <Link
            href="/jobs"
            className="text-xs font-semibold text-[#F97316] hover:underline inline-flex items-center gap-1"
          >
            <span>{t('browseAllJobs')}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recommendedJobs.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <p className="text-sm text-gray-500 font-medium">{t('emptyFeaturedDesc')}</p>
            <Link
              href="/jobs"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#F97316] hover:underline"
            >
              <span>{t('browseAllJobs')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recommendedJobs.map((job) => (
              <div
                key={job.id}
                className={`bg-white rounded-xl border border-gray-200 p-4 shadow-2xs hover:shadow-md transition-all ${getCategoryCardBorderClass(
                  job.category
                )} flex flex-col justify-between`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <CategoryBadge category={job.category} />
                    <span className="text-xs font-bold text-gray-900">
                      ₹{(job.salaryMin / 1000).toFixed(0)}k - ₹{(job.salaryMax / 1000).toFixed(0)}k/mo
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 line-clamp-1">{job.title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{job.companyName}</p>
                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    <span>{job.location}</span>
                  </p>
                </div>
                <Link
                  href={`/jobs/${job.slug || job.id}`}
                  className="mt-4 block text-center py-2 px-3 rounded-lg text-xs font-semibold text-[#F97316] bg-orange-50 hover:bg-orange-100 transition-colors"
                >
                  {t('viewDetailsApply')}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <RechargeModal
        isOpen={isRechargeOpen}
        onClose={() => setIsRechargeOpen(false)}
        currentBalance={balance ?? 0}
      />
    </div>
  );
}
