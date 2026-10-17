'use client';

import { useState } from 'react';
import type { StudentRecordData, InstitutionProfileData } from '../../../data/sampleWorkspaces';
import { INITIAL_STUDENTS, INITIAL_INSTITUTION_PROFILE } from '../../../data/sampleWorkspaces';
import { institutionProfileSchema } from '@indian-job-portal/validation';
import { useInstitutionProfileState } from './useInstitutionProfileState';
import { useBulkUploadState } from './useBulkUploadState';
import { parseCsvContent, downloadCsvTemplate } from './csvParser';
import { createQuickStudent, filterStudentsList } from './studentUtils';

interface UseInstitutionWorkspaceProps {
  readonly addToast: (toast: { type: 'success' | 'error' | 'info'; title: string; message: string }) => void;
}

export function useInstitutionWorkspace({ addToast }: UseInstitutionWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'profile' | 'students' | 'bulk-import' | 'invitations' | 'qr-code'>('overview');
  const [institution, setInstitution] = useState<InstitutionProfileData>(INITIAL_INSTITUTION_PROFILE);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(institution.isOnboardingComplete);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const profileForm = useInstitutionProfileState(institution);
  const [students, setStudents] = useState<readonly StudentRecordData[]>(INITIAL_STUDENTS);
  const [studentSearch, setStudentSearch] = useState('');
  const [streamFilter, setStreamFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [quickStudentName, setQuickStudentName] = useState('');
  const [quickRollNumber, setQuickRollNumber] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickStream, setQuickStream] = useState('Mechanical Engineering (Diploma)');
  const [quickPassingYear, setQuickPassingYear] = useState('2026');

  const bulkUpload = useBulkUploadState(institution.institutionName, addToast);
  const filteredStudents = filterStudentsList(students, studentSearch, streamFilter, statusFilter);

  const handleDownloadTemplate = () => downloadCsvTemplate(bulkUpload.rawCsvText);

  const handleParseCsv = () => {
    const res = parseCsvContent(bulkUpload.rawCsvText);
    if (res.error) {
      addToast({ type: 'error', title: 'CSV Error', message: res.error });
      return;
    }
    bulkUpload.setParsedRows(res.rows);
    bulkUpload.setImportStep(2);
  };

  const handleExecuteImport = () => {
    const validRows = bulkUpload.parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      addToast({ type: 'error', title: 'No Valid Rows', message: 'Please correct errors before importing.' });
      return;
    }
    const newStudents: StudentRecordData[] = validRows.map((r, idx) => ({
      id: `stu-${Date.now()}-${idx}`, institutionId: institution.id, studentName: r.studentName,
      rollNumber: r.rollNumber, phone: `+91 ${r.phone}`, stream: r.stream, passingYear: r.passingYear,
      profileCompleted: false, placementStatus: 'Available', state: 'invited',
      invitedAt: new Date().toISOString().split('T')[0],
    }));

    setStudents([...newStudents, ...students]);
    bulkUpload.setImportStep(3);
    addToast({
      type: 'success', title: 'Bulk Students Imported',
      message: `${validRows.length} candidates registered in invited state. Zero SMS sent (BULK-03).`,
    });
  };

  const handleScheduleWave = () => {
    bulkUpload.setImportStep(4);
    addToast({
      type: 'info', title: 'Invite Wave Queued',
      message: 'Batch dispatched with cost preview. Students will receive verification links via MSG91 OTP hook.',
    });
  };

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

    const newStudent = createQuickStudent(institution.id, quickStudentName, quickRollNumber, cleanPhone, quickStream, quickPassingYear);
    setStudents([newStudent, ...students]);
    setQuickStudentName('');
    setQuickRollNumber('');
    setQuickPhone('');
    setIsAddingStudent(false);
    addToast({ type: 'success', title: 'Student Registered', message: `${newStudent.studentName} enrolled in invited state.` });
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const tradesArray = profileForm.formTradesInput.split(',').map((t) => t.trim()).filter(Boolean);
    const validationResult = institutionProfileSchema.safeParse({
      institutionName: profileForm.formInstName, institutionType: profileForm.formInstType,
      affiliation: profileForm.formAffiliation, affiliationCode: profileForm.formAffiliationCode,
      establishmentYear: profileForm.formEstablishmentYear, principalName: profileForm.formPrincipalName,
      contactPerson: profileForm.formContactPerson, contactDesignation: profileForm.formContactDesignation,
      contactEmail: profileForm.formContactEmail || undefined, contactPhone: profileForm.formContactPhone,
      website: profileForm.formWebsite || undefined, address: profileForm.formAddress,
      city: profileForm.formCity, district: profileForm.formDistrict, state: profileForm.formState,
      pincode: profileForm.formPincode || undefined, tradesOffered: tradesArray,
      annualCapacity: profileForm.formAnnualCapacity, placementBrochureUrl: profileForm.formBrochureUrl || undefined,
      about: profileForm.formAbout,
    });

    if (!validationResult.success) {
      const err = validationResult.error.errors[0]?.message || 'Please check all required profile fields.';
      addToast({ type: 'error', title: 'Validation Error', message: err });
      return;
    }

    setInstitution({
      ...institution,
      institutionName: profileForm.formInstName, institutionType: profileForm.formInstType,
      affiliation: profileForm.formAffiliation, affiliationCode: profileForm.formAffiliationCode,
      establishmentYear: Number(profileForm.formEstablishmentYear), principalName: profileForm.formPrincipalName,
      contactPerson: profileForm.formContactPerson, contactDesignation: profileForm.formContactDesignation,
      contactEmail: profileForm.formContactEmail, contactPhone: profileForm.formContactPhone,
      website: profileForm.formWebsite, address: profileForm.formAddress, city: profileForm.formCity,
      district: profileForm.formDistrict, state: profileForm.formState, pincode: profileForm.formPincode,
      tradesOffered: tradesArray, annualCapacity: Number(profileForm.formAnnualCapacity),
      placementBrochureUrl: profileForm.formBrochureUrl, about: profileForm.formAbout,
      isOnboardingComplete: true,
    });

    setIsOnboardingComplete(true);
    setIsEditingProfile(false);
    addToast({ type: 'success', title: 'Profile Updated', message: 'Institution profile saved successfully.' });
  };

  return {
    activeTab, setActiveTab, institution, isOnboardingComplete,
    isEditingProfile, setIsEditingProfile, students, filteredStudents,
    studentSearch, setStudentSearch, streamFilter, setStreamFilter,
    statusFilter, setStatusFilter, isAddingStudent, setIsAddingStudent,
    profileForm, bulkUpload,
    quickAddFormData: {
      quickStudentName, setQuickStudentName, quickRollNumber, setQuickRollNumber,
      quickPhone, setQuickPhone, quickStream, setQuickStream, quickPassingYear, setQuickPassingYear,
    },
    handleDownloadTemplate, handleParseCsv, handleExecuteImport,
    handleScheduleWave, handleQuickAddStudent, handleSaveProfile,
  };
}
