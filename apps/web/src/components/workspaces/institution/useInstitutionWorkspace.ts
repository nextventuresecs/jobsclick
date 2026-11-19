'use client';

import { useState, useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import type {
  StudentRecordData,
  InstitutionProfileData,
  CorporateTieUpData,
  PlacementApplicationRecord,
} from '../../../data/sampleWorkspaces';
import {
  INITIAL_INSTITUTION_PROFILE,
} from '../../../data/sampleWorkspaces';
import { institutionProfileSchema } from '@indian-job-portal/validation';
import { useInstitutionProfileState } from './useInstitutionProfileState';
import { useBulkUploadState } from './useBulkUploadState';
import { parseCsvContent, downloadCsvTemplate } from './csvParser';
import { createQuickStudent, filterStudentsList } from './studentUtils';

interface ApiStudentRow {
  readonly id: string;
  readonly institution_id?: string;
  readonly institution?: string;
  readonly full_name?: string;
  readonly phone?: string;
  readonly qualification?: string;
  readonly graduation_year?: string;
  readonly skills?: readonly string[];
  readonly source?: string;
  readonly created_at?: string;
}

interface UseInstitutionWorkspaceProps {
  readonly user?: { id?: string } | null;
  readonly accessToken?: string | null;
  readonly addToast: (toast: {
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
  }) => void;
}

export type InstitutionWorkspaceTab =
  | 'overview'
  | 'profile'
  | 'students'
  | 'placements'
  | 'bulk-import'
  | 'invitations'
  | 'qr-code'
  | 'cms'
  | 'inquiries';

export function useInstitutionWorkspace({ user, accessToken, addToast }: UseInstitutionWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<InstitutionWorkspaceTab>('overview');
  const [institution, setInstitution] =
    useState<InstitutionProfileData>(INITIAL_INSTITUTION_PROFILE);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(
    institution.isOnboardingComplete,
  );
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const profileForm = useInstitutionProfileState(institution);
  const [students, setStudents] = useState<readonly StudentRecordData[]>([]);
  const [tieUps, setTieUps] = useState<readonly CorporateTieUpData[]>([]);
  const [applications, setApplications] = useState<readonly PlacementApplicationRecord[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [streamFilter, setStreamFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [quickStudentName, setQuickStudentName] = useState('');
  const [quickRollNumber, setQuickRollNumber] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickStream, setQuickStream] = useState('Mechanical Engineering (Diploma)');
  const [quickPassingYear, setQuickPassingYear] = useState('2026');

  // Mount effect to fetch remote institution profile, students, corporate tie-ups & placement pipeline
  useEffect(() => {
    let isMounted = true;
    if (!user?.id || !accessToken) return;

    const apiUrl =
      process.env['NEXT_PUBLIC_API_URL'] ||
      process.env['API_URL'] ||
      'http://localhost:3001';
    const authHeader = `Bearer ${accessToken}`;
    const userId = user.id;

    // 1. Fetch Institution Profile
    fetch(`${apiUrl}/profiles/institution/me`, {
      headers: { Authorization: authHeader, 'x-user-id': userId },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        setInstitution((prev) => ({
          ...prev,
          id: data.id || prev.id,
          institutionName: data.institutionName || prev.institutionName,
          institutionType: data.institutionType || prev.institutionType,
          affiliation: data.affiliation || prev.affiliation,
          address: data.address || prev.address,
          city: data.city || prev.city,
          district: data.district || prev.district,
          state: data.state || prev.state,
          pincode: data.pincode || prev.pincode,
          contactPerson: data.contactPerson || prev.contactPerson,
          contactPhone: data.contactPhone || prev.contactPhone,
          contactEmail: data.contactEmail || prev.contactEmail,
          isOnboardingComplete: true,
        }));
        setIsOnboardingComplete(true);
      })
      .catch(() => {});

    // 2. Fetch Students Roster
    fetch(`${apiUrl}/profiles/institution/students`, {
      headers: { Authorization: authHeader, 'x-user-id': userId },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !Array.isArray(data)) return;
        const mappedStudents: StudentRecordData[] = data.map((s: ApiStudentRow) => ({
          id: s.id,
          institutionId: s.institution_id || institution.id,
          institutionName: s.institution || institution.institutionName,
          studentName: s.full_name || 'Enrolled Student',
          rollNumber: s.id?.slice(0, 10).toUpperCase() || 'ROLL-01',
          phone: s.phone || '',
          stream: s.qualification || 'Vocational Trade',
          passingYear: s.graduation_year || '2026',
          profileCompleted: Boolean(s.skills && s.skills.length > 0),
          placementStatus: 'Available',
          state: s.source === 'bulk_upload' ? 'invited' : 'active',
          invitedAt: s.created_at?.split('T')[0] ?? new Date().toISOString().split('T')[0],
        }));
        setStudents(mappedStudents);
      })
      .catch(() => {});

    // 3. Fetch Corporate Tie-Ups
    fetch(`${apiUrl}/placement/tie-ups`, {
      headers: { Authorization: authHeader, 'x-user-id': userId },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !Array.isArray(data)) return;
        setTieUps(data);
      })
      .catch(() => {});

    // 4. Fetch Placement Applications Pipeline
    fetch(`${apiUrl}/placement/pipeline`, {
      headers: { Authorization: authHeader, 'x-user-id': userId },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !Array.isArray(data)) return;
        setApplications(data);
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id, institution.id]);

    const bulkUpload = useBulkUploadState(institution.institutionName, addToast);
  const filteredStudents = filterStudentsList(
    students,
    studentSearch,
    streamFilter,
    statusFilter,
  );

  const handleDownloadTemplate = () => downloadCsvTemplate(bulkUpload.rawCsvText);

  const handleParseCsv = () => {
    const parsed = parseCsvContent(bulkUpload.rawCsvText);
    bulkUpload.setParsedRows(parsed.rows);
    bulkUpload.setImportStep(2);
  };

  const handleExecuteImport = () => {
    const validRows = bulkUpload.parsedRows.filter((r) => r.isValid);
    const newStudents: StudentRecordData[] = validRows.map((r, i) => ({
      id: crypto.randomUUID(),
      institutionId: institution.id,
      institutionName: institution.institutionName,
      studentName: r.studentName,
      rollNumber: r.rollNumber || `ROLL-${i + 1}`,
      phone: r.phone,
      stream: r.stream || 'Vocational Trade',
      passingYear: r.passingYear || '2026',
      profileCompleted: false,
      placementStatus: 'Available',
      state: 'invited',
      invitedAt: new Date().toISOString().split('T')[0],
    }));

    setStudents([...newStudents, ...students]);
    bulkUpload.setImportStep(3);
    addToast({
      type: 'success',
      title: 'Bulk Students Imported',
      message: `${validRows.length} candidates registered in invited state. Zero SMS sent (BULK-03).`,
    });
  };

  const handleScheduleWave = () => {
    bulkUpload.setImportStep(4);
    addToast({
      type: 'info',
      title: 'Invite Wave Queued',
      message:
        'Batch dispatched with cost preview. Students will receive verification links via MSG91 OTP hook.',
    });
  };

  const handleQuickAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickStudentName.trim() || !quickRollNumber.trim() || !quickPhone.trim()) {
      addToast({
        type: 'error',
        title: 'Missing Info',
        message: 'Name, Roll Number, and Phone are required.',
      });
      return;
    }
    const cleanPhone = quickPhone.replace(/\D/g, '');
    if (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      addToast({
        type: 'error',
        title: 'Invalid Mobile',
        message: 'Enter a valid 10-digit Indian mobile number.',
      });
      return;
    }

    const newStudent = createQuickStudent(
      institution.id,
      quickStudentName,
      quickRollNumber,
      cleanPhone,
      quickStream,
      quickPassingYear,
    );
    setStudents([newStudent, ...students]);
    setQuickStudentName('');
    setQuickRollNumber('');
    setQuickPhone('');
    setIsAddingStudent(false);
    addToast({
      type: 'success',
      title: 'Student Registered',
      message: `${newStudent.studentName} enrolled in invited state.`,
    });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const tradesArray = profileForm.formTradesInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const validationResult = institutionProfileSchema.safeParse({
      institutionName: profileForm.formInstName,
      institutionType: profileForm.formInstType,
      affiliation: profileForm.formAffiliation,
      affiliationCode: profileForm.formAffiliationCode,
      establishmentYear: profileForm.formEstablishmentYear,
      principalName: profileForm.formPrincipalName,
      contactPerson: profileForm.formContactPerson,
      contactDesignation: profileForm.formContactDesignation,
      contactEmail: profileForm.formContactEmail || undefined,
      contactPhone: profileForm.formContactPhone,
      website: profileForm.formWebsite || undefined,
      address: profileForm.formAddress,
      city: profileForm.formCity,
      district: profileForm.formDistrict,
      state: profileForm.formState,
      pincode: profileForm.formPincode || undefined,
      tradesOffered: tradesArray,
      annualCapacity: profileForm.formAnnualCapacity,
      placementBrochureUrl: profileForm.formBrochureUrl || undefined,
      about: profileForm.formAbout,
    });

    if (!validationResult.success) {
      const err =
        validationResult.error.errors[0]?.message || 'Please check all required profile fields.';
      addToast({ type: 'error', title: 'Validation Error', message: err });
      return;
    }

    if (!accessToken || !user?.id) {
      addToast({
        type: 'error',
        title: 'Authentication Required',
        message: 'Please log in to save institution profile.',
      });
      return;
    }

    const apiUrl =
      process.env['NEXT_PUBLIC_API_URL'] ||
      process.env['API_URL'] ||
      'http://localhost:3001';
    const authHeader = `Bearer ${accessToken}`;

    try {
      const res = await fetch(`${apiUrl}/profiles/institution/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
          'x-user-id': user.id,
        },
        body: JSON.stringify(validationResult.data),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData?.message || 'Failed to update institution profile');
      }

      const updated = await res.json();
      setInstitution((prev) => ({
        ...prev,
        institutionName: updated.institutionName || profileForm.formInstName,
        institutionType: updated.institutionType || profileForm.formInstType,
        affiliation: updated.affiliation || profileForm.formAffiliation,
        affiliationCode: updated.affiliationCode || profileForm.formAffiliationCode,
        establishmentYear: Number(updated.establishmentYear || profileForm.formEstablishmentYear),
        principalName: updated.principalName || profileForm.formPrincipalName,
        contactPerson: updated.contactPerson || profileForm.formContactPerson,
        contactDesignation: updated.contactDesignation || profileForm.formContactDesignation,
        contactEmail: updated.contactEmail || profileForm.formContactEmail,
        contactPhone: updated.contactPhone || profileForm.formContactPhone,
        website: updated.website || profileForm.formWebsite,
        address: updated.address || profileForm.formAddress,
        city: updated.city || profileForm.formCity,
        district: updated.district || profileForm.formDistrict,
        state: updated.state || profileForm.formState,
        pincode: updated.pincode || profileForm.formPincode,
        tradesOffered: tradesArray,
        annualCapacity: Number(updated.annualCapacity || profileForm.formAnnualCapacity),
        placementBrochureUrl: updated.placementBrochureUrl || profileForm.formBrochureUrl,
        about: updated.about || profileForm.formAbout,
        isOnboardingComplete: true,
      }));

      setIsOnboardingComplete(true);
      setIsEditingProfile(false);
      addToast({
        type: 'success',
        title: 'Profile Updated',
        message: 'Institution profile saved successfully.',
      });
    } catch (err) {
      Sentry.captureException(err);
      addToast({
        type: 'error',
        title: 'Profile Update Failed',
        message: err instanceof Error ? err.message : 'Failed to update institution profile.',
      });
    }
  };

  return {
    activeTab,
    setActiveTab,
    institution,
    isOnboardingComplete,
    isEditingProfile,
    setIsEditingProfile,
    students,
    setStudents,
    filteredStudents,
    tieUps,
    setTieUps,
    applications,
    setApplications,
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
    quickAddFormData: {
      quickStudentName,
      setQuickStudentName,
      quickRollNumber,
      setQuickRollNumber,
      quickPhone,
      setQuickPhone,
      quickStream,
      setQuickStream,
      quickPassingYear,
      setQuickPassingYear,
    },
    handleDownloadTemplate,
    handleParseCsv,
    handleExecuteImport,
    handleScheduleWave,
    handleQuickAddStudent,
    handleSaveProfile,
  };
}
