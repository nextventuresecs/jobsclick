'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { InstitutionProfileData, StudentRecordData } from '../../../data/sampleWorkspaces';
import { ShieldCheck } from 'lucide-react';

interface InstitutionOverviewTabProps {
  readonly institution: InstitutionProfileData;
  readonly students: readonly StudentRecordData[];
  readonly onViewProfile: () => void;
  readonly onViewStudents: () => void;
}

export function InstitutionOverviewTab({
  institution,
  students,
  onViewProfile,
  onViewStudents,
}: InstitutionOverviewTabProps) {
  const t = useTranslations('InstitutionWorkspace');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-xs font-semibold text-gray-500">{t('enrolledStudents')}</span>
          <p className="text-2xl font-bold text-gray-900 mt-1">{students.length}</p>
          <p className="text-[11px] text-gray-500 mt-1">{t('acrossTrades')}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-xs font-semibold text-gray-500">{t('profilesActive')}</span>
          <p className="text-2xl font-bold text-teal-600 mt-1">
            {students.filter((s) => s.profileCompleted).length}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">{t('readyForMsme')}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-xs font-semibold text-gray-500">{t('jobPlacements')}</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            {students.filter((s) => s.placementStatus === 'Placed').length}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">{t('placedInEnterprises')}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-xs font-semibold text-gray-500">{t('hardInvariant2')}</span>
          <div className="flex items-center gap-1.5 mt-2 text-emerald-700 font-semibold text-xs">
            <ShieldCheck className="w-4 h-4" />
            <span>{t('zeroSmsAtImport')}</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">{t('invitedStateEnforced')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Profile Summary Card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">Campus Identity & TPO</h3>
            <button
              type="button"
              onClick={onViewProfile}
              className="text-xs font-semibold text-brand-orange hover:underline"
            >
              View Details
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <span className="text-gray-500">Accreditation</span>
              <p className="font-bold text-gray-900 mt-0.5">{institution.affiliation}</p>
            </div>
            <div>
              <span className="text-gray-500">AISHE / NCVT Ref</span>
              <p className="font-mono font-bold text-gray-900 mt-0.5">{institution.affiliationCode}</p>
            </div>
            <div>
              <span className="text-gray-500">Training & Placement Head</span>
              <p className="font-bold text-gray-900 mt-0.5">{institution.contactPerson}</p>
              <p className="text-gray-500 text-[11px]">{institution.contactDesignation}</p>
            </div>
            <div>
              <span className="text-gray-500">Trades Offered ({institution.tradesOffered.length})</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {institution.tradesOffered.slice(0, 4).map((tr, idx) => (
                  <span key={idx} className="px-2 py-0.5 bg-gray-100 rounded text-[11px] text-gray-700 font-medium">
                    {tr}
                  </span>
                ))}
                {institution.tradesOffered.length > 4 && (
                  <span className="px-2 py-0.5 bg-gray-100 rounded text-[11px] text-gray-500">
                    +{institution.tradesOffered.length - 4} more
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Registrations */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Recent Student Enrolments</h3>
              <p className="text-[11px] text-gray-500">Pre-registered vocational students in batch rosters.</p>
            </div>
            <button
              type="button"
              onClick={onViewStudents}
              className="text-xs font-semibold text-brand-orange hover:underline"
            >
              View Full Roster
            </button>
          </div>

          <div className="divide-y divide-gray-100">
            {students.slice(0, 5).map((s) => (
              <div key={s.id} className="py-2.5 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-gray-900">{s.studentName}</h4>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Roll: <span className="font-mono text-gray-700">{s.rollNumber}</span> • {s.stream} ({s.passingYear})
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      s.placementStatus === 'Placed'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-blue-50 text-blue-800 border border-blue-200'
                    }`}
                  >
                    {s.placementStatus}
                  </span>
                  <span className="text-[11px] font-mono text-gray-400">
                    {s.state === 'invited' ? 'Invited' : 'Active'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
