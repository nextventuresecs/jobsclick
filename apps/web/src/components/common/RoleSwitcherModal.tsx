'use client';

import React from 'react';
import { useApp } from '../../context/AppContext';
import type { ClientRole } from '@indian-job-portal/validation';
import {
  X,
  UserCheck,
  Building2,
  GraduationCap,
  Building,
  ShieldCheck,
  LogOut,
} from 'lucide-react';

interface RoleOption {
  readonly role: ClientRole;
  readonly title: string;
  readonly subtitle: string;
  readonly description: string;
  readonly icon: React.ReactNode;
  readonly color: string;
}

export function RoleSwitcherModal() {
  const {
    isRoleSwitcherOpen,
    closeRoleSwitcher,
    currentUserRole,
    loginAs,
    logout,
  } = useApp();

  if (!isRoleSwitcherOpen || process.env.NODE_ENV === 'production') return null;

  const rolesList: readonly RoleOption[] = [
    {
      role: 'jobseeker',
      title: 'Job Seeker',
      subtitle: 'Rahul Sharma · Certified Machinist & Technician',
      description:
        'Search verified opportunities, track applications, manage candidate profile, and download authenticated profile PDF with privacy protection.',
      icon: <UserCheck className="w-5 h-5 text-orange-600" />,
      color: 'border-orange-200 bg-orange-50/50 hover:bg-orange-50',
    },
    {
      role: 'employer',
      title: 'MSME Employer',
      subtitle: 'Aarya Precision Engineering · Industrial Manufacturing',
      description:
        'Post jobs across categories, review candidate pipeline (with masked contact privacy), and generate business QR code.',
      icon: <Building2 className="w-5 h-5 text-blue-600" />,
      color: 'border-blue-200 bg-blue-50/50 hover:bg-blue-50',
    },
    {
      role: 'institution',
      title: 'Institution & Placement Cell',
      subtitle: 'Vocational & Technical College Placement Cell',
      description:
        'Bulk CSV student onboarding, roster verification, invitation tracking, and prefilled candidate dispatch.',
      icon: <GraduationCap className="w-5 h-5 text-teal-600" />,
      color: 'border-teal-200 bg-teal-50/50 hover:bg-teal-50',
    },
    {
      role: 'msme_dept',
      title: 'MSME Department Admin',
      subtitle: 'District Industries Centre (DIC) Facilitation Cell',
      description:
        'Verify enterprise Udyam certifications, monitor industrial employment metrics, and review business compliance.',
      icon: <Building className="w-6 h-6 text-purple-600" />,
      color: 'border-purple-200 bg-purple-50/50 hover:bg-purple-50',
    },
    {
      role: 'platform_admin',
      title: 'Platform Administrator',
      subtitle: 'JobsClick Central Ops & Audit Directorate',
      description:
        'Inspect immutable audit logs, moderate job postings, oversee security controls, and review system health.',
      icon: <ShieldCheck className="w-5 h-5 text-emerald-600" />,
      color: 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50',
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-lg font-bold text-gray-900 tracking-tight">
              Interactive Role Simulator
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Switch roles instantly to inspect each distinct workspace and permission layer.
            </p>
          </div>
          <button
            type="button"
            onClick={closeRoleSwitcher}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Role Banner */}
        {currentUserRole && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-between text-xs">
            <span className="text-gray-600">
              Active Session:{' '}
              <strong className="text-gray-900 uppercase">{currentUserRole}</strong>
            </span>
            <button
              type="button"
              onClick={() => logout()}
              className="text-red-600 hover:underline flex items-center gap-1 font-semibold"
            >
              <LogOut className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>
        )}

        {/* Role Options */}
        <div className="p-6 space-y-3">
          {rolesList.map((r) => {
            const isSelected = currentUserRole === r.role;
            return (
              <div
                key={r.role}
                onClick={() => {
                  loginAs(r.role);
                  closeRoleSwitcher();
                }}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${r.color} ${
                  isSelected ? 'ring-2 ring-orange-500 font-semibold' : ''
                }`}
              >
                <div className="p-2 rounded-lg bg-white shadow-2xs shrink-0 mt-0.5">
                  {r.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-900">{r.title}</span>
                    {isSelected && (
                      <span className="text-[10px] font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-700 mt-0.5 font-medium">{r.subtitle}</p>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                    {r.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
