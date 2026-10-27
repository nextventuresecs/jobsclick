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
import {
  ShieldCheck,
  Building2,
  Lock,
  UserCheck,
} from 'lucide-react';

export default function WorkspacePage() {
  const { currentUserRole, openAuthModal } = useApp();

  return (
    <div className="min-h-screen flex flex-col bg-[#F9FAFB]">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {currentUserRole === 'jobseeker' && <SeekerWorkspace />}
        {currentUserRole === 'employer' && <EmployerWorkspace />}
        {currentUserRole === 'institution' && <InstitutionWorkspace />}
        {currentUserRole === 'msme_dept' && <AdminWorkspace isMsmeDept={true} />}
        {currentUserRole === 'platform_admin' && <AdminWorkspace isMsmeDept={false} />}

        {/* Unauthenticated Production Gateway */}
        {!currentUserRole && (
          <div className="max-w-2xl mx-auto py-12 px-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-3xl p-8 sm:p-12 border border-gray-200 shadow-sm text-center space-y-6">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center text-[#C2410C]">
                <Lock className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                  Sign In to Access Your Workspace
                </h1>
                <p className="text-sm text-gray-600 max-w-lg mx-auto leading-relaxed">
                  JobsClick provides dedicated, secure environments for candidates, verified MSME employers, vocational placement cells, and state facilitation directorates.
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row justify-center gap-3">
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={() => openAuthModal('jobseeker')}
                  className="font-semibold"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Job Seeker Sign In</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => openAuthModal('employer')}
                  className="font-semibold"
                >
                  <Building2 className="w-4 h-4" />
                  <span>Employer & Institution Sign In</span>
                </Button>
              </div>

              {/* Trust Indicators */}
              <div className="pt-6 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-gray-50 border border-gray-200/60">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs font-bold text-gray-900 block">Candidate Privacy Protection</span>
                    <span className="text-[11px] text-gray-500">Contact details stay protected. Hiring occurs via verified platform channels.</span>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-gray-50 border border-gray-200/60">
                  <Building2 className="w-4 h-4 text-[#C2410C] shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs font-bold text-gray-900 block">Verified MSME Direct Hiring</span>
                    <span className="text-[11px] text-gray-500">Direct connections between certified enterprises and qualified candidates.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
