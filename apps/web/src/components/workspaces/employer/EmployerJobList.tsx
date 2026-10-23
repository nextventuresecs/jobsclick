'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button, JobStatusBadge } from '@indian-job-portal/ui';
import type { JobItem } from '../../../data/sampleJobs';
import { MapPin, Eye, PlusCircle } from 'lucide-react';
import { PromoteJobModal } from './PromoteJobModal';

interface EmployerJobListProps {
  readonly jobs: readonly JobItem[];
  readonly onPostNewJob: () => void;
  readonly onReviewApplicants: (jobId?: string) => void;
}

export function EmployerJobList({
  jobs,
  onPostNewJob,
  onReviewApplicants,
}: EmployerJobListProps) {
  const t = useTranslations('EmployerWorkspace');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-900">
          {t('manageJobsHeading')} ({jobs.length})
        </h2>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onPostNewJob}
          className="inline-flex items-center gap-1.5"
        >
          <PlusCircle className="w-4 h-4" />
          <span>{t('postNewVacancy')}</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900">{job.title}</h3>
                <JobStatusBadge status={job.status ?? 'active'} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-gray-400" />
                  {job.location}
                </span>
                <span>•</span>
                <span className="font-semibold text-gray-700">
                  ₹{job.salaryMin.toLocaleString('en-IN')} - ₹{job.salaryMax.toLocaleString('en-IN')}{t('perMonth')}
                </span>
                <span>•</span>
                <span>{job.openings} {t('openingsCount')}</span>
                <span>•</span>
                <span>{t('appliedOn')} {job.postedDate}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {job.skills.map((skill, sIdx) => (
                  <span
                    key={sIdx}
                    className="px-2 py-0.5 text-[11px] rounded bg-gray-100 text-gray-700 font-medium"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <Link
                href={`/jobs/${job.id}`}
                className="p-2 text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                title="View public posting"
              >
                <Eye className="w-4 h-4" />
              </Link>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onReviewApplicants(job.id)}
              >
                {t('reviewApplicants')} ({job.applicantCount})
              </Button>
              <PromoteJobModal
                jobId={job.id}
                jobTitle={job.title}
                isPromoted={job.isPromoted}
                featuredUntil={job.featuredUntil}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
