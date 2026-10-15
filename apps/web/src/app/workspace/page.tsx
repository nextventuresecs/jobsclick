'use client';

import React from 'react';
import { Navbar } from '../../components/layout/Navbar';
import { Footer } from '../../components/layout/Footer';
import { useApp } from '../../context/AppContext';
import { SeekerWorkspace } from '../../components/workspaces/SeekerWorkspace';
import { EmployerWorkspace } from '../../components/workspaces/EmployerWorkspace';
import { InstitutionWorkspace } from '../../components/workspaces/InstitutionWorkspace';
import { AdminWorkspace } from '../../components/workspaces/AdminWorkspace';
import { Button } from '@indian-job-portal/ui';
import type { ClientRole } from '@indian-job-portal/validation';
import {
  UserCheck,
  Building2,
  GraduationCap,
  Building,
  ShieldCheck,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

export default function WorkspacePage() {
  const { currentUserRole, loginAs, openAuthModal } = useApp();

  const demoRoles: {
    readonly role: ClientRole;
    readonly title: string;
    readonly subtitle: string;
    readonly desc: string;
    readonly icon: React.ReactNode;
    readonly badge: string;
  }[] = [
    {
      role: 'jobseeker',
      title: 'Job Seeker Workspace',
      subtitle: 'Rahul Sharma · Certified ITI Machinist',
      desc: 'Applied jobs tracker, technical profile builder, and authenticated CV generator with protected PII.',
      icon: <UserCheck className="w-6 h-6 text-orange-600" />,
      badge: 'Candidate PII Masked',
    },
    {
      role: 'employer',
      title: 'MSME Employer Portal',
      subtitle: 'Aarya Precision Engineering · Udyam Verified',
      desc: 'Post job vacancies, review applicant pipeline with masked contacts, and generate walk-in QR poster.',
      icon: <Building2 className="w-6 h-6 text-blue-600" />,
      badge: 'UDYAM-MH-26-0019482',
    },
    {
      role: 'institution',
      title: 'Placement Cell Directorate',
      subtitle: 'Govt ITI & Technical College Hub',
      desc: 'Bulk CSV student onboarding, row verification, and wave scheduling with SMS cost preview.',
      icon: <GraduationCap className="w-6 h-6 text-teal-600" />,
      badge: 'BULK-01 to BULK-03',
    },
    {
      role: 'msme_dept',
      title: 'MSME Regional Facilitation',
      subtitle: 'District Industries Centre (DIC)',
      desc: 'Verify enterprise certifications, industrial employment metrics, and business audits.',
      icon: <Building className="w-6 h-6 text-purple-600" />,
      badge: 'DIC State Cell',
    },
    {
      role: 'platform_admin',
      title: 'Central Ops & Governance',
      subtitle: 'JobsClick Directorate Operations',
      desc: 'Inspect immutable append-only audit trail, job moderation, and system security controls.',
      icon: <ShieldCheck className="w-6 h-6 text-emerald-600" />,
      badge: 'Append-Only Audit',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F9FAFB]">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {currentUserRole === 'jobseeker' && <SeekerWorkspace />}
        {currentUserRole === 'employer' && <EmployerWorkspace />}
        {currentUserRole === 'institution' && <InstitutionWorkspace />}
        {currentUserRole === 'msme_dept' && <AdminWorkspace isMsmeDept={true} />}
        {currentUserRole === 'platform_admin' && <AdminWorkspace isMsmeDept={false} />}

        {/* Unauthenticated Role Selector Gateway */}
        {!currentUserRole && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Hero Banner */}
            <div className="bg-white rounded-3xl p-8 sm:p-12 border border-gray-200 shadow-sm text-center max-w-3xl mx-auto space-y-4">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold text-orange-900 bg-orange-50 border border-orange-200">
                <Sparkles className="w-3.5 h-3.5 text-[#F97316]" />
                <span>Multi-Stakeholder Architecture</span>
              </span>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                Select a Workspace to Explore
              </h1>
              <p className="text-sm text-gray-600 max-w-xl mx-auto leading-relaxed">
                JobsClick provides purpose-built, privacy-first environments for candidates, MSME employers, vocational placement cells, and state facilitation directorates.
              </p>
              <div className="pt-2 flex justify-center gap-3">
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => openAuthModal('jobseeker')}
                >
                  Sign In with Mobile OTP
                </Button>
              </div>
            </div>

            {/* 5-Role Simulator Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {demoRoles.map((d) => (
                <div
                  key={d.role}
                  className="bg-white rounded-2xl p-6 border border-gray-200 hover:border-orange-300 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                        {d.icon}
                      </div>
                      <span className="text-[11px] font-mono font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {d.badge}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-gray-900">{d.title}</h3>
                    <p className="text-xs font-semibold text-gray-500 mt-0.5">{d.subtitle}</p>
                    <p className="text-xs text-gray-600 mt-3 leading-relaxed">{d.desc}</p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => loginAs(d.role)}
                      className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-[#F97316] bg-orange-50 hover:bg-orange-100 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>Simulate Workspace</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
