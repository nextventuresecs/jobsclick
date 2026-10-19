'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Briefcase, Clock, User, FileText } from 'lucide-react';
import {
  SeekerHeader,
  SeekerProfileCard,
  SeekerOverviewTab,
  SeekerApplicationsList,
  SeekerDigitalCvPreview,
  SeekerProfileForm,
  useSeekerWorkspace,
} from './seeker';

export function SeekerWorkspace() {
  const t = useTranslations('SeekerWorkspace');
  const {
    activeTab,
    setActiveTab,
    profile,
    myApplications,
    recommendedJobs,
    isOnboardingComplete,
    isEditing,
    setIsEditing,
    formData,
    updateField,
    handleSaveProfile,
    handlePrint,
  } = useSeekerWorkspace();

  return (
    <div className="space-y-8">
      <SeekerHeader
        profile={profile}
        isOnboardingComplete={isOnboardingComplete}
        onOpenCvPreview={() => setActiveTab('cv-preview')}
        onCompleteProfile={() => {
          setActiveTab('profile');
          setIsEditing(true);
        }}
      />

      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto gap-2">
        {([
          { id: 'overview', label: t('tabOverview'), icon: Briefcase },
          { id: 'applications', label: `${t('tabApplications')} (${myApplications.length})`, icon: Clock },
          { id: 'profile', label: t('tabProfile'), icon: User },
          { id: 'cv-preview', label: t('tabCvPreview'), icon: FileText },
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
        <SeekerOverviewTab
          myApplications={myApplications}
          recommendedJobs={recommendedJobs}
          onNavigateToApplications={() => setActiveTab('applications')}
        />
      )}

      {/* TAB 2: APPLICATIONS */}
      {activeTab === 'applications' && (
        <SeekerApplicationsList myApplications={myApplications} />
      )}

      {/* TAB 3: PROFILE & ONBOARDING KYC */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          {!isEditing ? (
            <SeekerProfileCard
              profile={profile}
              onEdit={() => setIsEditing(true)}
            />
          ) : (
            <SeekerProfileForm
              formData={formData}
              updateField={updateField}
              onSubmit={handleSaveProfile}
              onCancel={() => setIsEditing(false)}
            />
          )}
        </div>
      )}

      {/* TAB 4: CV PREVIEW & PRINT */}
      {activeTab === 'cv-preview' && (
        <SeekerDigitalCvPreview
          profile={profile}
          onPrint={handlePrint}
        />
      )}
    </div>
  );
}
