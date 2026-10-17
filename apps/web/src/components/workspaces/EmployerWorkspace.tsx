'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useApp } from '../../context/AppContext';
import {
  EmployerHeader,
  CompanyProfileCard,
  CompanyProfileForm,
  EmployerOverviewTab,
  EmployerJobList,
  JobPostForm,
  ApplicantTable,
  ApplicantDetailModal,
  WalkInQrCard,
} from './employer';
import { useEmployerWorkspace } from './employer/useEmployerWorkspace';
import { Briefcase, Eye, PlusCircle, Users, Building2, QrCode } from 'lucide-react';

export function EmployerWorkspace() {
  const t = useTranslations('EmployerWorkspace');
  const { user, accessToken, addToast } = useApp();

  const {
    activeTab, setActiveTab, company, isOnboardingComplete,
    isEditingProfile, setIsEditingProfile, companyJobs, applicants,
    filteredApplicants, viewingApplicant, setViewingApplicant,
    handlePostJob, handleUpdateStatus, handleSaveProfile,
    applicantSearch, setApplicantSearch, statusFilter, setStatusFilter,
    editFormData, postJobState,
  } = useEmployerWorkspace({ user, accessToken, addToast });

  return (
    <div className="space-y-8">
      {/* Employer Header & KYC Alert */}
      <EmployerHeader
        company={company}
        isOnboardingComplete={isOnboardingComplete}
        onOpenProfileEdit={() => { setActiveTab('profile'); setIsEditingProfile(true); }}
        onOpenPostJob={() => setActiveTab('post-job')}
        onOpenQrPoster={() => setActiveTab('qr-code')}
      />

      {/* Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto gap-2">
        {([
          { id: 'overview', label: t('tabOverview'), icon: Briefcase },
          { id: 'manage-jobs', label: `${t('tabManageJobs')} (${companyJobs.length})`, icon: Eye },
          { id: 'post-job', label: t('tabPostJob'), icon: PlusCircle },
          { id: 'applicants', label: `${t('tabApplicants')} (${applicants.length})`, icon: Users },
          { id: 'profile', label: t('tabProfile'), icon: Building2 },
          { id: 'qr-code', label: t('tabWalkinPoster'), icon: QrCode },
        ] as const).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'border-[#F97316] text-[#EA580C] bg-[#FFF0E5]/30'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <EmployerOverviewTab
          companyJobs={companyJobs}
          applicants={applicants}
          onManageJobs={() => setActiveTab('manage-jobs')}
        />
      )}

      {/* TAB 2: PROFILE */}
      {activeTab === 'profile' && (
        <>
          {!isEditingProfile ? (
            <CompanyProfileCard
              company={company}
              onEdit={() => setIsEditingProfile(true)}
            />
          ) : (
            <CompanyProfileForm
              formData={editFormData}
              onSubmit={handleSaveProfile}
              onCancel={() => setIsEditingProfile(false)}
            />
          )}
        </>
      )}

      {/* TAB 3: MANAGE JOBS */}
      {activeTab === 'manage-jobs' && (
        <EmployerJobList
          jobs={companyJobs}
          onPostNewJob={() => setActiveTab('post-job')}
          onReviewApplicants={() => setActiveTab('applicants')}
        />
      )}

      {/* TAB 4: POST A VACANCY */}
      {activeTab === 'post-job' && (
        <JobPostForm
          formData={postJobState}
          formErrors={postJobState.formErrors}
          successNotice={postJobState.successNotice}
          onSubmit={handlePostJob}
        />
      )}

      {/* TAB 5: APPLICANTS PIPELINE */}
      {activeTab === 'applicants' && (
        <>
          <ApplicantTable
            applicants={filteredApplicants}
            applicantSearch={applicantSearch}
            setApplicantSearch={setApplicantSearch}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            onViewApplicant={(app) => setViewingApplicant(app)}
            onUpdateStatus={handleUpdateStatus}
          />
          <ApplicantDetailModal
            applicant={viewingApplicant}
            onClose={() => setViewingApplicant(null)}
            onUpdateStatus={handleUpdateStatus}
          />
        </>
      )}

      {/* TAB 6: WALK-IN QR POSTER */}
      {activeTab === 'qr-code' && <WalkInQrCard company={company} />}
    </div>
  );
}
