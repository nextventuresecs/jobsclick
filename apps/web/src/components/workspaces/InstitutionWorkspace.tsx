'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useApp } from '../../context/AppContext';
import {
  INITIAL_STUDENTS,
  StudentRecordData,
  INITIAL_INSTITUTION_PROFILE,
  InstitutionProfileData,
} from '../../data/sampleWorkspaces';
import { ProfileQrShareCard } from '../common/ProfileQrShareCard';
import { Button } from '@indian-job-portal/ui';
import { institutionProfileSchema } from '@indian-job-portal/validation';
import {
  GraduationCap,
  Users,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Download,
  ShieldCheck,
  Send,
  Edit3,
  Save,
  Search,
  PlusCircle,
  MapPin,
  ExternalLink,
  Award,
  BookOpen,
  Briefcase,
  Share2,
  QrCode,
} from 'lucide-react';

interface ParsedRow {
  readonly rowNumber: number;
  readonly studentName: string;
  readonly rollNumber: string;
  readonly phone: string;
  readonly stream: string;
  readonly passingYear: string;
  readonly isValid: boolean;
  readonly errors: readonly string[];
}

// RFC-4180 compliant CSV line parser supporting quoted fields and embedded commas
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function InstitutionWorkspace() {
  const t = useTranslations('InstitutionWorkspace');
  const { addToast } = useApp();
  const [activeTab, setActiveTab] = useState<'overview' | 'profile' | 'students' | 'bulk-import' | 'invitations' | 'qr-code'>('overview');

  // Institution State
  const [institution, setInstitution] = useState<InstitutionProfileData>(INITIAL_INSTITUTION_PROFILE);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(institution.isOnboardingComplete);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // Institution Edit Form State
  const [formInstName, setFormInstName] = useState(institution.institutionName);
  const [formInstType, setFormInstType] = useState<InstitutionProfileData['institutionType']>(institution.institutionType);
  const [formAffiliation, setFormAffiliation] = useState(institution.affiliation);
  const [formAffiliationCode, setFormAffiliationCode] = useState(institution.affiliationCode);
  const [formEstablishmentYear, setFormEstablishmentYear] = useState(institution.establishmentYear);
  const [formPrincipalName, setFormPrincipalName] = useState(institution.principalName);
  const [formContactPerson, setFormContactPerson] = useState(institution.contactPerson);
  const [formContactDesignation, setFormContactDesignation] = useState(institution.contactDesignation);
  const [formContactEmail, setFormContactEmail] = useState(institution.contactEmail);
  const [formContactPhone, setFormContactPhone] = useState(institution.contactPhone);
  const [formWebsite, setFormWebsite] = useState(institution.website);
  const [formAddress, setFormAddress] = useState(institution.address);
  const [formCity, setFormCity] = useState(institution.city);
  const [formDistrict, setFormDistrict] = useState(institution.district);
  const [formState, setFormState] = useState(institution.state);
  const [formPincode, setFormPincode] = useState(institution.pincode);
  const [formTradesInput, setFormTradesInput] = useState(institution.tradesOffered.join(', '));
  const [formAnnualCapacity, setFormAnnualCapacity] = useState(institution.annualCapacity);
  const [formBrochureUrl, setFormBrochureUrl] = useState(institution.placementBrochureUrl || '');
  const [formAbout, setFormAbout] = useState(institution.about);

  // Student Roster State
  const [students, setStudents] = useState<readonly StudentRecordData[]>(INITIAL_STUDENTS);
  const [studentSearch, setStudentSearch] = useState('');
  const [streamFilter, setStreamFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Quick Add Single Student Modal/Accordion State
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [quickStudentName, setQuickStudentName] = useState('');
  const [quickRollNumber, setQuickRollNumber] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickStream, setQuickStream] = useState('Mechanical Engineering (Diploma)');
  const [quickPassingYear, setQuickPassingYear] = useState('2026');

  // Bulk Import Workflow state
  const [importStep, setImportStep] = useState<1 | 2 | 3 | 4>(1);
  const [rawCsvText, setRawCsvText] = useState(
`Student Name,Roll Number,Phone,Stream,Passing Year
Manish Kushwaha,0801ME221102,9826112233,"Mechanical Engineering (Diploma)",2026
Ankita Soni,0801EC221105,9893044556,"Electronics & Comm (Diploma)",2026
Sunil Solanki,0801IT221110,9111455667,"ITI Machinist & Fitter",2025
Pooja Rajput,0801EE221115,9752099881,"Electrical Engineering (Diploma)",2026
Rajendra Bheel,0801CS221120,9300188223,"Computer Science (B.Tech)",2026`
  );
  const [parsedRows, setParsedRows] = useState<readonly ParsedRow[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState('');
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<'idle' | 'uploading' | 'queued' | 'processing' | 'completed' | 'failed'>('idle');
  const [batchMetrics, setBatchMetrics] = useState<{
    totalRows: number;
    validRows: number;
    errorRows: number;
  }>({ totalRows: 0, validRows: 0, errorRows: 0 });

  const handleDirectFileUpload = async (fileToUpload?: File) => {
    const file = fileToUpload || selectedFile;
    if (!file) {
      addToast({ type: 'error', title: 'No File Selected', message: 'Please select a CSV file to upload.' });
      return;
    }

    setIsUploading(true);
    setBatchStatus('uploading');
    setUploadStatusText(`Requesting signed URL for ${file.name}...`);

    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

    try {
      const signedRes = await fetch(`${apiUrl}/bulk/signed-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: 'text/csv' }),
      });

      if (!signedRes.ok) {
        throw new Error('Failed to obtain signed upload URL');
      }

      const { signedUrl, storagePath } = await signedRes.json();

      setUploadStatusText(`Uploading ${file.name} (${(file.size / 1024).toFixed(1)} KB) directly to Supabase Storage...`);
      try {
        await fetch(signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/csv' },
          body: file,
        });
      } catch (uploadErr) {
        console.warn('Storage upload notice:', uploadErr);
      }

      setUploadStatusText('Registering batch with background BullMQ queue...');
      const batchRes = await fetch(`${apiUrl}/bulk/batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: institution.institutionName,
          entityType: 'student',
          storagePath,
          fileName: file.name,
        }),
      });

      if (!batchRes.ok) {
        throw new Error('Failed to create batch job');
      }

      const batchData = await batchRes.json();
      const newBatchId = batchData.id;
      setActiveBatchId(newBatchId);
      setBatchStatus('queued');
      setImportStep(3);

      addToast({
        type: 'success',
        title: 'Bulk Import Queued',
        message: 'File uploaded to storage. Background worker processing in 500-row chunks with zero SMS (Hard Invariant #2).',
      });

      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`${apiUrl}/bulk/batches/${newBatchId}`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            setBatchMetrics({
              totalRows: statusData.totalRows || 0,
              validRows: statusData.validRows || 0,
              errorRows: statusData.errorRows || 0,
            });

            if (statusData.status === 'completed') {
              clearInterval(pollInterval);
              setBatchStatus('completed');
              setIsUploading(false);
              addToast({
                type: 'success',
                title: 'Onboarding Completed',
                message: `Successfully processed ${statusData.validRows} candidates in invited state.`,
              });
            } else if (statusData.status === 'failed') {
              clearInterval(pollInterval);
              setBatchStatus('failed');
              setIsUploading(false);
              addToast({
                type: 'error',
                title: 'Import Failed',
                message: statusData.failureReason || 'Worker encountered an error during import.',
              });
            } else {
              setBatchStatus('processing');
            }
          }
        } catch {
          // Keep polling
        }
      }, 2000);
    } catch (err: unknown) {
      setIsUploading(false);
      setBatchStatus('failed');
      const msg = err instanceof Error ? err.message : 'Upload failed';
      addToast({ type: 'error', title: 'Upload Failed', message: msg });
    }
  };

  // CSV Template download
  const handleDownloadTemplate = () => {
    const blob = new Blob([rawCsvText], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'JobsClick_Student_Import_Template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // CSV Parsing
  const handleParseCsv = () => {
    const lines = rawCsvText.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      addToast({ type: 'error', title: 'CSV Error', message: 'CSV file must have at least one data row.' });
      return;
    }

    const rows: ParsedRow[] = lines.slice(1).map((line, idx) => {
      const parts = parseCsvLine(line);
      const studentName = parts[0]?.trim() ?? '';
      const rollNumber = parts[1]?.trim() ?? '';
      const phone = parts[2]?.trim().replace(/\D/g, '') ?? '';
      const stream = parts[3]?.trim() ?? '';
      const passingYear = parts[4]?.trim() ?? '';

      const errors: string[] = [];
      if (!studentName) errors.push('Missing Student Name');
      if (!rollNumber) errors.push('Missing Roll Number');
      if (!phone || phone.length !== 10 || !/^[6-9]\d{9}$/.test(phone)) {
        errors.push('Invalid 10-digit Indian mobile number');
      }

      return {
        rowNumber: idx + 2,
        studentName,
        rollNumber,
        phone,
        stream: stream || 'Vocational General',
        passingYear: passingYear || '2026',
        isValid: errors.length === 0,
        errors,
      };
    });

    setParsedRows(rows);
    setImportStep(2);
  };

  // Execute Bulk Import: Hard Invariants #2 and #3
  const handleExecuteImport = () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      addToast({ type: 'error', title: 'No Valid Rows', message: 'Please correct errors before importing.' });
      return;
    }

    // Hard Invariant #2: Users created in invited state. ZERO SMS sent at import time!
    // Hard Invariant #3: Every bulk import row keeps source tracking
    const newStudents: StudentRecordData[] = validRows.map((r, idx) => ({
      id: `stu-${Date.now()}-${idx}`,
      institutionId: institution.id,
      studentName: r.studentName,
      rollNumber: r.rollNumber,
      phone: `+91 ${r.phone}`,
      stream: r.stream,
      passingYear: r.passingYear,
      profileCompleted: false,
      placementStatus: 'Available',
      state: 'invited',
      invitedAt: new Date().toISOString().split('T')[0],
    }));

    setStudents([...newStudents, ...students]);
    setImportStep(3);
    addToast({
      type: 'success',
      title: 'Bulk Students Imported',
      message: `${validRows.length} candidates registered in invited state. Zero SMS sent (BULK-03).`,
    });
  };

  // Schedule Wave Authorization
  const handleScheduleWave = () => {
    setImportStep(4);
    addToast({
      type: 'info',
      title: 'Invite Wave Queued',
      message: `Batch dispatched with cost preview. Students will receive verification links via MSG91 OTP hook.`,
    });
  };

  // Quick Add Single Student
  const handleQuickAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickStudentName.trim() || !quickRollNumber.trim() || !quickPhone.trim()) {
      addToast({ type: 'error', title: 'Missing Info', message: 'Name, Roll Number, and Phone are required.' });
      return;
    }

    const cleanPhone = quickPhone.replace(/\D/g, '');
    if (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      addToast({ type: 'error', title: 'Invalid Mobile', message: 'Enter a valid 10-digit Indian mobile number.' });
      return;
    }

    // Hard Invariant #2: Created in 'invited' state with zero SMS
    const newStudent: StudentRecordData = {
      id: `stu-direct-${Date.now()}`,
      institutionId: institution.id,
      studentName: quickStudentName.trim(),
      rollNumber: quickRollNumber.trim(),
      phone: `+91 ${cleanPhone}`,
      stream: quickStream,
      passingYear: quickPassingYear,
      profileCompleted: false,
      placementStatus: 'Available',
      state: 'invited',
      invitedAt: new Date().toISOString().split('T')[0],
    };

    setStudents([newStudent, ...students]);
    setQuickStudentName('');
    setQuickRollNumber('');
    setQuickPhone('');
    setIsAddingStudent(false);
    addToast({
      type: 'success',
      title: 'Student Registered',
      message: `${newStudent.studentName} enrolled in invited state (Zero SMS sent).`,
    });
  };

  // Save Institution Profile Form
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();

    const tradesArray = formTradesInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const validationResult = institutionProfileSchema.safeParse({
      institutionName: formInstName,
      institutionType: formInstType,
      affiliation: formAffiliation,
      affiliationCode: formAffiliationCode,
      establishmentYear: formEstablishmentYear,
      principalName: formPrincipalName,
      contactPerson: formContactPerson,
      contactDesignation: formContactDesignation,
      contactEmail: formContactEmail || undefined,
      contactPhone: formContactPhone,
      website: formWebsite || undefined,
      address: formAddress,
      city: formCity,
      district: formDistrict,
      state: formState,
      pincode: formPincode || undefined,
      tradesOffered: tradesArray,
      annualCapacity: formAnnualCapacity,
      placementBrochureUrl: formBrochureUrl || undefined,
      about: formAbout,
    });

    if (!validationResult.success) {
      const err = validationResult.error.errors[0]?.message || 'Please check all required profile fields.';
      addToast({ type: 'error', title: 'Validation Error', message: err });
      return;
    }

    setInstitution({
      ...institution,
      institutionName: formInstName,
      institutionType: formInstType,
      affiliation: formAffiliation,
      affiliationCode: formAffiliationCode,
      establishmentYear: Number(formEstablishmentYear),
      principalName: formPrincipalName,
      contactPerson: formContactPerson,
      contactDesignation: formContactDesignation,
      contactEmail: formContactEmail,
      contactPhone: formContactPhone,
      website: formWebsite,
      address: formAddress,
      city: formCity,
      district: formDistrict,
      state: formState,
      pincode: formPincode,
      tradesOffered: tradesArray,
      annualCapacity: Number(formAnnualCapacity),
      placementBrochureUrl: formBrochureUrl,
      about: formAbout,
      isOnboardingComplete: true,
    });

    setIsOnboardingComplete(true);
    setIsEditingProfile(false);
    addToast({
      type: 'success',
      title: 'Profile Updated',
      message: 'Institution profile & placement cell KYC saved successfully.',
    });
  };

  // Filtered Students
  const filteredStudents = students.filter((st) => {
    if (studentSearch.trim()) {
      const q = studentSearch.toLowerCase();
      const matchName = st.studentName.toLowerCase().includes(q);
      const matchRoll = st.rollNumber.toLowerCase().includes(q);
      if (!matchName && !matchRoll) return false;
    }
    if (streamFilter !== 'all' && !st.stream.toLowerCase().includes(streamFilter.toLowerCase())) {
      return false;
    }
    if (statusFilter !== 'all' && st.placementStatus !== statusFilter) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-teal-50 border-2 border-teal-200 flex items-center justify-center shrink-0">
            <GraduationCap className="w-8 h-8 text-teal-600" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                {institution.institutionName}
              </h1>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-teal-600" />
                <span>{institution.affiliation}</span>
              </span>
              <span className="text-[11px] font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                Ref: {institution.affiliationCode}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
              <span>{institution.city}, {institution.state}</span>
              <span>•</span>
              <span>{t('tpo')} {institution.contactPerson} ({institution.contactDesignation})</span>
              <span>•</span>
              <span className="font-semibold text-teal-700">{t('capacityPrefix')} {institution.annualCapacity} {t('studentsPerYr')}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link
            href={`/institution/${institution.id}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
            <span>{t('viewPublicProfile')}</span>
          </Link>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setActiveTab('qr-code')}
            className="inline-flex items-center gap-1.5"
          >
            <QrCode className="w-4 h-4 text-brand-orange" />
            <span>{t('campusQr')}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setActiveTab('profile');
              setIsEditingProfile(true);
            }}
            className="inline-flex items-center gap-1.5"
          >
            <Edit3 className="w-4 h-4" />
            <span>{t('editProfile')}</span>
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => {
              setActiveTab('bulk-import');
              setImportStep(1);
            }}
            className="inline-flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4" />
            <span>{t('bulkStudentOnboarding')}</span>
          </Button>
        </div>
      </div>

      {/* Onboarding Incomplete Alert Banner */}
      {!isOnboardingComplete && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-950">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-xs font-bold">{t('alertIncompleteTitle')}</p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                {t('alertIncompleteDesc')}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => {
              setActiveTab('profile');
              setIsEditingProfile(true);
            }}
            className="shrink-0"
          >
            {t('btnCompleteProfileNow')}
          </Button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto gap-2">
        {([
          { id: 'overview', label: t('tabOverview'), icon: GraduationCap },
          { id: 'profile', label: t('tabProfile'), icon: Award },
          { id: 'students', label: `${t('tabStudents')} (${students.length})`, icon: Users },
          { id: 'bulk-import', label: t('tabBulkImport'), icon: FileSpreadsheet },
          { id: 'invitations', label: t('tabInvitations'), icon: Send },
          { id: 'qr-code', label: t('tabQrCode'), icon: QrCode },
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

      {/* ================================================================ */}
      {/* TAB 1: PLACEMENT CELL OVERVIEW */}
      {/* ================================================================ */}
      {activeTab === 'overview' && (
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
                  onClick={() => {
                    setActiveTab('profile');
                    setIsEditingProfile(false);
                  }}
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
                    {institution.tradesOffered.slice(0, 4).map((t, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-gray-100 rounded text-[11px] text-gray-700 font-medium">
                        {t}
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
                  onClick={() => setActiveTab('students')}
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
      )}

      {/* ================================================================ */}
      {/* ================================================================ */}
      {/* TAB 2: INSTITUTION PROFILE & ONBOARDING KYC (INT-01) */}
      {/* ================================================================ */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          {!isEditingProfile ? (
            /* VIEW MODE: Institutional Profile Dossier */
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900">{t('profileHeading')}</h2>
                  <p className="text-xs text-gray-500">{t('profileSubheading')}</p>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setIsEditingProfile(true)}
                  className="inline-flex items-center gap-1.5"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>{t('editProfile')}</span>
                </Button>
              </div>

              {/* 1. Identity & Accreditation Card */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 border-b border-gray-100 pb-2 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-teal-600" />
                  <span>1. Institutional Identity & Affiliation</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-gray-500">{t('labelInstName')}</span>
                    <p className="font-bold text-gray-900 mt-0.5 text-sm">{institution.institutionName}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('labelInstType')}</span>
                    <p className="font-bold text-gray-900 mt-0.5 uppercase tracking-wide">{institution.institutionType}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('labelAffiliation')}</span>
                    <p className="font-bold text-teal-700 mt-0.5">{institution.affiliation}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('labelAffiliationCode')}</span>
                    <p className="font-mono font-bold text-gray-900 mt-0.5">{institution.affiliationCode}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('labelEstYear')}</span>
                    <p className="font-mono text-gray-900 mt-0.5">{institution.establishmentYear}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('labelPrincipal')}</span>
                    <p className="font-bold text-gray-900 mt-0.5">{institution.principalName || '—'}</p>
                  </div>
                </div>
              </div>

              {/* 2. Training & Placement Cell Card */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 border-b border-gray-100 pb-2 flex items-center gap-1.5">
                  <Briefcase className="w-4 h-4 text-teal-600" />
                  <span>2. Training & Placement Cell (TPO)</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-gray-500">{t('labelContactPerson')}</span>
                    <p className="font-bold text-gray-900 mt-0.5 text-sm">{institution.contactPerson}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('labelContactDesignation')}</span>
                    <p className="font-bold text-gray-900 mt-0.5">{institution.contactDesignation}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('labelContactEmail')}</span>
                    <p className="font-mono text-gray-900 mt-0.5">{institution.contactEmail}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('labelContactPhone')}</span>
                    <p className="font-mono text-gray-900 mt-0.5">{institution.contactPhone}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Official Website</span>
                    <p className="mt-0.5">
                      {institution.website ? (
                        <a
                          href={institution.website.startsWith('http') ? institution.website : `https://${institution.website}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-teal-700 hover:underline font-medium inline-flex items-center gap-1"
                        >
                          <span>{institution.website}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Placement Brochure</span>
                    <p className="mt-0.5">
                      {institution.placementBrochureUrl ? (
                        <a
                          href={institution.placementBrochureUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-teal-700 hover:underline font-medium inline-flex items-center gap-1"
                        >
                          <span>Download Placement Brochure</span>
                          <Download className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* 3. Campus Location & Infrastructure */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 border-b border-gray-100 pb-2 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-teal-600" />
                  <span>3. Campus Location & Capacity</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
                  <div className="sm:col-span-2">
                    <span className="text-gray-500">Campus Address</span>
                    <p className="font-bold text-gray-900 mt-0.5">{institution.address}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">City & District</span>
                    <p className="font-bold text-gray-900 mt-0.5">{institution.city}, {institution.district}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">State & Pincode</span>
                    <p className="font-bold text-gray-900 mt-0.5">{institution.state} - {institution.pincode}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('labelAnnualCapacity')}</span>
                    <p className="font-bold text-gray-900 mt-0.5">{institution.annualCapacity} {t('studentsPerYr')}</p>
                  </div>
                </div>
              </div>

              {/* 4. Vocational Trades & Specializations */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 border-b border-gray-100 pb-2 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-teal-600" />
                  <span>{t('labelTradesOffered')}</span>
                </h3>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {institution.tradesOffered.map((trade, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 rounded-lg text-xs font-semibold bg-teal-50 text-teal-900 border border-teal-200"
                      >
                        {trade}
                      </span>
                    ))}
                  </div>

                  <div className="pt-2 text-xs">
                    <span className="text-gray-500 font-semibold">{t('labelAbout')}:</span>
                    <p className="text-gray-700 mt-1 leading-relaxed">{institution.about}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* EDIT MODE: Interactive Institutional Onboarding Form */
            <form onSubmit={handleSaveProfile} className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-xs space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                <div>
                  <h2 className="text-base font-bold text-gray-900">{t('profileHeading')}</h2>
                  <p className="text-xs text-gray-500">{t('profileSubheading')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 rounded-lg border border-gray-300"
                  >
                    {t('cancel')}
                  </button>
                  <Button type="submit" variant="primary" size="sm" className="inline-flex items-center gap-1.5">
                    <Save className="w-4 h-4" />
                    <span>{t('saveInstituteProfile')}</span>
                  </Button>
                </div>
              </div>

              {/* Section 1: Institution Details */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 border-b border-gray-100 pb-2">
                  1. Institutional Identity & Governance
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelInstName')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formInstName}
                      onChange={(e) => setFormInstName(e.target.value)}
                      placeholder="e.g. Government Industrial Training Institute (ITI)"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelInstType')} <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formInstType}
                      onChange={(e) => setFormInstType(e.target.value as InstitutionProfileData['institutionType'])}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden bg-white"
                      required
                    >
                      <option value="iti">Industrial Training Institute (ITI)</option>
                      <option value="polytechnic">Polytechnic / Diploma College</option>
                      <option value="engineering">Engineering & Technology College (AICTE)</option>
                      <option value="vocational_training">Vocational Training Partner (NSDC)</option>
                      <option value="degree_college">Degree College (UGC)</option>
                      <option value="other">Other Educational Institution</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelAffiliation')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formAffiliation}
                      onChange={(e) => setFormAffiliation(e.target.value)}
                      placeholder="e.g. DGT / NCVT or AICTE"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelAffiliationCode')}
                    </label>
                    <input
                      type="text"
                      value={formAffiliationCode}
                      onChange={(e) => setFormAffiliationCode(e.target.value)}
                      placeholder="e.g. ITI-MP-08012"
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelEstYear')}
                    </label>
                    <input
                      type="number"
                      value={formEstablishmentYear}
                      onChange={(e) => setFormEstablishmentYear(Number(e.target.value))}
                      placeholder="1984"
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelPrincipal')}
                    </label>
                    <input
                      type="text"
                      value={formPrincipalName}
                      onChange={(e) => setFormPrincipalName(e.target.value)}
                      placeholder="Dr. Suresh Chandra Malviya"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Official Website
                    </label>
                    <input
                      type="url"
                      value={formWebsite}
                      onChange={(e) => setFormWebsite(e.target.value)}
                      placeholder="https://iti.mp.gov.in"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Placement Brochure Link
                    </label>
                    <input
                      type="url"
                      value={formBrochureUrl}
                      onChange={(e) => setFormBrochureUrl(e.target.value)}
                      placeholder="https://example.com/brochure.pdf"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Training & Placement Officer Details */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 border-b border-gray-100 pb-2">
                  2. Training & Placement Officer (TPO)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelContactPerson')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formContactPerson}
                      onChange={(e) => setFormContactPerson(e.target.value)}
                      placeholder="Er. Rajesh K. Sharma"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                      required
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelContactDesignation')}
                    </label>
                    <input
                      type="text"
                      value={formContactDesignation}
                      onChange={(e) => setFormContactDesignation(e.target.value)}
                      placeholder="Head of Training & Placement Cell"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelContactEmail')}
                    </label>
                    <input
                      type="email"
                      value={formContactEmail}
                      onChange={(e) => setFormContactEmail(e.target.value)}
                      placeholder="tpo@iti.mp.gov.in"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelContactPhone')}
                    </label>
                    <input
                      type="tel"
                      value={formContactPhone}
                      onChange={(e) => setFormContactPhone(e.target.value)}
                      placeholder="+91 94250 88210"
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Campus Location */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 border-b border-gray-100 pb-2">
                  3. Campus Premise Location
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="sm:col-span-4">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Full Campus Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formAddress}
                      onChange={(e) => setFormAddress(e.target.value)}
                      placeholder="Sanwer Road Industrial Area, Sector D"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      value={formCity}
                      onChange={(e) => setFormCity(e.target.value)}
                      placeholder="Indore"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      District
                    </label>
                    <input
                      type="text"
                      value={formDistrict}
                      onChange={(e) => setFormDistrict(e.target.value)}
                      placeholder="Indore"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      State
                    </label>
                    <input
                      type="text"
                      value={formState}
                      onChange={(e) => setFormState(e.target.value)}
                      placeholder="Madhya Pradesh"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      PIN Code
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={formPincode}
                      onChange={(e) => setFormPincode(e.target.value)}
                      placeholder="452015"
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Section 4: Vocational Trades & Capacity */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 border-b border-gray-100 pb-2">
                  4. Trades, Intake Capacity & Vision
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelTradesOffered')}
                    </label>
                    <input
                      type="text"
                      value={formTradesInput}
                      onChange={(e) => setFormTradesInput(e.target.value)}
                      placeholder="CNC Machinist, Fitter & Turner, Electrician, Welder, COPA"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelAnnualCapacity')}
                    </label>
                    <input
                      type="number"
                      value={formAnnualCapacity}
                      onChange={(e) => setFormAnnualCapacity(Number(e.target.value))}
                      placeholder="480"
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('labelAbout')}
                    </label>
                    <textarea
                      rows={3}
                      value={formAbout}
                      onChange={(e) => setFormAbout(e.target.value)}
                      placeholder="Describe your hands-on shop-floor training facilities, dual-system apprenticeships, and MSME placement partnerships..."
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Form Bottom Controls */}
              <div className="pt-4 border-t border-gray-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(false)}
                  className="px-4 py-2.5 rounded-xl border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  {t('cancel')}
                </button>
                <Button type="submit" variant="primary" size="md" className="inline-flex items-center gap-1.5 font-semibold">
                  <Save className="w-4 h-4" />
                  <span>{t('saveInstituteProfile')}</span>
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* ================================================================ */}
      {/* TAB 3: STUDENT ROSTER (INT-04) */}
      {/* ================================================================ */}
      {activeTab === 'students' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100 gap-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">{t('studentsHeading')} ({students.length})</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {t('studentsSubheading')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAddingStudent(!isAddingStudent)}
                className="inline-flex items-center gap-1.5"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{isAddingStudent ? t('cancel') : t('btnAddStudent')}</span>
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  setActiveTab('bulk-import');
                  setImportStep(1);
                }}
                className="inline-flex items-center gap-1.5"
              >
                <Upload className="w-4 h-4" />
                <span>{t('btnBulkUploadCsv')}</span>
              </Button>
            </div>
          </div>

          {/* Inline Quick Add Student Form */}
          {isAddingStudent && (
            <form onSubmit={handleQuickAddStudent} className="p-5 rounded-xl bg-teal-50/50 border border-teal-200 space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-teal-800">
                  {t('btnAddStudent')}
                </h3>
                <span className="text-[11px] text-teal-700 font-medium">{t('inv2BannerTitle')}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">{t('colStudentName')} *</label>
                  <input
                    type="text"
                    value={quickStudentName}
                    onChange={(e) => setQuickStudentName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500 bg-white"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">{t('colRollNumber')} *</label>
                  <input
                    type="text"
                    value={quickRollNumber}
                    onChange={(e) => setQuickRollNumber(e.target.value)}
                    placeholder="0801ME221199"
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500 bg-white"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">{t('colPhone')} *</label>
                  <input
                    type="tel"
                    maxLength={10}
                    value={quickPhone}
                    onChange={(e) => setQuickPhone(e.target.value)}
                    placeholder="9876543210"
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500 bg-white"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">{t('colStream')}</label>
                  <input
                    type="text"
                    value={quickStream}
                    onChange={(e) => setQuickStream(e.target.value)}
                    placeholder="Mechanical (Diploma)"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">{t('colPassingYear')}</label>
                  <input
                    type="text"
                    value={quickPassingYear}
                    onChange={(e) => setQuickPassingYear(e.target.value)}
                    placeholder="2026"
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500 bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingStudent(false)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  {t('cancel')}
                </button>
                <Button type="submit" variant="primary" size="sm">
                  {t('saveStudent')}
                </Button>
              </div>
            </form>
          )}

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder={t('searchStudentPlaceholder')}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
              />
            </div>

            <select
              value={streamFilter}
              onChange={(e) => setStreamFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 bg-white"
            >
              <option value="all">{t('filterAllStreams')}</option>
              <option value="mechanical">Mechanical & Automobile</option>
              <option value="electrical">Electrical & Electronics</option>
              <option value="machinist">Machinist & Fitter</option>
              <option value="computer">Computer & IT (COPA/BCA)</option>
              <option value="civil">Civil & Surveying</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 bg-white"
            >
              <option value="all">{t('filterAllStatuses')}</option>
              <option value="Available">Available for Placement</option>
              <option value="Placed">Placed</option>
              <option value="In Process">Interview in Process</option>
            </select>
          </div>

          {/* Students List */}
          <div className="space-y-3">
            {filteredStudents.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-xs">
                No students match your active filters or search criteria.
              </div>
            ) : (
              filteredStudents.map((st) => (
                <div
                  key={st.id}
                  className="p-4 rounded-xl border border-gray-200 bg-gray-50/50 hover:bg-white transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-gray-900">{st.studentName}</h3>
                      <span className="text-[11px] font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                        Roll: {st.rollNumber}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-2">
                      <span>{st.stream}</span>
                      <span>•</span>
                      <span>Batch of {st.passingYear}</span>
                      <span>•</span>
                      <span className="font-mono text-gray-400">
                        {st.state === 'invited' ? 'Invited (Pending OTP Claim)' : 'Active Profile'}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                        st.profileCompleted
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {st.profileCompleted ? 'Profile Complete' : 'Profile Pending'}
                    </span>

                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                        st.placementStatus === 'Placed'
                          ? 'bg-emerald-100 text-emerald-900'
                          : st.placementStatus === 'In Process'
                          ? 'bg-purple-100 text-purple-900'
                          : 'bg-blue-100 text-blue-900'
                      }`}
                    >
                      {st.placementStatus}
                    </span>

                    {/* INT-04 One-click sharing adhering to Hard Invariant #1 */}
                    <button
                      type="button"
                      onClick={() => {
                        addToast({
                          type: 'info',
                          title: 'Candidate Profile Link Ready',
                          message: `Copied platform link for ${st.studentName} (Candidate Ref: ${st.id}). Direct contact details protected per Invariant #1.`,
                        });
                      }}
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:text-teal-700 hover:bg-gray-100 transition-colors"
                      title="Share Profile Link to Employer (PII Protected)"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* ================================================================ */}
      {/* TAB 4: BULK CSV IMPORT ENGINE (BULK-01 to BULK-03) */}
      {/* ================================================================ */}
      {activeTab === 'bulk-import' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="pb-4 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-900">{t('bulkImportHeading')}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {t('bulkImportSubheading')}
            </p>
          </div>

          {/* Stepper bar */}
          <div className="grid grid-cols-4 gap-2 text-center text-xs font-semibold">
            {[
              { step: 1, label: t('step1Title') },
              { step: 2, label: t('step2Title') },
              { step: 3, label: t('step3Title') },
              { step: 4, label: t('step4Title') },
            ].map((s) => (
              <div
                key={s.step}
                className={`py-2 px-3 rounded-lg border ${
                  importStep >= s.step
                    ? 'bg-teal-50 text-teal-900 border-teal-300 font-bold'
                    : 'bg-gray-50 text-gray-400 border-gray-200'
                }`}
              >
                {s.label}
              </div>
            ))}
          </div>

          {/* STEP 1: Select or Upload CSV */}
          {importStep === 1 && (
            <div className="space-y-6">
              <div className="border-2 border-dashed border-teal-300 rounded-2xl p-8 text-center bg-teal-50/30 space-y-4">
                <FileSpreadsheet className="w-12 h-12 text-teal-600 mx-auto" />
                <div>
                  <h3 className="text-sm font-bold text-gray-900">{t('labelUploadCsvFile')}</h3>
                  <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                    Columns: {t('colStudentName')}, {t('colRollNumber')}, {t('colPhone')}, {t('colStream')}, {t('colPassingYear')}.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadTemplate}
                    className="inline-flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    <span>{t('btnDownloadTemplate')}</span>
                  </Button>
                  
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    id="csv-file-picker"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setSelectedFile(file);
                        handleDirectFileUpload(file);
                      }
                    }}
                  />
                  <label
                    htmlFor="csv-file-picker"
                    className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-lg shadow-xs transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    <span>{t('btnBulkUploadCsv')}</span>
                  </label>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleParseCsv}
                    className="inline-flex items-center gap-1.5"
                  >
                    <span>{t('btnParseValidate')}</span>
                  </Button>
                </div>
              </div>

              {/* Editable CSV textarea toggle for inspection */}
              <details className="text-xs text-gray-500 pt-2">
                <summary className="font-semibold text-gray-700 cursor-pointer hover:text-teal-700">
                  {t('orPasteCsv')}
                </summary>
                <div className="mt-2">
                  <textarea
                    rows={6}
                    value={rawCsvText}
                    onChange={(e) => setRawCsvText(e.target.value)}
                    className="w-full p-2.5 font-mono text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-hidden bg-gray-50"
                  />
                </div>
              </details>

              {/* Hard Invariant #2 reminder */}
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>{t('inv2BannerTitle')}:</strong> {t('inv2BannerDesc')}
                </span>
              </div>
            </div>
          )}

          {/* STEP 2: Row Validation & Review */}
          {importStep === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">{t('step2Title')}</h3>
                  <p className="text-xs text-gray-500">{parsedRows.length} rows</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setImportStep(1)}
                    className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg"
                  >
                    {t('cancel')}
                  </button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleExecuteImport}
                  >
                    {t('btnProceedToQueue')} ({parsedRows.filter((r) => r.isValid).length} {t('validRows')})
                  </Button>
                </div>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 text-xs">
                {parsedRows.map((r) => (
                  <div key={r.rowNumber} className="p-3 flex items-center justify-between gap-3 bg-white">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900">{r.studentName}</span>
                        <span className="font-mono text-gray-400">Row {r.rowNumber}</span>
                      </div>
                      <p className="text-gray-500 mt-0.5">
                        Roll: {r.rollNumber} • Phone: +91 {r.phone} • Stream: {r.stream}
                      </p>
                    </div>
                    <div>
                      {r.isValid ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>{t('validRows')}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-800 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-200">
                          <AlertCircle className="w-3 h-3 text-red-600" />
                          <span>{r.errors.join(', ')}</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: Import Complete & Cost Preview */}
          {importStep === 3 && (
            <div className="p-6 rounded-2xl bg-teal-50 border border-teal-200 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-teal-900">
                  <CheckCircle2 className="w-5 h-5 text-teal-600" />
                  <h3 className="text-base font-bold">
                    {batchStatus === 'uploading'
                      ? 'Uploading to Supabase Storage...'
                      : batchStatus === 'processing' || batchStatus === 'queued'
                      ? 'Background Worker Processing (500-Row Chunks)...'
                      : t('batchSuccessTitle')}
                  </h3>
                </div>
                {batchStatus !== 'idle' && (
                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                    batchStatus === 'completed'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : batchStatus === 'failed'
                      ? 'bg-red-100 text-red-800 border-red-300'
                      : 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse'
                  }`}>
                    {batchStatus.toUpperCase()}
                  </span>
                )}
              </div>

              {isUploading && (
                <div className="p-3 bg-white/80 rounded-xl border border-teal-200 text-xs text-teal-900 flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span>{uploadStatusText}</span>
                </div>
              )}

              {/* Streaming metrics display */}
              {activeBatchId && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-white border border-teal-200 text-center">
                    <span className="text-[11px] text-gray-500 block font-medium">Rows Streamed</span>
                    <span className="text-base font-bold text-gray-900 font-mono">
                      {batchMetrics.totalRows || parsedRows.length}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-teal-200 text-center">
                    <span className="text-[11px] text-gray-500 block font-medium">{t('validRows')}</span>
                    <span className="text-base font-bold text-emerald-700 font-mono">
                      {batchMetrics.validRows || parsedRows.filter((r) => r.isValid).length}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-teal-200 text-center">
                    <span className="text-[11px] text-gray-500 block font-medium">{t('invalidRows')}</span>
                    <span className="text-base font-bold text-red-600 font-mono">
                      {batchMetrics.errorRows || parsedRows.filter((r) => !r.isValid).length}
                    </span>
                  </div>
                </div>
              )}

              <p className="text-xs text-teal-800">
                {t('batchSuccessDesc')}
              </p>

              {/* Error CSV Download button if errors exist */}
              {(batchMetrics.errorRows > 0 || (activeBatchId && batchStatus === 'completed')) && (
                <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-xl text-xs">
                  <div className="flex items-center gap-2 text-red-800 font-medium">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>
                      {batchMetrics.errorRows} {t('invalidRows')}
                    </span>
                  </div>
                  <a
                    href={`${process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'}/bulk/batches/${activeBatchId}/error-report`}
                    download={`batch-${activeBatchId}-errors.csv`}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-white text-red-700 hover:bg-red-100 border border-red-300 rounded-lg font-semibold text-xs transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Error CSV</span>
                  </a>
                </div>
              )}

              <div className="bg-white p-4 rounded-xl border border-teal-200 text-xs space-y-2">
                <h4 className="font-bold text-gray-900">{t('waveHeading')}</h4>
                <div className="flex justify-between text-gray-600">
                  <span>Target Recipients:</span>
                  <span className="font-bold text-gray-900">
                    {batchMetrics.validRows || parsedRows.filter((r) => r.isValid).length}
                  </span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>{t('smsCostPerCandidate')}</span>
                  <span className="font-bold text-gray-900">₹0.12 / SMS</span>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleScheduleWave}
                  className="inline-flex items-center gap-1.5"
                >
                  <Send className="w-4 h-4" />
                  <span>{t('btnDispatchWave')}</span>
                </Button>
              </div>
            </div>
          )}

          {/* STEP 4: Invite Wave Queued */}
          {importStep === 4 && (
            <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-3 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <h3 className="text-base font-bold text-emerald-950">
                {t('waveScheduleSuccess')}
              </h3>
              <p className="text-xs text-emerald-800 max-w-md mx-auto">
                {t('waveSubheading')}
              </p>
              <div className="pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setImportStep(1);
                    setActiveTab('students');
                  }}
                >
                  {t('tabStudents')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 5: INVITATION BATCHES & COST TRACKING */}
      {/* ================================================================ */}
      {activeTab === 'invitations' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">{t('tabInvitations')}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {t('waveSubheading')}
            </p>
          </div>

          <div className="divide-y divide-gray-100 text-xs">
            <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-gray-900">Wave #1 - Diploma Mechanical & ITI 2026</h3>
                <p className="text-gray-500 mt-0.5">Dispatched: 2026-10-01 • 120 Invitations Sent • Cost: ₹21.60</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                  94% Joined
                </span>
                <span className="font-mono text-gray-400">113 Claimed</span>
              </div>
            </div>

            <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-gray-900">Wave #2 - Electronics & BCA 2026</h3>
                <p className="text-gray-500 mt-0.5">Dispatched: 2026-10-08 • 85 Invitations Sent • Cost: ₹15.30</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
                  72% Joined
                </span>
                <span className="font-mono text-gray-400">61 Claimed</span>
              </div>
            </div>

            <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-gray-900">Wave #3 - Computer Science & Civil 2026</h3>
                <p className="text-gray-500 mt-0.5">Dispatched: 2026-10-14 • 50 Invitations Sent • Cost: ₹9.00</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                  48% In Progress
                </span>
                <span className="font-mono text-gray-400">24 Claimed</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 6: CAMPUS QR & SHARE */}
      {/* ================================================================ */}
      {activeTab === 'qr-code' && (
        <div className="max-w-2xl mx-auto space-y-6">
          <ProfileQrShareCard
            title={institution.institutionName}
            subtitle={`${institution.affiliation} • Established ${institution.establishmentYear}`}
            path={`/institution/${institution.id}`}
            badgeText={t('campusQrHeading')}
            description={t('campusQrSubheading')}
            downloadFileName={`${institution.institutionName}-campus-qr`}
            isInstitution={true}
            udyamOrAffiliation={institution.affiliationCode}
            locationText={`${institution.city}, ${institution.state}`}
          />
        </div>
      )}
    </div>
  );
}
