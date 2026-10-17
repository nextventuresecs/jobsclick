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

  if (!isRoleSwitcherOpen) return null;

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
      icon: <Building className="w-5 h-5 text-purple-600" />,
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
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close role switcher"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Roles Grid */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {rolesList.map((item) => {
            const isSelected = currentUserRole === item.role;
            return (
              <button
                key={item.role}
                type="button"
                onClick={() => {
                  loginAs(item.role);
                }}
                className={`p-4 rounded-xl border text-left transition-all relative cursor-pointer ${item.color} ${
                  isSelected ? 'ring-2 ring-[#F97316] border-[#F97316]' : ''
                }`}
              >
                {isSelected && (
                  <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider text-white bg-[#F97316] px-2 py-0.5 rounded-full">
                    Active
                  </span>
                )}
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-white rounded-lg shadow-2xs border border-gray-100 shrink-0">
                    {item.icon}
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 text-sm">{item.title}</h4>
                    <p className="text-[11px] text-gray-500">{item.subtitle}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed mt-2">{item.description}</p>
              </button>
            );
          })}
        </div>

        {/* Guest sign out option */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              logout();
              closeRoleSwitcher();
            }}
            className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-red-600 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Reset to Public Guest Mode (Signed Out)</span>
          </button>
          <span className="text-[11px] text-gray-400 font-mono">Demo Role Simulator</span>
        </div>
      </div>
    </div>
  );
}
