'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button, StatusBadge } from '@indian-job-portal/ui';
import type { ApplicationData } from '../../../data/sampleWorkspaces';
import { ShieldCheck, X } from 'lucide-react';
import type { ApplicationStatus } from '@indian-job-portal/validation';

interface ApplicantDetailModalProps {
  readonly applicant: ApplicationData | null;
  readonly onClose: () => void;
  readonly onUpdateStatus: (id: string, status: ApplicationStatus) => void;
}

export function ApplicantDetailModal({
  applicant,
  onClose,
  onUpdateStatus,
}: ApplicantDetailModalProps) {
  const t = useTranslations('EmployerWorkspace');

  if (!applicant) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-gray-200 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-orange-100 text-brand-orange flex items-center justify-center font-bold text-lg">
              {applicant.candidateName.charAt(0)}
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">{applicant.candidateName}</h3>
              <p className="text-xs text-gray-500 font-medium">{t('appliedFor')} {applicant.jobTitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hard Invariant #1 Banner */}
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5">
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs text-emerald-800 leading-relaxed">
            <p className="font-bold">{t('modalCandidatePiiMasked')}</p>
            <p className="mt-0.5">{t('modalMaskedDesc')}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
            <span className="text-gray-400 uppercase tracking-wider font-semibold text-[10px]">{t('contactMobile')}</span>
            <p className="font-mono text-gray-900 font-bold mt-1">+91 ••••• ••829</p>
            <span className="text-[10px] text-emerald-600 font-medium">{t('maskedPerInvariant')}</span>
          </div>
          <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
            <span className="text-gray-400 uppercase tracking-wider font-semibold text-[10px]">{t('emailAddress')}</span>
            <p className="font-mono text-gray-900 font-bold mt-1">••••••••••@••••.in</p>
            <span className="text-[10px] text-emerald-600 font-medium">{t('inAppChatOnly')}</span>
          </div>
          <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
            <span className="text-gray-400 uppercase tracking-wider font-semibold text-[10px]">{t('educationTrade')}</span>
            <p className="text-gray-900 font-bold mt-1">{applicant.candidateEducation || 'Trade Certificate'}</p>
          </div>
          <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
            <span className="text-gray-400 uppercase tracking-wider font-semibold text-[10px]">{t('applicationStatus')}</span>
            <div className="mt-1">
              <StatusBadge status={applicant.status} />
            </div>
          </div>
        </div>

        <div>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider text-[10px]">{t('verifiedTechSkills')}</span>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {applicant.candidateSkills && applicant.candidateSkills.length > 0 ? (
              applicant.candidateSkills.map((sk) => (
                <span key={sk} className="px-2.5 py-1 rounded-lg bg-orange-50 text-brand-orange font-medium text-xs border border-orange-100">
                  {sk}
                </span>
              ))
            ) : (
              <span className="text-xs text-gray-400">Standard vocational curriculum verified</span>
            )}
          </div>
        </div>

        <div className="pt-2 flex justify-end gap-2 border-t border-gray-100">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t('btnClose')}
          </Button>
          {applicant.status === 'applied' && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                onUpdateStatus(applicant.id, 'shortlisted');
                onClose();
              }}
            >
              {t('shortlistCandidate')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
