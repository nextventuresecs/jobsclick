'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useApp } from '../../context/AppContext';
import {
  InstitutionHeader,
  InstitutionProfileCard,
  InstitutionProfileForm,
  StudentDirectoryTable,
  QuickAddStudentForm,
  BulkUploadModal,
  InviteWaveScheduler,
  CampusQrCard,
  InstitutionOverviewTab,
  InstitutionCmsEditor,
  useInstitutionWorkspace,
} from './institution';
import {
  GraduationCap,
  Award,
  Users,
  FileSpreadsheet,
  Send,
  QrCode,
  LayoutDashboard,
  MessageSquare,
} from 'lucide-react';

export function InstitutionWorkspace() {
  const t = useTranslations('InstitutionWorkspace');
  const { addToast } = useApp();

  const {
    activeTab,
    setActiveTab,
    institution,
    isOnboardingComplete,
    isEditingProfile,
    setIsEditingProfile,
    students,
    filteredStudents,
    studentSearch,
    setStudentSearch,
    streamFilter,
    setStreamFilter,
    statusFilter,
    setStatusFilter,
    isAddingStudent,
    setIsAddingStudent,
    profileForm,
    bulkUpload,
    quickAddFormData,
    handleDownloadTemplate,
    handleParseCsv,
    handleExecuteImport,
    handleScheduleWave,
    handleQuickAddStudent,
    handleSaveProfile,
  } = useInstitutionWorkspace({ addToast });

  return (
    <div className="space-y-8">
      {/* Header */}
      <InstitutionHeader
        institution={institution}
        isOnboardingComplete={isOnboardingComplete}
        onOpenProfileEdit={() => {
          setActiveTab('profile');
          setIsEditingProfile(true);
        }}
        onOpenBulkImport={() => {
          setActiveTab('bulk-import');
          bulkUpload.setImportStep(1);
        }}
        onOpenQrCode={() => setActiveTab('qr-code')}
      />

      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto gap-2">
        {(
          [
            { id: 'overview', label: t('tabOverview'), icon: GraduationCap },
            { id: 'cms', label: t('tabCms'), icon: LayoutDashboard },
            { id: 'inquiries', label: t('tabInquiries'), icon: MessageSquare },
            { id: 'profile', label: t('tabProfile'), icon: Award },
            { id: 'students', label: `${t('tabStudents')} (${students.length})`, icon: Users },
            { id: 'bulk-import', label: t('tabBulkImport'), icon: FileSpreadsheet },
            { id: 'invitations', label: t('tabInvitations'), icon: Send },
            { id: 'qr-code', label: t('tabQrCode'), icon: QrCode },
          ] as const
        ).map((tab) => {
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
        <InstitutionOverviewTab
          institution={institution}
          students={students}
          onViewProfile={() => {
            setActiveTab('profile');
            setIsEditingProfile(false);
          }}
          onViewStudents={() => setActiveTab('students')}
        />
      )}

      {/* TAB 2: CMS TAB EDITOR (INT-02 & AC #1) */}
      {activeTab === 'cms' && <InstitutionCmsEditor institutionId={institution.id} />}

      {/* TAB 3: INQUIRIES & LEADS (INT-03 & AC #2) */}
      {activeTab === 'inquiries' && <InstitutionCmsEditor institutionId={institution.id} />}

      {/* TAB 4: PROFILE */}
      {activeTab === 'profile' && (
        <>
          {!isEditingProfile ? (
            <InstitutionProfileCard
              institution={institution}
              onEdit={() => setIsEditingProfile(true)}
            />
          ) : (
            <InstitutionProfileForm
              formData={profileForm}
              onSubmit={handleSaveProfile}
              onCancel={() => setIsEditingProfile(false)}
            />
          )}
        </>
      )}

      {/* TAB 5: STUDENTS ROSTER */}
      {activeTab === 'students' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-6">
          {isAddingStudent && (
            <QuickAddStudentForm
              formData={quickAddFormData}
              onSubmit={handleQuickAddStudent}
              onCancel={() => setIsAddingStudent(false)}
            />
          )}
          <StudentDirectoryTable
            students={filteredStudents}
            totalStudentsCount={students.length}
            studentSearch={studentSearch}
            setStudentSearch={setStudentSearch}
            streamFilter={streamFilter}
            setStreamFilter={setStreamFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            isAddingStudent={isAddingStudent}
            onToggleAddStudent={() => setIsAddingStudent(!isAddingStudent)}
            onOpenBulkImport={() => {
              setActiveTab('bulk-import');
              bulkUpload.setImportStep(1);
            }}
            onShareCandidate={(st) => {
              addToast({
                type: 'info',
                title: 'Candidate Profile Link Ready',
                message: `Copied platform link for ${st.studentName} (Candidate Ref: ${st.id}). Direct contact details protected per Invariant #1.`,
              });
            }}
          />
        </div>
      )}

      {/* TAB 6: BULK CSV IMPORT */}
      {activeTab === 'bulk-import' && (
        <BulkUploadModal
          uploadState={bulkUpload}
          onDownloadTemplate={handleDownloadTemplate}
          onDirectFileUpload={(f) => bulkUpload.handleDirectFileUpload(f)}
          onParseCsv={handleParseCsv}
          onExecuteImport={handleExecuteImport}
          onScheduleWave={handleScheduleWave}
          onViewStudents={() => {
            bulkUpload.setImportStep(1);
            setActiveTab('students');
          }}
        />
      )}

      {/* TAB 7: INVITATIONS */}
      {activeTab === 'invitations' && <InviteWaveScheduler />}

      {/* TAB 8: CAMPUS QR */}
      {activeTab === 'qr-code' && <CampusQrCard institution={institution} />}
    </div>
  );
}
