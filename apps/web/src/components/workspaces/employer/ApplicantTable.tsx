'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button, StatusBadge } from '@indian-job-portal/ui';
import type { ApplicationData } from '../../../data/sampleWorkspaces';
import { Search, ShieldCheck } from 'lucide-react';
import type { ApplicationStatus } from '@indian-job-portal/validation';

interface ApplicantTableProps {
  readonly applicants: readonly ApplicationData[];
  readonly applicantSearch: string;
  readonly setApplicantSearch: (val: string) => void;
  readonly statusFilter: string;
  readonly setStatusFilter: (val: string) => void;
  readonly onViewApplicant: (app: ApplicationData) => void;
  readonly onUpdateStatus: (id: string, status: ApplicationStatus) => void;
}

export function ApplicantTable({
  applicants,
  applicantSearch,
  setApplicantSearch,
  statusFilter,
  setStatusFilter,
  onViewApplicant,
  onUpdateStatus,
}: ApplicantTableProps) {
  const t = useTranslations('EmployerWorkspace');

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              {t('applicantsHeading')} ({applicants.length})
            </h2>
            <p className="text-xs text-gray-500">{t('applicantsSubheading')}</p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:outline-hidden"
            >
              <option value="all">{t('filterAll')}</option>
              <option value="applied">{t('filterApplied')}</option>
              <option value="shortlisted">{t('filterShortlisted')}</option>
              <option value="interview_scheduled">Interview Scheduled</option>
              <option value="offered">Offered</option>
              <option value="rejected">{t('filterRejected')}</option>
            </select>
          </div>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <input
            type="text"
            value={applicantSearch}
            onChange={(e) => setApplicantSearch(e.target.value)}
            placeholder={t('searchApplicantPlaceholder')}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-brand-orange focus:outline-hidden"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {applicants.map((app) => (
          <div
            key={app.id}
            className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900">{app.candidateName}</h3>
                <StatusBadge status={app.status} />
              </div>
              <p className="text-xs text-gray-600 font-medium">{t('appliedFor')} {app.jobTitle}</p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1 font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  {t('contactMaskedNotice')}
                </span>
                <span>•</span>
                <span>{t('candidateRef')} {app.candidateId}</span>
                <span>•</span>
                <span>{t('appliedOn')} {app.appliedDate}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onViewApplicant(app)}
              >
                {t('viewProfile')}
              </Button>
              {app.status === 'applied' && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => onUpdateStatus(app.id, 'shortlisted')}
                >
                  {t('shortlistCandidate')}
                </Button>
              )}
              {app.status === 'shortlisted' && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => onUpdateStatus(app.id, 'interview_scheduled')}
                >
                  {t('scheduleInterview')}
                </Button>
              )}
              {app.status !== 'rejected' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onUpdateStatus(app.id, 'rejected')}
                  className="text-red-600 hover:bg-red-50"
                >
                  {t('reject')}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
