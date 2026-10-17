'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@indian-job-portal/ui';
import { Download, Upload } from 'lucide-react';
import type { BulkUploadState } from './BulkUploadStep1Types';

interface BulkUploadStep1Props {
  readonly uploadState: BulkUploadState;
  readonly onDownloadTemplate: () => void;
  readonly onDirectFileUpload: (file?: File) => void;
  readonly onParseCsv: () => void;
}

export function BulkUploadStep1({
  uploadState: s,
  onDownloadTemplate,
  onDirectFileUpload,
  onParseCsv,
}: BulkUploadStep1Props) {
  const t = useTranslations('InstitutionWorkspace');

  return (
    <div className="space-y-6">
      <div className="border-2 border-dashed border-teal-300 rounded-2xl p-8 text-center bg-teal-50/30 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900">{t('labelUploadCsvFile')}</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            Columns: {t('colStudentName')}, {t('colRollNumber')}, {t('colPhone')}, {t('colStream')}, {t('colPassingYear')}.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={onDownloadTemplate} className="inline-flex items-center gap-1.5">
            <Download className="w-4 h-4" />
            <span>{t('btnDownloadTemplate')}</span>
          </Button>
          <input
            type="file"
            accept=".csv,text/csv"
            id="csv-file-picker"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                s.setSelectedFile(file);
                onDirectFileUpload(file);
              }
            }}
          />
          <label
            htmlFor="csv-file-picker"
            className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-lg shadow-xs transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>{t('btnBulkUploadCsv')}</span>
          </label>
          <Button type="button" variant="outline" size="sm" onClick={onParseCsv} className="inline-flex items-center gap-1.5">
            <span>{t('btnParseValidate')}</span>
          </Button>
        </div>
      </div>

      <details className="text-xs text-gray-500 pt-2">
        <summary className="font-semibold text-gray-700 cursor-pointer hover:text-teal-700">{t('orPasteCsv')}</summary>
        <div className="mt-2">
          <textarea
            rows={6}
            value={s.rawCsvText}
            onChange={(e) => s.setRawCsvText(e.target.value)}
            className="w-full p-2.5 font-mono text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-hidden bg-gray-50"
          />
        </div>
      </details>
    </div>
  );
}
