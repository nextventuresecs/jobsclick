'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { JobStatusBadge } from '@indian-job-portal/ui';
import type { JobItem } from '../../../data/sampleJobs';
import type { ApplicationData } from '../../../data/sampleWorkspaces';
import { CheckCircle2, ShieldCheck } from 'lucide-react';

interface EmployerOverviewTabProps {
  readonly companyJobs: readonly JobItem[];
  readonly applicants: readonly ApplicationData[];
  readonly onManageJobs: () => void;
}

export function EmployerOverviewTab({
  companyJobs,
  applicants,
  onManageJobs,
}: EmployerOverviewTabProps) {
  const t = useTranslations('EmployerWorkspace');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-xs font-semibold text-gray-500">{t('livePostings')}</span>
          <p className="text-2xl font-bold text-gray-900 mt-1">{companyJobs.length}</p>
          <p className="text-[11px] text-gray-500 mt-1">{t('publishedToNational')}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-xs font-semibold text-gray-500">{t('statTotalApplicants')}</span>
          <p className="text-2xl font-bold text-blue-600 mt-1">{applicants.length}</p>
          <p className="text-[11px] text-gray-500 mt-1">{t('candidatesAwaiting')}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-xs font-semibold text-gray-500">{t('udyamReg')}</span>
          <div className="flex items-center gap-1.5 mt-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-bold text-emerald-800">{t('verifiedActive')}</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">{t('registryValidated')}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-xs font-semibold text-gray-500">{t('candidatePrivacy')}</span>
          <div className="flex items-center gap-1.5 mt-2 text-emerald-700 font-semibold text-xs">
            <ShieldCheck className="w-4 h-4" />
            <span>{t('maskedByDefault')}</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">{t('hardInvariant1Active')}</p>
        </div>
      </div>

      {/* Quick Active Jobs Table */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-900">{t('currentVacancies')}</h2>
          <button
            type="button"
            onClick={onManageJobs}
            className="text-xs font-semibold text-[#F97316] hover:underline"
          >
            {t('manageAll')}
          </button>
        </div>

        <div className="divide-y divide-gray-100">
          {companyJobs.map((job) => (
            <div key={job.id} className="py-3 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900">{job.title}</h3>
                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                  <span>{job.location}</span>
                  <span>•</span>
                  <span>₹{job.salaryMin.toLocaleString('en-IN')} - ₹{job.salaryMax.toLocaleString('en-IN')}{t('perMonth')}</span>
                  <span>•</span>
                  <span>{job.openings} {t('openingsCount')}</span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  <strong>{job.applicantCount}</strong> {t('applicantsCount')}
                </span>
                <JobStatusBadge status="active" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
