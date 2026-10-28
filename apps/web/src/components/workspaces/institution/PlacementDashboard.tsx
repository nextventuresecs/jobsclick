'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@indian-job-portal/ui';
import type {
  InstitutionProfileData,
  StudentRecordData,
  CorporateTieUpData,
  PlacementApplicationRecord,
} from '../../../data/sampleWorkspaces';
import {
  filterStudentsMultiSelect,
  maskContactNumber,
  maskEmailAddress,
} from './studentUtils';
import {
  Users,
  Briefcase,
  Building2,
  Award,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ShieldCheck,
  PlusCircle,
  X,
  FileCheck,
  CheckSquare,
  Square,
  Sparkles,
  Send,
  FileText,
  Printer,
} from 'lucide-react';

interface PlacementDashboardProps {
  readonly institution: InstitutionProfileData;
  readonly students: readonly StudentRecordData[];
  readonly onUpdateStudents?: (students: readonly StudentRecordData[]) => void;
  readonly tieUps?: readonly CorporateTieUpData[];
  readonly onUpdateTieUps?: (tieUps: readonly CorporateTieUpData[]) => void;
  readonly applications?: readonly PlacementApplicationRecord[];
  readonly onUpdateApplications?: (applications: readonly PlacementApplicationRecord[]) => void;
}

