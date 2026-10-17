'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CategoryBadge, StatusBadge, getCategoryCardBorderClass } from '@indian-job-portal/ui';
import type { ApplicationData } from '../../../data/sampleWorkspaces';
import type { SAMPLE_JOBS } from '../../../data/sampleJobs';
import { ShieldCheck, Building2, Calendar, MapPin, ArrowRight } from 'lucide-react';

interface SeekerOverviewTabProps {
  readonly myApplications: readonly ApplicationData[];
  readonly recommendedJobs: typeof SAMPLE_JOBS;
  readonly onNavigateToApplications: () => void;
}

export function SeekerOverviewTab({
  myApplications,
  recommendedJobs,
  onNavigateToApplications,
}: SeekerOverviewTabProps) {
  const t = useTranslations('SeekerWorkspace');
  const shortlistedCount = myApplications.filter(
    (a) => a.status === 'shortlisted' || a.status === 'under_review'
  ).length;

  return (
    <div className="space-y-6">
      {/* Quick Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                href={`/jobs/${job.id}`}
                className="mt-4 block text-center py-2 px-3 rounded-lg text-xs font-semibold text-[#F97316] bg-orange-50 hover:bg-orange-100 transition-colors"
              >
                {t('viewDetailsApply')}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
