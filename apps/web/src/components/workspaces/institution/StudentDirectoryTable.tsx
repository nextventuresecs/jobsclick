'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@indian-job-portal/ui';
import type { StudentRecordData } from '../../../data/sampleWorkspaces';
import { Search, PlusCircle, Upload, Share2 } from 'lucide-react';

interface StudentDirectoryTableProps {
  readonly students: readonly StudentRecordData[];
  readonly totalStudentsCount: number;
  readonly studentSearch: string;
  readonly setStudentSearch: (val: string) => void;
  readonly streamFilter: string;
  readonly setStreamFilter: (val: string) => void;
  readonly statusFilter: string;
  readonly setStatusFilter: (val: string) => void;
  readonly isAddingStudent: boolean;
  readonly onToggleAddStudent: () => void;
  readonly onOpenBulkImport: () => void;
  readonly onShareCandidate: (st: StudentRecordData) => void;
}

export function StudentDirectoryTable({
  students,
  totalStudentsCount,
  studentSearch,
  setStudentSearch,
  streamFilter,
  setStreamFilter,
  statusFilter,
  setStatusFilter,
  isAddingStudent,
  onToggleAddStudent,
  onOpenBulkImport,
  onShareCandidate,
}: StudentDirectoryTableProps) {
  const t = useTranslations('InstitutionWorkspace');

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100 gap-4">
        <div>
          <h2 className="text-base font-bold text-gray-900">{t('studentsHeading')} ({totalStudentsCount})</h2>
          <p className="text-xs text-gray-500 mt-0.5">{t('studentsSubheading')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onToggleAddStudent}
            className="inline-flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{isAddingStudent ? t('cancel') : t('btnAddStudent')}</span>
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onOpenBulkImport}
            className="inline-flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4" />
            <span>{t('btnBulkUploadCsv')}</span>
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
            placeholder={t('searchStudentPlaceholder')}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
          />
        </div>

        <select
          value={streamFilter}
          onChange={(e) => setStreamFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 bg-white"
        >
          <option value="all">{t('filterAllStreams')}</option>
          <option value="mechanical">Mechanical & Automobile</option>
          <option value="electrical">Electrical & Electronics</option>
          <option value="machinist">Machinist & Fitter</option>
          <option value="computer">Computer & IT (COPA/BCA)</option>
          <option value="civil">Civil & Surveying</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 bg-white"
        >
          <option value="all">{t('filterAllStatuses')}</option>
          <option value="Available">Available for Placement</option>
          <option value="Placed">Placed</option>
          <option value="In Process">Interview in Process</option>
        </select>
      </div>

      {/* Students List */}
      <div className="space-y-3">
        {students.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-xs">
            No students match your active filters or search criteria.
          </div>
        ) : (
          students.map((st) => (
            <div
              key={st.id}
              className="p-4 rounded-xl border border-gray-200 bg-gray-50/50 hover:bg-white transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-gray-900">{st.studentName}</h3>
                  <span className="text-[11px] font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                    Roll: {st.rollNumber}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-2">
                  <span>{st.stream}</span>
                  <span>•</span>
                  <span>Batch of {st.passingYear}</span>
                  <span>•</span>
                  <span className="font-mono text-gray-400">
                    {st.state === 'invited' ? 'Invited (Pending OTP Claim)' : 'Active Profile'}
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <span
                  className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                    st.profileCompleted
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}
                >
                  {st.profileCompleted ? 'Profile Complete' : 'Profile Pending'}
                </span>

                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    st.placementStatus === 'Placed'
                      ? 'bg-emerald-100 text-emerald-900'
                      : st.placementStatus === 'In Process'
                      ? 'bg-purple-100 text-purple-900'
                      : 'bg-blue-100 text-blue-900'
                  }`}
                >
                  {st.placementStatus}
                </span>

                <button
                  type="button"
                  onClick={() => onShareCandidate(st)}
                  className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:text-teal-700 hover:bg-gray-100 transition-colors"
                  title="Share Profile Link to Employer (PII Protected)"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
