'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppContext } from '@/context/AppContext';
import { SeekerWorkspace } from '../../components/workspaces/SeekerWorkspace';
import { EmployerWorkspace } from '../../components/workspaces/EmployerWorkspace';
import { InstitutionWorkspace } from '../../components/workspaces/InstitutionWorkspace';
import { AdminWorkspace } from '../../components/workspaces/AdminWorkspace';

function WorkspaceSkeleton() {
  return (
    <div
      className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
      role="status"
      aria-label="Loading workspace"
    >
      <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-200" />
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="h-36 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-36 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-36 animate-pulse rounded-2xl bg-slate-100" />
      </div>
      <div className="mt-8 h-96 animate-pulse rounded-2xl bg-slate-100" />
    </div>
  );
}

export default function WorkspacePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoadingSession, openAuthModal } = useAppContext();

  useEffect(() => {
    if (!isLoadingSession && !isAuthenticated) {
      openAuthModal('job_seeker');
      router.replace('/');
    }
  }, [isLoadingSession, isAuthenticated, openAuthModal, router]);

  if (isLoadingSession || !isAuthenticated || !user) {
    return <WorkspaceSkeleton />;
  }

  switch (user.role) {
    case 'job_seeker':
      return <SeekerWorkspace />;
    case 'employer':
      return <EmployerWorkspace />;
    case 'intermediary':
      return <InstitutionWorkspace />;
    case 'msme_admin':
    case 'admin':
      return <AdminWorkspace />;
    default:
      return <WorkspaceSkeleton />;
  }
}
