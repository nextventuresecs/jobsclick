'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@indian-job-portal/ui';
import { CheckCircle2, AlertCircle, ShieldCheck, Send } from 'lucide-react';
import type { BulkUploadState } from './BulkUploadModal';
import { BulkUploadStep1 } from './BulkUploadStep1';

export type { ParsedRow, BulkUploadState } from './BulkUploadStep1Types';

interface BulkUploadModalProps {
  readonly uploadState: BulkUploadState;
  readonly onDownloadTemplate: () => void;
  readonly onDirectFileUpload: (file?: File) => void;
  readonly onParseCsv: () => void;
  readonly onExecuteImport: () => void;
  readonly onScheduleWave: () => void;
  readonly onViewStudents: () => void;
}

export function BulkUploadModal({
  uploadState: s,
  onDownloadTemplate,
  onDirectFileUpload,
  onParseCsv,
  onExecuteImport,
  onScheduleWave,
  onViewStudents,
}: BulkUploadModalProps) {
  const t = useTranslations('InstitutionWorkspace');

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-xs space-y-6">
      <div className="pb-4 border-b border-gray-100">
        <h2 className="text-base font-bold text-gray-900">{t('bulkImportHeading')}</h2>
        <p className="text-xs text-gray-500 mt-0.5">{t('bulkImportSubheading')}</p>
      </div>

      {/* Stepper bar */}
      <div className="grid grid-cols-4 gap-2 text-center text-xs font-semibold">
        {[
          { step: 1, label: t('step1Title') },
          { step: 2, label: t('step2Title') },
          { step: 3, label: t('step3Title') },
          { step: 4, label: t('step4Title') },
        ].map((item) => (
          <div
            key={item.step}
            className={`py-2 px-3 rounded-lg border ${
              s.importStep >= item.step
                ? 'bg-teal-50 text-teal-900 border-teal-300 font-bold'
                : 'bg-gray-50 text-gray-400 border-gray-200'
            }`}
          >
            {item.label}
          </div>
        ))}
      </div>

      {/* STEP 1: Select or Upload CSV */}
      {s.importStep === 1 && (
        <>
          <BulkUploadStep1
            uploadState={s}
            onDownloadTemplate={onDownloadTemplate}
            onDirectFileUpload={onDirectFileUpload}
            onParseCsv={onParseCsv}
          />
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
            <span><strong>{t('inv2BannerTitle')}:</strong> {t('inv2BannerDesc')}</span>
          </div>
        </>
      )}

      {/* STEP 2: Review */}
      {s.importStep === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-900">{t('step2Title')}</h3>
              <p className="text-xs text-gray-500">{s.parsedRows.length} rows</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => s.setImportStep(1)} className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg">
                {t('cancel')}
              </button>
              <Button type="button" variant="primary" size="sm" onClick={onExecuteImport}>
                {t('btnProceedToQueue')} ({s.parsedRows.filter((r) => r.isValid).length} {t('validRows')})
              </Button>
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 text-xs max-h-80 overflow-y-auto">
            {s.parsedRows.map((r) => (
              <div key={r.rowNumber} className="p-3 flex items-center justify-between gap-3 bg-white">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900">{r.studentName}</span>
                    <span className="font-mono text-gray-400">Row {r.rowNumber}</span>
                  </div>
                  <p className="text-gray-500 mt-0.5">Roll: {r.rollNumber} • Phone: +91 {r.phone} • Stream: {r.stream}</p>
                </div>
                <div>
                  {r.isValid ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>{t('validRows')}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-800 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-200">
                      <AlertCircle className="w-3 h-3 text-red-600" />
                      <span>{r.errors.join(', ')}</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STEP 3: Queued & Cost Preview */}
      {s.importStep === 3 && (
        <div className="p-6 rounded-2xl bg-teal-50 border border-teal-200 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-teal-900">
              <CheckCircle2 className="w-5 h-5 text-teal-600" />
              <h3 className="text-base font-bold">
                {s.batchStatus === 'uploading' ? 'Uploading to Supabase Storage...' : s.batchStatus === 'processing' || s.batchStatus === 'queued' ? 'Background Worker Processing (500-Row Chunks)...' : t('batchSuccessTitle')}
              </h3>
            </div>
            {s.batchStatus !== 'idle' && (
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${s.batchStatus === 'completed' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : s.batchStatus === 'failed' ? 'bg-red-100 text-red-800 border-red-300' : 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse'}`}>
                {s.batchStatus.toUpperCase()}
              </span>
            )}
          </div>

          <p className="text-xs text-teal-800">{t('batchSuccessDesc')}</p>

          <div className="bg-white p-4 rounded-xl border border-teal-200 text-xs space-y-2">
            <h4 className="font-bold text-gray-900">{t('waveHeading')}</h4>
            <div className="flex justify-between text-gray-600">
              <span>Target Recipients:</span>
              <span className="font-bold text-gray-900">{s.batchMetrics.validRows || s.parsedRows.filter((r) => r.isValid).length}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>{t('smsCostPerCandidate')}</span>
              <span className="font-bold text-gray-900">₹0.12 / SMS</span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="primary" size="sm" onClick={onScheduleWave} className="inline-flex items-center gap-1.5">
              <Send className="w-4 h-4" />
              <span>{t('btnDispatchWave')}</span>
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4: Success */}
      {s.importStep === 4 && (
        <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-3 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
          <h3 className="text-base font-bold text-emerald-950">{t('waveScheduleSuccess')}</h3>
          <p className="text-xs text-emerald-800 max-w-md mx-auto">{t('waveSubheading')}</p>
          <div className="pt-3">
            <Button type="button" variant="outline" size="sm" onClick={onViewStudents}>
              {t('tabStudents')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
