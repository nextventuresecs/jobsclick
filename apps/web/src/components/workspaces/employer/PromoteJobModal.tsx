'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@indian-job-portal/ui';
import { Sparkles, CheckCircle, AlertCircle, X, Clock } from 'lucide-react';

interface PromoteJobModalProps {
  readonly jobId: string;
  readonly jobTitle: string;
  readonly isPromoted?: boolean;
  readonly featuredUntil?: string;
  readonly onPromoted?: (jobId: string, durationDays: number) => void;
}

export function PromoteJobModal({
  jobId,
  jobTitle,
  isPromoted = false,
  featuredUntil,
  onPromoted,
}: PromoteJobModalProps) {
  const t = useTranslations('EmployerWorkspace');
  const [isOpen, setIsOpen] = useState(false);
  const [durationDays, setDurationDays] = useState<7 | 14 | 30>(7);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handlePromote = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');

    try {
      const res = await fetch(`/api/jobs/${jobId}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationDays }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (errorData?.code === 'INSUFFICIENT_CREDITS' || res.status === 400) {
          throw new Error(t('insufficientCredits'));
        }
        throw new Error(errorData?.message || 'Promotion failed');
      }

      setStatus('success');
      onPromoted?.(jobId, durationDays);
      setTimeout(() => {
        setIsOpen(false);
        setStatus('idle');
      }, 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('insufficientCredits');
      setErrorMsg(msg);
      setStatus('error');
    }
  };

  return (
    <>
      {isPromoted ? (
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs"
          title={featuredUntil ? `${t('featuredUntil')}: ${new Date(featuredUntil).toLocaleDateString()}` : undefined}
        >
          <Sparkles className="w-3 h-3 text-amber-500 fill-amber-500" />
          <span>{t('promotedBadge')}</span>
        </span>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>{t('btnPromoteJob')}</span>
        </Button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 relative space-y-4">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
                <Sparkles className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">{t('promoteModalTitle')}</h2>
              <p className="text-xs text-gray-600 mt-1">{t('promoteModalDesc')}</p>
            </div>

            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-700">
              <span className="font-semibold block text-gray-900">{jobTitle}</span>
              <span className="text-[11px] text-gray-500">ID: {jobId}</span>
            </div>

            {status === 'success' ? (
              <div className="p-4 bg-emerald-50 text-emerald-800 rounded-xl flex items-center gap-2 text-xs font-medium border border-emerald-200">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{t('promoteSuccessToast')}</span>
              </div>
            ) : (
              <form onSubmit={handlePromote} className="space-y-4">
                {status === 'error' && (
                  <div className="p-3 bg-red-50 text-red-700 rounded-xl flex items-center gap-2 text-xs border border-red-200">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">
                    {t('promoteDurationLabel')}
                  </label>
                  <div className="space-y-2">
                    {[
                      { days: 7 as const, label: t('promote7Days'), credits: 50 },
                      { days: 14 as const, label: t('promote14Days'), credits: 90 },
                      { days: 30 as const, label: t('promote30Days'), credits: 160 },
                    ].map((pack) => (
                      <label
                        key={pack.days}
                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                          durationDays === pack.days
                            ? 'border-amber-500 bg-amber-50/40 ring-1 ring-amber-400'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="radio"
                            name="duration"
                            value={pack.days}
                            checked={durationDays === pack.days}
                            onChange={() => setDurationDays(pack.days)}
                            className="text-amber-600 focus:ring-amber-500"
                          />
                          <span className="text-xs font-medium text-gray-900">{pack.label}</span>
                        </div>
                        <span className="text-xs font-bold text-amber-700">{pack.credits} Credits</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-200/60 text-[11px] text-amber-900 space-y-1">
                  <div className="flex items-center gap-1 font-semibold">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    Ledger-Backed Double Entry
                  </div>
                  <p>Credits are atomically deducted from your credit ledger. Expired listings automatically revert to standard chronological ranking.</p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsOpen(false)}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={status === 'loading'}
                    className="text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {status === 'loading' ? 'Processing...' : t('btnConfirmPromote')}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
