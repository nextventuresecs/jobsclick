'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { StatusBadge } from '@indian-job-portal/ui';
import type { ApplicationData } from '../../../data/sampleWorkspaces';
import { Building2, Calendar, ShieldCheck } from 'lucide-react';

interface SeekerApplicationsListProps {
  readonly myApplications: readonly ApplicationData[];
}

export function SeekerApplicationsList({ myApplications }: SeekerApplicationsListProps) {
  const t = useTranslations('SeekerWorkspace');

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">{t('applicationsHeading')}</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          {t('applicationsSubheading')}
        </p>
      </div>

      <div className="space-y-4">
        {myApplications.map((app) => (
          <div
            key={app.id}
            className="p-5 rounded-xl border border-gray-200 bg-gray-50/50 hover:bg-white transition-all space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">{app.jobTitle}</h3>
                <p className="text-xs text-gray-600 mt-1 flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-semibold">{app.companyName}</span>
                  <span>•</span>
                  <span>{t('appliedOn')} {app.appliedDate}</span>
                </p>
              </div>
              <StatusBadge status={app.status} />
            </div>

            {app.notes && (
              <div className="p-3 rounded-lg bg-orange-50 border border-orange-200 text-xs text-orange-950">
                <span className="font-semibold">{t('recruiterNote')}</span> {app.notes}
              </div>
            )}

            {app.interviewDate && (
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-950 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  <strong className="font-semibold">{t('interviewScheduled')}</strong> {app.interviewDate}
                </span>
              </div>
            )}

            <div className="pt-2 border-t border-gray-200 flex flex-wrap items-center justify-between text-xs text-gray-500 gap-2">
              <span>{t('candidateRef')} {app.candidateId}</span>
              <span className="flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>{t('hardInvariant1Notice')}</span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
