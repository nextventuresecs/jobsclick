'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@indian-job-portal/ui';

export interface QuickAddStudentFormData {
  quickStudentName: string;
  setQuickStudentName: (val: string) => void;
  quickRollNumber: string;
  setQuickRollNumber: (val: string) => void;
  quickPhone: string;
  setQuickPhone: (val: string) => void;
  quickStream: string;
  setQuickStream: (val: string) => void;
  quickPassingYear: string;
  setQuickPassingYear: (val: string) => void;
}

interface QuickAddStudentFormProps {
  readonly formData: QuickAddStudentFormData;
  readonly onSubmit: (e: React.FormEvent) => void;
  readonly onCancel: () => void;
}

export function QuickAddStudentForm({
  formData: d,
  onSubmit,
  onCancel,
}: QuickAddStudentFormProps) {
  const t = useTranslations('InstitutionWorkspace');

  return (
    <form onSubmit={onSubmit} className="p-5 rounded-xl bg-teal-50/50 border border-teal-200 space-y-4 animate-in fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-teal-800">
          {t('btnAddStudent')}
        </h3>
        <span className="text-[11px] text-teal-700 font-medium">{t('inv2BannerTitle')}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs">
        <div>
          <label className="block font-semibold text-gray-700 mb-1">{t('colStudentName')} *</label>
          <input
            type="text"
            value={d.quickStudentName}
            onChange={(e) => d.setQuickStudentName(e.target.value)}
            placeholder="e.g. Rahul Sharma"
            className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500 bg-white"
            required
          />
        </div>

        <div>
          <label className="block font-semibold text-gray-700 mb-1">{t('colRollNumber')} *</label>
          <input
            type="text"
            value={d.quickRollNumber}
            onChange={(e) => d.setQuickRollNumber(e.target.value)}
            placeholder="0801ME221199"
            className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500 bg-white"
            required
          />
        </div>

        <div>
          <label className="block font-semibold text-gray-700 mb-1">{t('colPhone')} *</label>
          <input
            type="tel"
            maxLength={10}
            value={d.quickPhone}
            onChange={(e) => d.setQuickPhone(e.target.value)}
            placeholder="9876543210"
            className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500 bg-white"
            required
          />
        </div>

        <div>
          <label className="block font-semibold text-gray-700 mb-1">{t('colStream')}</label>
          <input
            type="text"
            value={d.quickStream}
            onChange={(e) => d.setQuickStream(e.target.value)}
            placeholder="Mechanical (Diploma)"
            className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500 bg-white"
          />
        </div>

        <div>
          <label className="block font-semibold text-gray-700 mb-1">{t('colPassingYear')}</label>
          <input
            type="text"
            value={d.quickPassingYear}
            onChange={(e) => d.setQuickPassingYear(e.target.value)}
            placeholder="2026"
            className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500 bg-white"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-100"
        >
          {t('cancel')}
        </button>
        <Button type="submit" variant="primary" size="sm">
          {t('saveStudent')}
        </Button>
      </div>
    </form>
  );
}