export function PlacementDashboard({
  institution,
  students,
  onUpdateStudents,
  tieUps: externalTieUps,
  onUpdateTieUps,
  applications: externalApplications,
  onUpdateApplications,
}: PlacementDashboardProps) {
  const t = useTranslations('PlacementDashboard');

  // Local student state with fallback if parent didn't pass update callback
  const [localStudentList, setLocalStudentList] = useState<readonly StudentRecordData[]>(students);
  useEffect(() => {
    setLocalStudentList(students);
  }, [students]);

  const studentList = onUpdateStudents ? students : localStudentList;
  const updateStudents = (newStudents: readonly StudentRecordData[]) => {
    if (onUpdateStudents) {
      onUpdateStudents(newStudents);
    } else {
      setLocalStudentList(newStudents);
    }
  };

  // Corporate Tie-Ups state (lifted or local fallback)
  const [localTieUps, setLocalTieUps] = useState<readonly CorporateTieUpData[]>([]);
  const tieUps = externalTieUps ?? localTieUps;
  const updateTieUps = (newTieUps: readonly CorporateTieUpData[]) => {
    if (onUpdateTieUps) {
      onUpdateTieUps(newTieUps);
    } else {
      setLocalTieUps(newTieUps);
    }
  };

  // Placement Applications Pipeline state (lifted or local fallback)
  const [localApplications, setLocalApplications] = useState<readonly PlacementApplicationRecord[]>([]);
  const applications = externalApplications ?? localApplications;
  const updateApplications = (newApps: readonly PlacementApplicationRecord[]) => {
    if (onUpdateApplications) {
      onUpdateApplications(newApps);
    } else {
      setLocalApplications(newApps);
    }
  };

  // Sub-tab selection
  const [activeSubTab, setActiveSubTab] = useState<'readiness' | 'tieups' | 'pipeline'>('readiness');

  // Multi-select filter states
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [readinessStatus, setReadinessStatus] = useState<
    'all' | 'profile_completed' | 'pending_otp' | 'available' | 'placed' | 'in_process'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected student rows for batch actions
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // Batch sharing modal state
  const [isShareBatchModalOpen, setIsShareBatchModalOpen] = useState(false);
  const [shareCompanyId, setShareCompanyId] = useState(externalTieUps?.[0]?.id ?? '');

  useEffect(() => {
    if (!shareCompanyId && externalTieUps && externalTieUps.length > 0) {
      setShareCompanyId(externalTieUps[0]!.id);
    }
  }, [externalTieUps, shareCompanyId]);
  const [shareDriveSubject, setShareDriveSubject] = useState('');
  const [batchSuccessMessage, setBatchSuccessMessage] = useState<string | null>(null);

  // Brochure modal state
  const [isBrochureModalOpen, setIsBrochureModalOpen] = useState(false);

  // Pipeline filter state
  const [pipelineStageFilter, setPipelineStageFilter] = useState<
    'all' | 'applied' | 'shortlisted' | 'interview' | 'offered' | 'placed'
  >('all');

  // Modal forms
  const [isEmpanelModalOpen, setIsEmpanelModalOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newSector, setNewSector] = useState('');
  const [newPreferredTrades, setNewPreferredTrades] = useState('');
  const [newContactPerson, setNewContactPerson] = useState('');

  // Available filter options derived DYNAMICALLY from institution courses and enrolled student roster
  const availableTrades = useMemo(() => {
    const set = new Set<string>();
    if (institution.tradesOffered) {
      institution.tradesOffered.forEach((t) => set.add(t));
    }
    studentList.forEach((s) => {
      if (s.trade) set.add(s.trade);
      if (s.stream) set.add(s.stream);
    });
    return Array.from(set).sort();
  }, [institution.tradesOffered, studentList]);

  const availableYears = useMemo(() => {
    const set = new Set<string>();
    studentList.forEach((s) => {
      if (s.passingYear) set.add(s.passingYear);
    });
    return Array.from(set).sort();
  }, [studentList]);

  const availableGrades = useMemo(() => {
    const set = new Set<string>();
    studentList.forEach((s) => {
      if (s.grade) set.add(s.grade);
    });
    return Array.from(set).sort();
  }, [studentList]);

  const availableSkills = useMemo(() => {
    const set = new Set<string>();
    studentList.forEach((s) => {
      s.skills?.forEach((sk) => set.add(sk));
    });
    return Array.from(set).sort();
  }, [studentList]);

  // Lookup maps replacing chained switches/ternaries (Baseline Smells cleanup)
  const STAGE_LABEL_MAP: Record<PlacementApplicationRecord['stage'], string> = useMemo(
    () => ({
      applied: t('stageBadgeApplied'),
      shortlisted: t('stageBadgeShortlisted'),
      interview: t('stageBadgeInterview'),
      offered: t('stageBadgeOffered'),
      placed: t('stageBadgePlaced'),
      rejected: t('stageBadgeRejected'),
    }),
    [t],
  );

  const STAGE_STYLE_MAP: Record<PlacementApplicationRecord['stage'], string> = {
    placed: 'bg-emerald-100 text-emerald-900 border border-emerald-300',
    offered: 'bg-purple-100 text-purple-900 border border-purple-300',
    interview: 'bg-blue-100 text-blue-900 border border-blue-300',
    shortlisted: 'bg-amber-100 text-amber-900 border border-amber-300',
    rejected: 'bg-red-100 text-red-900 border border-red-300',
    applied: 'bg-gray-100 text-gray-800 border border-gray-300',
  };

  const STATUS_LABEL_MAP: Record<StudentRecordData['placementStatus'], string> = useMemo(
    () => ({
      Available: t('statusAvailable'),
      Placed: t('statusPlaced'),
      'In Process': t('statusInProcess'),
    }),
    [t],
  );

  const STATUS_STYLE_MAP: Record<StudentRecordData['placementStatus'], string> = {
    Placed: 'text-emerald-700',
    'In Process': 'text-purple-700',
    Available: 'text-blue-700',
  };

  // Filtered students using multi-select engine
  const filteredStudents = useMemo(() => {
    return filterStudentsMultiSelect(studentList, {
      trades: selectedTrades,
      passingYears: selectedYears,
      grades: selectedGrades,
      skills: selectedSkills,
      readinessStatus,
      search: searchQuery,
    });
  }, [studentList, selectedTrades, selectedYears, selectedGrades, selectedSkills, readinessStatus, searchQuery]);

  // Filtered applications for pipeline tab
  const filteredApplications = useMemo(() => {
    if (pipelineStageFilter === 'all') return applications;
    return applications.filter((app) => app.stage === pipelineStageFilter);
  }, [applications, pipelineStageFilter]);

  // Metrics
  const totalEnrolled = studentList.length;
  const profileReadyCount = studentList.filter((s) => s.profileCompleted).length;
  const activeTieUpsCount = tieUps.filter((t) => t.partnershipStatus === 'active' || t.partnershipStatus === 'mou_signed').length;
  const totalOffersCount = applications.filter((a) => a.stage === 'offered' || a.stage === 'placed').length;

  // Toggle filter pill helper
  const toggleSelection = (list: string[], setList: (vals: string[]) => void, item: string) => {
    if (list.includes(item)) {
      setList(list.filter((x) => x !== item));
    } else {
      setList([...list, item]);
    }
  };

  const handleResetFilters = () => {
    setSelectedTrades([]);
    setSelectedYears([]);
    setSelectedGrades([]);
    setSelectedSkills([]);
    setReadinessStatus('all');
    setSearchQuery('');
    setSelectedStudentIds([]);
  };

  const handleSelectAllFiltered = () => {
    if (selectedStudentIds.length === filteredStudents.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(filteredStudents.map((s) => s.id));
    }
  };

  const handleToggleStudent = (id: string) => {
    if (selectedStudentIds.includes(id)) {
      setSelectedStudentIds(selectedStudentIds.filter((sid) => sid !== id));
    } else {
      setSelectedStudentIds([...selectedStudentIds, id]);
    }
  };

  const handleEmpanelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim()) return;

    const newTieUp: CorporateTieUpData = {
      id: `tieup-${Date.now()}`,
      institutionId: institution.id,
      employerId: `comp-${Date.now()}`,
      companyName: newCompanyName.trim(),
      sector: newSector.trim() || 'Manufacturing',
      partnershipStatus: 'mou_signed',
      preferredTrades: newPreferredTrades ? newPreferredTrades.split(',').map((t) => t.trim()) : ['CNC Machinist'],
      activeCampusDrives: 1,
      totalOffersIssued: 0,
      partneredSince: new Date().toISOString().split('T')[0] ?? '2026-10-21',
      contactPerson: newContactPerson.trim() || 'Campus Relations Head',
    };

    updateTieUps([newTieUp, ...tieUps]);
    setIsEmpanelModalOpen(false);
    setNewCompanyName('');
    setNewSector('');
    setNewPreferredTrades('');
    setNewContactPerson('');
  };

  const handleAdvanceStage = (appId: string) => {
    const targetApp = applications.find((a) => a.id === appId);
    if (!targetApp) return;

    const nextStageMap: Record<PlacementApplicationRecord['stage'], PlacementApplicationRecord['stage']> = {
      applied: 'shortlisted',
      shortlisted: 'interview',
      interview: 'offered',
      offered: 'placed',
      placed: 'placed',
      rejected: 'rejected',
    };
    const next = nextStageMap[targetApp.stage];

    const nextApps = applications.map((app) => {
      if (app.id !== appId) return app;
      return {
        ...app,
        stage: next,
        updatedAt: new Date().toISOString().split('T')[0] ?? '2026-10-21',
      };
    });
    updateApplications(nextApps);

    // Synchronize candidate status in student roster when placed
    if (next === 'placed') {
      updateStudents(
        studentList.map((st) => (st.id === targetApp.studentId ? { ...st, placementStatus: 'Placed' } : st)),
      );
    }
  };

  const handleRejectStage = (appId: string) => {
    const targetApp = applications.find((a) => a.id === appId);
    if (!targetApp) return;

    const nextApps = applications.map((app) => {
      if (app.id !== appId) return app;
      return {
        ...app,
        stage: 'rejected' as const,
        updatedAt: new Date().toISOString().split('T')[0] ?? '2026-10-21',
      };
    });
    updateApplications(nextApps);

    // Revert status to Available if candidate has no other active applications
    const hasOtherActive = nextApps.some(
      (a) => a.studentId === targetApp.studentId && a.stage !== 'rejected' && a.stage !== 'placed',
    );
    if (!hasOtherActive) {
      updateStudents(
        studentList.map((st) => (st.id === targetApp.studentId ? { ...st, placementStatus: 'Available' } : st)),
      );
    }
  };

  const handleShareBatchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedCompany = tieUps.find((t) => t.id === shareCompanyId) || tieUps[0];
    if (!selectedCompany || selectedStudentIds.length === 0) return;

    const targetStudents = studentList.filter((s) => selectedStudentIds.includes(s.id));
    const nowStr = new Date().toISOString().split('T')[0] ?? '2026-10-21';

    const newApps: PlacementApplicationRecord[] = targetStudents.map((st) => ({
      id: `app-pl-${Date.now()}-${st.id}`,
      studentId: st.id,
      studentName: st.studentName,
      rollNumber: st.rollNumber,
      trade: st.trade || st.stream,
      passingYear: st.passingYear,
      grade: st.grade || 'First Class',
      jobId: `campus-job-${selectedCompany.id}`,
      jobTitle: `${shareDriveSubject.trim() || 'Campus Drive'} Trainee`,
      companyName: selectedCompany.companyName,
      isPartneredEmployer: true,
      stage: 'applied',
      updatedAt: nowStr,
    }));

    updateApplications([...newApps, ...applications]);
    updateStudents(
      studentList.map((st) =>
        selectedStudentIds.includes(st.id) && st.placementStatus === 'Available'
          ? { ...st, placementStatus: 'In Process' }
          : st,
      ),
    );

    setBatchSuccessMessage(
      t('toastBatchShared', {
        count: selectedStudentIds.length,
        company: selectedCompany.companyName,
      }),
    );
    setSelectedStudentIds([]);
    setIsShareBatchModalOpen(false);
    setShareDriveSubject('');
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-orange-950 p-6 sm:p-8 rounded-2xl text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/20 text-orange-300 text-xs font-semibold border border-orange-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{institution.affiliationCode || t('defaultAffiliation')}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight">{t('title')}</h1>
            <p className="text-xs sm:text-sm text-gray-300 max-w-2xl">{t('subheading')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setActiveSubTab('tieups');
                setIsEmpanelModalOpen(true);
              }}
              className="bg-white/10 text-white border-white/20 hover:bg-white/20 text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Building2 className="w-4 h-4 text-orange-400" />
              <span>{t('btnEmpanelPartner')}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Executive Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">{t('statTotalStudents')}</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-extrabold text-gray-900 mt-2">{totalEnrolled}</p>
          <span className="text-[11px] text-gray-400 block mt-0.5">{t('statTotalStudentsDesc')}</span>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">{t('statProfileReady')}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-700 mt-2">
            {profileReadyCount} <span className="text-xs font-medium text-gray-400">({totalEnrolled > 0 ? Math.round((profileReadyCount / totalEnrolled) * 100) : 0}%)</span>
          </p>
          <span className="text-[11px] text-gray-400 block mt-0.5">{t('statProfileReadyDesc')}</span>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">{t('statActiveTieUps')}</span>
            <Building2 className="w-4 h-4 text-orange-600" />
          </div>
          <p className="text-2xl font-extrabold text-orange-700 mt-2">{activeTieUpsCount}</p>
          <span className="text-[11px] text-gray-400 block mt-0.5">{t('statActiveTieUpsDesc')}</span>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">{t('statOffersIssued')}</span>
            <Award className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-2xl font-extrabold text-purple-700 mt-2">{totalOffersCount}</p>
          <span className="text-[11px] text-gray-400 block mt-0.5">{t('statOffersIssuedDesc')}</span>
        </div>
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="flex border-b border-gray-200 gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveSubTab('readiness')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'readiness'
              ? 'border-orange-500 text-orange-600 bg-orange-50/40'
              : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>{t('subTabReadiness')} ({filteredStudents.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('tieups')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'tieups'
              ? 'border-orange-500 text-orange-600 bg-orange-50/40'
              : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>{t('subTabTieUps')} ({tieUps.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('pipeline')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'pipeline'
              ? 'border-orange-500 text-orange-600 bg-orange-50/40'
              : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          <span>{t('subTabPipeline')} ({applications.length})</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* SUB-TAB 1: STUDENT ROSTER & READINESS WITH MULTI-SELECT   */}
      {/* ========================================================= */}
      {activeSubTab === 'readiness' && (
        <div className="space-y-6">
          {/* Multi-Select Filter Panel */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-900">
                <Filter className="w-4 h-4 text-orange-500" />
                <span>{t('multiSelectFilterTitle')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResetFilters}
                  className="text-xs text-gray-600 hover:text-gray-900"
                >
                  {t('btnResetFilters')}
                </Button>
              </div>
            </div>

            {/* Search Input & Readiness Dropdown */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                />
              </div>

              <div>
                <select
                  value={readinessStatus}
                  onChange={(e) => setReadinessStatus(e.target.value as typeof readinessStatus)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 bg-white"
                >
                  <option value="all">{t('readinessAll')}</option>
                  <option value="profile_completed">{t('readinessComplete')}</option>
                  <option value="pending_otp">{t('readinessPending')}</option>
                  <option value="available">{t('readinessAvailable')}</option>
                  <option value="placed">{t('readinessPlaced')}</option>
                  <option value="in_process">{t('readinessInProcess')}</option>
                </select>
              </div>
            </div>

            {/* Trade Multi-Select Pills */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 block">
                {t('filterTrades')}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {availableTrades.map((trade) => {
                  const isSelected = selectedTrades.includes(trade);
                  return (
                    <button
                      key={trade}
                      type="button"
                      onClick={() => toggleSelection(selectedTrades, setSelectedTrades, trade)}
                      className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-orange-500 text-white border-orange-600 shadow-2xs'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {trade}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Passing Year & Grade Multi-Select Pills */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 block">
                  {t('filterYears')}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {availableYears.map((year) => {
                    const isSelected = selectedYears.includes(year);
                    return (
                      <button
                        key={year}
                        type="button"
                        onClick={() => toggleSelection(selectedYears, setSelectedYears, year)}
                        className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {year}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 block">
                  {t('filterGrades')}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {availableGrades.map((grade) => {
                    const isSelected = selectedGrades.includes(grade);
                    return (
                      <button
                        key={grade}
                        type="button"
                        onClick={() => toggleSelection(selectedGrades, setSelectedGrades, grade)}
                        className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {grade}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Technical Skills Multi-Select Tag Cloud */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 block">
                {t('filterSkills')}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {availableSkills.map((skill) => {
                  const isSelected = selectedSkills.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSelection(selectedSkills, setSelectedSkills, skill)}
                      className={`text-xs px-2.5 py-0.5 rounded-full border transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-purple-600 text-white border-purple-700 shadow-2xs font-semibold'
                          : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 font-medium'
                      }`}
                    >
                      + {skill}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50 p-3.5 rounded-xl border border-gray-200">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 hover:text-gray-900 cursor-pointer"
              >
                {selectedStudentIds.length === filteredStudents.length && filteredStudents.length > 0 ? (
                  <CheckSquare className="w-4 h-4 text-orange-600" />
                ) : (
                  <Square className="w-4 h-4 text-gray-400" />
                )}
                <span>
                  {selectedStudentIds.length === filteredStudents.length && filteredStudents.length > 0
                    ? t('btnClearSelection')
                    : t('btnSelectAll')}
                </span>
              </button>

              {selectedStudentIds.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-800 font-bold border border-orange-200">
                    {t('candidatesSelected', { count: selectedStudentIds.length })}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-orange-600 hover:bg-orange-700 text-white text-xs h-7 px-2.5 shadow-2xs inline-flex items-center gap-1.5"
                    onClick={() => setIsShareBatchModalOpen(true)}
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{t('btnShareBatch')}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 px-2.5 inline-flex items-center gap-1.5 border-gray-300 text-gray-700 hover:bg-gray-100"
                    onClick={() => setIsBrochureModalOpen(true)}
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    <span>{t('btnGenerateBrochure')}</span>
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1 text-[11px] text-gray-500 bg-white px-2.5 py-1 rounded-lg border border-gray-200" title={t('contactMaskedTooltip')}>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>{t('piiMaskedBadge')}</span>
              </div>
            </div>
          </div>

          {batchSuccessMessage && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{batchSuccessMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setBatchSuccessMessage(null)}
                className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Candidates Roster Table */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-2xs">
            {filteredStudents.length === 0 ? (
              <div className="text-center py-12 px-4 space-y-2">
                <Users className="w-8 h-8 text-gray-300 mx-auto" />
                <p className="text-xs font-medium text-gray-500">{t('noStudentsFound')}</p>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-xs font-bold text-orange-600 hover:underline cursor-pointer"
                >
                  {t('btnResetFilters')}
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-4 w-10">#</th>
                      <th className="py-3 px-4">{t('colCandidate')}</th>
                      <th className="py-3 px-4">{t('colTrade')}</th>
                      <th className="py-3 px-4">{t('colBatchGrade')}</th>
                      <th className="py-3 px-4">{t('colSkills')}</th>
                      <th className="py-3 px-4">{t('colStatus')}</th>
                      <th className="py-3 px-4">{t('colContact')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredStudents.map((st) => {
                      const isChecked = selectedStudentIds.includes(st.id);
                      return (
                        <tr
                          key={st.id}
                          className={`hover:bg-gray-50/80 transition-colors ${
                            isChecked ? 'bg-orange-50/40' : ''
                          }`}
                        >
                          <td className="py-3.5 px-4">
                            <button
                              type="button"
                              onClick={() => handleToggleStudent(st.id)}
                              className="text-gray-400 hover:text-orange-600 cursor-pointer"
                            >
                              {isChecked ? (
                                <CheckSquare className="w-4 h-4 text-orange-600" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-gray-900">{st.studentName}</div>
                            <div className="text-[11px] font-mono text-gray-500">{st.rollNumber}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-gray-800">{st.trade || st.stream}</span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-medium text-gray-700">{t('batchYear', { year: st.passingYear })}</div>
                            {st.grade && (
                              <span className="inline-block text-[11px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 mt-0.5">
                                {st.grade}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {st.skills && st.skills.length > 0 ? (
                                st.skills.slice(0, 3).map((sk, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[10px] font-medium border border-purple-100"
                                  >
                                    {sk}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[11px] text-gray-400 italic">{t('selfAssessmentPending')}</span>
                              )}
                              {st.skills && st.skills.length > 3 && (
                                <span className="text-[10px] text-gray-400 self-center">
                                  +{st.skills.length - 3}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="space-y-1">
                              <span
                                className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  st.profileCompleted
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                                }`}
                              >
                                {st.profileCompleted ? t('statusVerified') : t('statusPendingClaim')}
                              </span>
                              <span
                                className={`block text-[11px] font-bold ${
                                  STATUS_STYLE_MAP[st.placementStatus] || 'text-blue-700'
                                }`}
                              >
                                {STATUS_LABEL_MAP[st.placementStatus] || st.placementStatus}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="space-y-0.5" title={t('contactMaskedTooltip')}>
                              <span className="font-mono text-gray-600 block text-[11px]">
                                {maskContactNumber(st.phone)}
                              </span>
                              <span className="font-mono text-gray-400 block text-[10px]">
                                {maskEmailAddress(st.email)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUB-TAB 2: CORPORATE MSME TIE-UPS                         */}
      {/* ========================================================= */}
      {activeSubTab === 'tieups' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900">{t('tieUpsHeading')}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{t('tieUpsSubheading')}</p>
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setIsEmpanelModalOpen(true)}
              className="inline-flex items-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{t('btnEmpanelPartner')}</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tieUps.map((tieUp) => (
              <div
                key={tieUp.id}
                className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs hover:shadow-xs transition-shadow space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-gray-900">{tieUp.companyName}</h3>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          tieUp.partnershipStatus === 'active'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : tieUp.partnershipStatus === 'mou_signed'
                            ? 'bg-blue-50 text-blue-800 border border-blue-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {tieUp.partnershipStatus === 'active'
                          ? t('statusActive')
                          : tieUp.partnershipStatus === 'mou_signed'
                          ? t('statusMouSigned')
                          : t('statusPending')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{tieUp.sector}</p>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block">
                    {t('colPreferredTrades')}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {tieUp.preferredTrades.map((trade, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-lg bg-orange-50 text-orange-900 text-[11px] font-medium border border-orange-200"
                      >
                        {trade}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 text-xs">
                  <div>
                    <span className="text-gray-400 block text-[11px]">{t('activeDrives')}</span>
                    <span className="font-bold text-gray-900">
                      {t('activeDrivesCount', { count: tieUp.activeCampusDrives })}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[11px]">{t('offersIssued')}</span>
                    <span className="font-bold text-purple-700">
                      {t('offersCount', { count: tieUp.totalOffersIssued })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-[11px] text-gray-500">
                  <span>{t('liaisonPrefix')}: {tieUp.contactPerson}</span>
                  <span className="font-medium text-orange-600">{t('sincePrefix')} {tieUp.partneredSince}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUB-TAB 3: LIVE CAMPUS PLACEMENT PIPELINE                 */}
      {/* ========================================================= */}
      {activeSubTab === 'pipeline' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900">{t('pipelineHeading')}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{t('pipelineSubheading')}</p>
            </div>
          </div>

          {/* Stage Filter Buttons */}
          <div className="flex flex-wrap gap-2">
            {([
              { id: 'all', label: t('pipelineStageAll', { count: applications.length }) },
              { id: 'applied', label: t('pipelineStageApplied', { count: applications.filter((a) => a.stage === 'applied').length }) },
              { id: 'shortlisted', label: t('pipelineStageShortlisted', { count: applications.filter((a) => a.stage === 'shortlisted').length }) },
              { id: 'interview', label: t('pipelineStageInterview', { count: applications.filter((a) => a.stage === 'interview').length }) },
              { id: 'offered', label: t('pipelineStageOffered', { count: applications.filter((a) => a.stage === 'offered').length }) },
              { id: 'placed', label: t('pipelineStagePlaced', { count: applications.filter((a) => a.stage === 'placed').length }) },
            ] as const).map((stage) => {
              const isActive = pipelineStageFilter === stage.id;
              return (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => setPipelineStageFilter(stage.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    isActive
                      ? 'bg-orange-500 text-white border-orange-600 shadow-2xs'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {stage.label}
                </button>
              );
            })}
          </div>

          {/* Pipeline Applications List */}
          <div className="space-y-3">
            {filteredApplications.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-xs text-gray-500">
                {t('noApplicationsFound')}
              </div>
            ) : (
              filteredApplications.map((app) => (
                <div
                  key={app.id}
                  className="bg-white rounded-xl border border-gray-200 p-4 shadow-2xs hover:shadow-xs transition-shadow flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-gray-900 text-sm">{app.studentName}</span>
                      <span className="text-[11px] font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                        {app.rollNumber}
                      </span>
                      <span className="text-xs font-semibold text-gray-600">
                        {app.trade} ({app.passingYear})
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <span className="text-xs font-bold text-gray-800">{app.jobTitle}</span>
                      <span className="text-xs text-gray-400">•</span>
                      <span className="text-xs text-gray-600">{app.companyName}</span>
                      {app.isPartneredEmployer && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
                          <CheckCircle2 className="w-3 h-3 text-blue-600" />
                          <span>{t('campusPartnerBadge')}</span>
                        </span>
                      )}
                    </div>

                    {app.interviewDate && (
                      <div className="text-[11px] text-purple-700 flex items-center gap-1.5 pt-1">
                        <Clock className="w-3.5 h-3.5 text-purple-600" />
                        <span>{t('interviewPrefix')}: {app.interviewDate}</span>
                      </div>
                    )}

                    {app.offerPackage && (
                      <div className="text-[11px] text-emerald-800 font-bold flex items-center gap-1.5 pt-1">
                        <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{t('packagePrefix')}: {app.offerPackage}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <span
                      className={`text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-wider ${
                        STAGE_STYLE_MAP[app.stage] || 'bg-gray-100 text-gray-800 border border-gray-300'
                      }`}
                    >
                      {STAGE_LABEL_MAP[app.stage] || app.stage}
                    </span>

                    {app.stage !== 'placed' && app.stage !== 'rejected' && (
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleRejectStage(app.id)}
                          className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                        >
                          {t('btnRejectStage')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleAdvanceStage(app.id)}
                          className="text-xs font-bold text-gray-700 hover:text-orange-600"
                        >
                          {app.stage === 'offered' ? t('btnMarkPlaced') : t('btnUpdateStage')}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: EMPANEL NEW CORPORATE PARTNER                      */}
      {/* ========================================================= */}
      {isEmpanelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-5 border border-gray-200">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-orange-500" />
                <h3 className="text-base font-bold text-gray-900">{t('modalEmpanelTitle')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEmpanelModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">{t('modalEmpanelDesc')}</p>

            <form onSubmit={handleEmpanelSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">{t('labelCompanyName')}</label>
                <input
                  type="text"
                  required
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  placeholder={t('placeholderCompanyName')}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">{t('labelSector')}</label>
                <input
                  type="text"
                  value={newSector}
                  onChange={(e) => setNewSector(e.target.value)}
                  placeholder={t('placeholderSector')}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">{t('labelPreferredTrades')}</label>
                <input
                  type="text"
                  value={newPreferredTrades}
                  onChange={(e) => setNewPreferredTrades(e.target.value)}
                  placeholder={t('placeholderPreferredTrades')}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">{t('labelContactPerson')}</label>
                <input
                  type="text"
                  value={newContactPerson}
                  onChange={(e) => setNewContactPerson(e.target.value)}
                  placeholder={t('placeholderContactPerson')}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEmpanelModalOpen(false)}
                >
                  {t('btnCancel')}
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  {t('btnSubmitEmpanel')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: SHARE CANDIDATE BATCH WITH PARTNER                 */}
      {/* ========================================================= */}
      {isShareBatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5 border border-gray-200 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600">
                  <Send className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-gray-900 text-sm">{t('modalShareBatchTitle')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsShareBatchModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">{t('modalShareBatchDesc')}</p>

            <form onSubmit={handleShareBatchSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">{t('labelSelectPartner')}</label>
                <select
                  value={shareCompanyId}
                  onChange={(e) => setShareCompanyId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden bg-white text-gray-800"
                >
                  {tieUps.map((tu) => (
                    <option key={tu.id} value={tu.id}>
                      {tu.companyName} ({tu.sector})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">{t('labelCampusDriveSubject')}</label>
                <input
                  type="text"
                  required
                  value={shareDriveSubject}
                  onChange={(e) => setShareDriveSubject(e.target.value)}
                  placeholder={t('placeholderDriveSubject')}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                />
              </div>

              <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 text-orange-900 text-[11px] space-y-1">
                <span className="font-bold block">
                  {t('candidatesSelected', { count: selectedStudentIds.length })}
                </span>
                <span className="text-gray-600 block">{t('contactMaskedTooltip')}</span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsShareBatchModalOpen(false)}
                >
                  {t('btnCancel')}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-orange-600 hover:bg-orange-700 text-white font-bold"
                >
                  <Send className="w-3.5 h-3.5 mr-1" />
                  {t('btnDispatchBatch')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: VERIFIED CANDIDATE BROCHURE PREVIEW / EXPORT       */}
      {/* ========================================================= */}
      {isBrochureModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs print:p-0 print:bg-white print:static print:inset-auto">
          <style>{`
            @media print {
              body * {
                visibility: hidden !important;
              }
              #printable-candidate-brochure,
              #printable-candidate-brochure * {
                visibility: visible !important;
              }
              #printable-candidate-brochure {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                max-width: 100% !important;
                box-shadow: none !important;
                border: none !important;
                padding: 16px !important;
              }
              .no-print {
                display: none !important;
              }
            }
          `}</style>
          <div
            id="printable-candidate-brochure"
            className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5 border border-gray-200 max-h-[90vh] overflow-y-auto animate-in fade-in duration-150 print:max-h-none print:overflow-visible print:border-none print:shadow-none"
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 no-print">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">{t('modalBrochureTitle')}</h3>
                  <span className="text-[11px] text-gray-500">{institution.institutionName} • {institution.city}, {institution.state}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBrochureModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer no-print"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-3 text-xs text-blue-900">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                <span>{t('brochureSeal')}</span>
              </div>
              <span className="font-mono text-[11px] font-bold">
                {new Date().toISOString().split('T')[0]}
              </span>
            </div>

            <p className="text-xs text-gray-500">{t('modalBrochureDesc')}</p>

            <div className="border border-gray-200 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">{t('colCandidate')}</th>
                    <th className="py-2.5 px-3">{t('colTrade')}</th>
                    <th className="py-2.5 px-3">{t('colBatchGrade')}</th>
                    <th className="py-2.5 px-3">{t('colSkills')}</th>
                    <th className="py-2.5 px-3">{t('colContact')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {studentList
                    .filter((s) => selectedStudentIds.includes(s.id))
                    .map((st, idx) => (
                      <tr key={st.id} className="hover:bg-gray-50/50">
                        <td className="py-2.5 px-3 font-mono text-gray-400">{idx + 1}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-gray-900">{st.studentName}</div>
                          <div className="text-[10px] text-gray-500 font-mono">{st.rollNumber}</div>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-gray-800">{st.trade || st.stream}</td>
                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-gray-700">{st.passingYear}</span>
                          {st.grade && (
                            <span className="ml-1 text-[10px] text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded font-bold">
                              {st.grade}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {st.skills && st.skills.length > 0 ? (
                              st.skills.map((sk, sidx) => (
                                <span
                                  key={sidx}
                                  className="px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[10px] font-medium border border-purple-100"
                                >
                                  {sk}
                                </span>
                              ))
                            ) : (
                              <span className="text-[10px] text-gray-400 italic">Verified Skills</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="space-y-0.5" title={t('contactMaskedTooltip')}>
                            <span className="font-mono text-gray-600 block text-[10px]">
                              {maskContactNumber(st.phone)}
                            </span>
                            <span className="font-mono text-gray-400 block text-[9px]">
                              {maskEmailAddress(st.email)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-gray-100 no-print">
              <span className="text-[11px] text-gray-400 font-mono">
                {t('candidatesSelected', { count: selectedStudentIds.length })} • {t('piiMaskedBadge')}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsBrochureModalOpen(false)}
                >
                  {t('btnCancel')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold inline-flex items-center gap-1.5"
                  onClick={() => window.print()}
                >
                  <Printer className="w-3.5 h-3.5" />
                  {t('btnPrintBrochure')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
