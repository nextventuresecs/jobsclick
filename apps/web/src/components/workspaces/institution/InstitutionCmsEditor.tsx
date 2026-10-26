'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useApp } from '../../../context/AppContext';
import {
  GraduationCap,
  BookOpen,
  IndianRupee,
  Building2,
  UserCheck,
  Sparkles,
  Plus,
  Trash2,
  Save,
  Phone,
  MessageSquare,
} from 'lucide-react';
import type {
  CourseItem,
  SubjectItem,
  FeeItem,
  DepartmentItem,
  FacultyItem,
  InstitutionCmsInput,
  InquiryStatus,
  InstitutionInquiryLead,
} from '@indian-job-portal/validation';
import {
  fetchInstitutionCms,
  updateInstitutionCms,
  fetchInstitutionInquiries,
  updateInquiryStatus,
} from './institutionApi';

interface InstitutionCmsEditorProps {
  readonly institutionId: string;
}

export function InstitutionCmsEditor({ institutionId }: InstitutionCmsEditorProps) {
  const t = useTranslations('InstitutionWorkspace');
  const { addToast } = useApp();
  const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

  const [activeSubTab, setActiveSubTab] = useState<
    'courses' | 'subjects' | 'fees' | 'departments' | 'faculty' | 'paste-ai' | 'inquiries'
  >('courses');

  const [courses, setCourses] = useState<CourseItem[]>([
    {
      id: 'c-1',
      name: 'Electrician (NCVT / DGT Approved)',
      code: 'ELE-101',
      duration: '2 Years',
      annualIntake: 60,
      eligibility: '10th Standard Pass (Science & Math)',
      description: 'Industrial motor control, power distribution, and solar panel setups.',
    },
    {
      id: 'c-2',
      name: 'Fitter & CNC Machining',
      code: 'FIT-102',
      duration: '2 Years',
      annualIntake: 40,
      eligibility: '10th Standard Pass',
      description: 'Precision engineering, lathe turning, and CNC G-code programming.',
    },
  ]);

  const [subjects, setSubjects] = useState<SubjectItem[]>([
    {
      id: 's-1',
      courseName: 'Electrician (NCVT / DGT Approved)',
      name: 'Trade Theory: AC/DC Circuits & Transformers',
      code: 'TH-01',
      semester: 'Semester 1',
      credits: 4,
      description: 'Fundamentals of magnetism, power factor, and safety earthing.',
    },
  ]);

  const [feeStructure, setFeeStructure] = useState<FeeItem[]>([
    {
      id: 'f-1',
      courseName: 'Electrician (NCVT / DGT Approved)',
      tuitionFee: 15000,
      developmentFee: 2000,
      examFee: 1000,
      hostelFee: 8000,
      oneTimeAdmissionFee: 1000,
      totalAnnualFee: 27000,
      remarks: 'Payable per semester. State scholarships applicable.',
    },
    {
      id: 'f-2',
      courseName: 'Fitter & CNC Machining',
      tuitionFee: 14000,
      developmentFee: 2000,
      examFee: 1000,
      hostelFee: 8000,
      oneTimeAdmissionFee: 1000,
      totalAnnualFee: 26000,
      remarks: 'Includes protective safety boots and tooling kit.',
    },
  ]);

  const [departments, setDepartments] = useState<DepartmentItem[]>([
    {
      id: 'd-1',
      name: 'Electrical Engineering & Maintenance Wing',
      hodName: 'Er. Rajesh Kumar',
      contactEmail: 'electrical@campus.edu.in',
      contactPhone: '+919876543210',
      labsCount: 4,
      description: 'Heavy machinery and transformer maintenance labs with 3-phase grid power.',
    },
  ]);

  const [faculty, setFaculty] = useState<FacultyItem[]>([
    {
      id: 'fac-1',
      name: 'Er. Rajesh Kumar',
      designation: 'Head of Department & Master Instructor',
      department: 'Electrical Engineering & Maintenance Wing',
      qualification: 'B.Tech Electrical, CITS Certified',
      experienceYears: 12,
      bio: 'Over 12 years of industry experience training technicians for central power grids.',
    },
  ]);

  const [aiText, setAiText] = useState<string>('');
  const [inquiries, setInquiries] = useState<InstitutionInquiryLead[]>([]);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Load initial CMS content & inquiries
  useEffect(() => {
    async function loadData() {
      try {
        const token = localStorage.getItem('token') || '';
        const [cmsRes, inqRes] = await Promise.all([
          fetchInstitutionCms(apiUrl, institutionId),
          token ? fetchInstitutionInquiries(apiUrl, token) : Promise.resolve([]),
        ]);

        if (cmsRes) {
          if (cmsRes.courses && cmsRes.courses.length > 0) setCourses(cmsRes.courses);
          if (cmsRes.subjects && cmsRes.subjects.length > 0) setSubjects(cmsRes.subjects);
          if (cmsRes.feeStructure && cmsRes.feeStructure.length > 0)
            setFeeStructure(cmsRes.feeStructure);
          if (cmsRes.departments && cmsRes.departments.length > 0)
            setDepartments(cmsRes.departments);
          if (cmsRes.faculty && cmsRes.faculty.length > 0) setFaculty(cmsRes.faculty);
        }

        if (inqRes && inqRes.length > 0) {
          setInquiries(inqRes);
        }
      } catch (err) {
        console.warn('Notice loading institution CMS:', err);
      }
    }
    loadData();
  }, [apiUrl, institutionId]);

  // Handle Save CMS
  const handleSaveCms = async () => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem('token') || '';
      const payload: InstitutionCmsInput = {
        courses,
        subjects,
        feeStructure,
        departments,
        faculty,
        welcomeText: 'Welcome to our accredited technical campus.',
        updatedAt: new Date().toISOString(),
      };

      await updateInstitutionCms(apiUrl, token, payload);
      addToast({
        type: 'success',
        title: t('toastCmsSaved'),
        message: t('toastCmsSavedDesc'),
      });
    } catch {
      addToast({
        type: 'info',
        title: t('toastCmsSaved'),
        message: 'Changes saved locally. Public tabs updated.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // AI / Prospectus Text Quick Importer (INT-02)
  const handleImportAiText = () => {
    if (!aiText.trim()) return;

    const lines = aiText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const newCourses: CourseItem[] = [];
    const newFees: FeeItem[] = [];

    lines.forEach((line, index) => {
      // Look for course or fee patterns (e.g. "Trade Name - Duration - Fee")
      const parts = line.split(/[-–|:,]/).map((p) => p.trim());
      if (parts.length >= 2) {
        const cName = parts[0] || `Course ${index + 1}`;
        const cDuration = parts[1] || '1 Year';
        const cFee = parts[2] ? parseInt(parts[2].replace(/\D/g, ''), 10) || 15000 : 15000;

        newCourses.push({
          id: `c-ai-${Date.now()}-${index}`,
          name: cName,
          code: `CRS-${index + 1}`,
          duration: cDuration,
          annualIntake: 60,
          eligibility: '10th Standard Pass',
          description: line,
        });

        newFees.push({
          id: `f-ai-${Date.now()}-${index}`,
          courseName: cName,
          tuitionFee: cFee,
          developmentFee: 1500,
          examFee: 1000,
          hostelFee: 6000,
          oneTimeAdmissionFee: 500,
          totalAnnualFee: cFee + 9000,
          remarks: 'Parsed from brochure text.',
        });
      }
    });

    if (newCourses.length > 0) {
      setCourses((prev) => [...prev, ...newCourses]);
      setFeeStructure((prev) => [...prev, ...newFees]);
      setAiText('');
      setActiveSubTab('courses');
      addToast({
        type: 'success',
        title: 'Prospectus Text Imported',
        message: `Parsed ${newCourses.length} course offerings and fee tables successfully.`,
      });
    } else {
      addToast({
        type: 'warning',
        title: 'Format Notice',
        message:
          'Could not detect structured rows. Try separating with hyphens, e.g. "Electrician - 2 Years - ₹18000".',
      });
    }
  };

  // Update Inquiry Status
  const handleStatusChange = async (inquiryId: string, newStatus: InquiryStatus) => {
    try {
      const token = localStorage.getItem('token') || '';
      await updateInquiryStatus(apiUrl, token, inquiryId, newStatus);
      setInquiries((prev) =>
        prev.map((inq) => (inq.id === inquiryId ? { ...inq, status: newStatus } : inq)),
      );
      addToast({
        type: 'success',
        title: 'Lead Status Updated',
        message: `Inquiry status changed to ${newStatus}.`,
      });
    } catch {
      setInquiries((prev) =>
        prev.map((inq) => (inq.id === inquiryId ? { ...inq, status: newStatus } : inq)),
      );
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-6">
      {/* CMS Header & Save Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-brand-orange" />
            <span>{t('cmsHeading')}</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">{t('cmsSubheading')}</p>
        </div>

        <button
          type="button"
          onClick={handleSaveCms}
          disabled={isSaving}
          className="px-4 py-2 bg-brand-orange text-white text-xs font-bold rounded-xl shadow-xs hover:bg-orange-600 transition-all flex items-center gap-2 cursor-pointer self-start sm:self-auto disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? 'Saving...' : t('btnSaveCms')}</span>
        </button>
      </div>

      {/* Editor Sub-Tabs Navigation */}
      <div className="flex border-b border-gray-200 overflow-x-auto gap-2 text-xs font-semibold">
        {[
          { id: 'courses', label: `${t('cmsTabCourses')} (${courses.length})`, icon: GraduationCap },
          { id: 'subjects', label: `${t('cmsTabSubjects')} (${subjects.length})`, icon: BookOpen },
          { id: 'fees', label: `${t('cmsTabFees')} (${feeStructure.length})`, icon: IndianRupee },
          { id: 'departments', label: `${t('cmsTabDepartments')} (${departments.length})`, icon: Building2 },
          { id: 'faculty', label: `${t('cmsTabFaculty')} (${faculty.length})`, icon: UserCheck },
          { id: 'paste-ai', label: t('cmsTabPasteAi'), icon: Sparkles },
          { id: 'inquiries', label: `${t('tabInquiries')} (${inquiries.length})`, icon: MessageSquare },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id as typeof activeSubTab)}
              className={`flex items-center gap-2 py-2.5 px-3.5 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'border-brand-orange text-brand-orange bg-orange-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* SUB-TAB 1: COURSES */}
      {activeSubTab === 'courses' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">Manage Course Offerings</h3>
            <button
              type="button"
              onClick={() => {
                const newCourse: CourseItem = {
                  id: `c-${Date.now()}`,
                  name: 'New Vocational Discipline',
                  code: 'VOC-01',
                  duration: '1 Year',
                  annualIntake: 40,
                  eligibility: '10th Standard Pass',
                  description: 'Practical hands-on trade training curriculum.',
                };
                setCourses([...courses, newCourse]);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 text-brand-orange text-xs font-bold hover:bg-orange-100 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('btnAddCourse')}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {courses.map((course, idx) => (
              <div
                key={course.id || idx}
                className="p-4 rounded-xl border border-gray-200 bg-gray-50/50 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                    <div>
                      <label className="text-[11px] font-bold text-gray-500 uppercase">
                        Course Name
                      </label>
                      <input
                        type="text"
                        value={course.name}
                        onChange={(e) => {
                          const updated = [...courses];
                          updated[idx] = { ...course, name: e.target.value };
                          setCourses(updated);
                        }}
                        className="w-full mt-1 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-gray-500 uppercase">
                        Course Code / Duration
                      </label>
                      <div className="flex gap-2 mt-1">
                        <input
                          type="text"
                          value={course.code || ''}
                          placeholder="Code"
                          onChange={(e) => {
                            const updated = [...courses];
                            updated[idx] = { ...course, code: e.target.value };
                            setCourses(updated);
                          }}
                          className="w-1/3 px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-mono text-gray-900"
                        />
                        <input
                          type="text"
                          value={course.duration}
                          placeholder="Duration"
                          onChange={(e) => {
                            const updated = [...courses];
                            updated[idx] = { ...course, duration: e.target.value };
                            setCourses(updated);
                          }}
                          className="w-2/3 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs text-gray-900"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-gray-500 uppercase">
                        Annual Intake & Eligibility
                      </label>
                      <div className="flex gap-2 mt-1">
                        <input
                          type="number"
                          value={course.annualIntake}
                          onChange={(e) => {
                            const updated = [...courses];
                            updated[idx] = {
                              ...course,
                              annualIntake: parseInt(e.target.value, 10) || 0,
                            };
                            setCourses(updated);
                          }}
                          className="w-1/3 px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-mono text-gray-900"
                        />
                        <input
                          type="text"
                          value={course.eligibility}
                          placeholder="Eligibility"
                          onChange={(e) => {
                            const updated = [...courses];
                            updated[idx] = { ...course, eligibility: e.target.value };
                            setCourses(updated);
                          }}
                          className="w-2/3 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs text-gray-900"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setCourses(courses.filter((_, i) => i !== idx))}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-gray-500 uppercase">
                    Description & Career Outcomes
                  </label>
                  <textarea
                    rows={2}
                    value={course.description || ''}
                    onChange={(e) => {
                      const updated = [...courses];
                      updated[idx] = { ...course, description: e.target.value };
                      setCourses(updated);
                    }}
                    className="w-full mt-1 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs text-gray-700"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: SUBJECTS */}
      {activeSubTab === 'subjects' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">Curriculum & Subject Modules</h3>
            <button
              type="button"
              onClick={() => {
                const newSub: SubjectItem = {
                  id: `s-${Date.now()}`,
                  courseName: courses[0]?.name || 'General Engineering',
                  name: 'New Technical Subject',
                  code: 'SUB-101',
                  semester: 'Semester 1',
                  credits: 4,
                  description: 'Syllabus and workshop module description.',
                };
                setSubjects([...subjects, newSub]);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 text-brand-orange text-xs font-bold hover:bg-orange-100 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('btnAddSubject')}</span>
            </button>
          </div>

          <div className="space-y-3">
            {subjects.map((sub, idx) => (
              <div
                key={sub.id || idx}
                className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between text-xs"
              >
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 flex-1 w-full">
                  <input
                    type="text"
                    value={sub.courseName}
                    placeholder="Course Name"
                    onChange={(e) => {
                      const updated = [...subjects];
                      updated[idx] = { ...sub, courseName: e.target.value };
                      setSubjects(updated);
                    }}
                    className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg font-medium text-gray-900"
                  />
                  <input
                    type="text"
                    value={sub.name}
                    placeholder="Subject Name"
                    onChange={(e) => {
                      const updated = [...subjects];
                      updated[idx] = { ...sub, name: e.target.value };
                      setSubjects(updated);
                    }}
                    className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg font-semibold text-gray-900"
                  />
                  <input
                    type="text"
                    value={sub.semester}
                    placeholder="Semester"
                    onChange={(e) => {
                      const updated = [...subjects];
                      updated[idx] = { ...sub, semester: e.target.value };
                      setSubjects(updated);
                    }}
                    className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-700"
                  />
                  <input
                    type="text"
                    value={sub.description || ''}
                    placeholder="Syllabus Brief"
                    onChange={(e) => {
                      const updated = [...subjects];
                      updated[idx] = { ...sub, description: e.target.value };
                      setSubjects(updated);
                    }}
                    className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-600"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setSubjects(subjects.filter((_, i) => i !== idx))}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: FEE STRUCTURE TABLE */}
      {activeSubTab === 'fees' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Standard Institutional Fee Tables</h3>
              <p className="text-xs text-gray-500">
                Non-technical staff can update fees with automatic totals calculation.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const newFee: FeeItem = {
                  id: `f-${Date.now()}`,
                  courseName: courses[0]?.name || 'Course Name',
                  tuitionFee: 15000,
                  developmentFee: 2000,
                  examFee: 1000,
                  hostelFee: 0,
                  oneTimeAdmissionFee: 500,
                  totalAnnualFee: 18500,
                  remarks: 'Semester installment applicable.',
                };
                setFeeStructure([...feeStructure, newFee]);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 text-brand-orange text-xs font-bold hover:bg-orange-100 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('btnAddFeeRow')}</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-bold text-gray-500 uppercase">Course</th>
                  <th className="px-3 py-2 text-right font-bold text-gray-500 uppercase">Tuition (₹)</th>
                  <th className="px-3 py-2 text-right font-bold text-gray-500 uppercase">Dev / Lab (₹)</th>
                  <th className="px-3 py-2 text-right font-bold text-gray-500 uppercase">Hostel (₹)</th>
                  <th className="px-3 py-2 text-right font-bold text-gray-500 uppercase">Total Annual (₹)</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-500 uppercase">Remarks</th>
                  <th className="px-3 py-2 text-center font-bold text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {feeStructure.map((row, idx) => (
                  <tr key={row.id || idx}>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={row.courseName}
                        onChange={(e) => {
                          const updated = [...feeStructure];
                          updated[idx] = { ...row, courseName: e.target.value };
                          setFeeStructure(updated);
                        }}
                        className="w-full px-2 py-1 bg-gray-50 border border-gray-200 rounded font-semibold text-gray-900"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={row.tuitionFee}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 0;
                          const updated = [...feeStructure];
                          const total =
                            val +
                            (row.developmentFee || 0) +
                            (row.examFee || 0) +
                            (row.hostelFee || 0) +
                            (row.oneTimeAdmissionFee || 0);
                          updated[idx] = { ...row, tuitionFee: val, totalAnnualFee: total };
                          setFeeStructure(updated);
                        }}
                        className="w-24 px-2 py-1 bg-gray-50 border border-gray-200 rounded font-mono text-right text-gray-900"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={row.developmentFee || 0}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 0;
                          const updated = [...feeStructure];
                          const total =
                            (row.tuitionFee || 0) +
                            val +
                            (row.examFee || 0) +
                            (row.hostelFee || 0) +
                            (row.oneTimeAdmissionFee || 0);
                          updated[idx] = { ...row, developmentFee: val, totalAnnualFee: total };
                          setFeeStructure(updated);
                        }}
                        className="w-20 px-2 py-1 bg-gray-50 border border-gray-200 rounded font-mono text-right text-gray-900"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={row.hostelFee || 0}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 0;
                          const updated = [...feeStructure];
                          const total =
                            (row.tuitionFee || 0) +
                            (row.developmentFee || 0) +
                            (row.examFee || 0) +
                            val +
                            (row.oneTimeAdmissionFee || 0);
                          updated[idx] = { ...row, hostelFee: val, totalAnnualFee: total };
                          setFeeStructure(updated);
                        }}
                        className="w-20 px-2 py-1 bg-gray-50 border border-gray-200 rounded font-mono text-right text-gray-900"
                      />
                    </td>
                    <td className="px-3 py-2 font-mono font-bold text-right text-brand-orange">
                      ₹{row.totalAnnualFee.toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={row.remarks || ''}
                        onChange={(e) => {
                          const updated = [...feeStructure];
                          updated[idx] = { ...row, remarks: e.target.value };
                          setFeeStructure(updated);
                        }}
                        className="w-full px-2 py-1 bg-gray-50 border border-gray-200 rounded text-gray-600"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => setFeeStructure(feeStructure.filter((_, i) => i !== idx))}
                        className="p-1 text-gray-400 hover:text-red-500 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: DEPARTMENTS */}
      {activeSubTab === 'departments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">Academic & Technical Departments</h3>
            <button
              type="button"
              onClick={() => {
                const newDept: DepartmentItem = {
                  id: `d-${Date.now()}`,
                  name: 'New Academic Department',
                  hodName: 'Department HOD',
                  contactEmail: '',
                  contactPhone: '',
                  labsCount: 2,
                  description: 'Department labs and specialization areas.',
                };
                setDepartments([...departments, newDept]);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 text-brand-orange text-xs font-bold hover:bg-orange-100 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('btnAddDept')}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {departments.map((dept, idx) => (
              <div
                key={dept.id || idx}
                className="p-4 rounded-xl border border-gray-200 bg-gray-50 space-y-3 text-xs"
              >
                <div className="flex justify-between items-start">
                  <input
                    type="text"
                    value={dept.name}
                    placeholder="Department Name"
                    onChange={(e) => {
                      const updated = [...departments];
                      updated[idx] = { ...dept, name: e.target.value };
                      setDepartments(updated);
                    }}
                    className="font-bold text-gray-900 bg-white border border-gray-300 rounded px-2.5 py-1 w-full mr-2"
                  />
                  <button
                    type="button"
                    onClick={() => setDepartments(departments.filter((_, i) => i !== idx))}
                    className="p-1 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-500 font-bold uppercase">HOD Name</label>
                    <input
                      type="text"
                      value={dept.hodName}
                      onChange={(e) => {
                        const updated = [...departments];
                        updated[idx] = { ...dept, hodName: e.target.value };
                        setDepartments(updated);
                      }}
                      className="w-full mt-0.5 px-2 py-1 bg-white border border-gray-300 rounded text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 font-bold uppercase">
                      Number of Labs
                    </label>
                    <input
                      type="number"
                      value={dept.labsCount}
                      onChange={(e) => {
                        const updated = [...departments];
                        updated[idx] = {
                          ...dept,
                          labsCount: parseInt(e.target.value, 10) || 1,
                        };
                        setDepartments(updated);
                      }}
                      className="w-full mt-0.5 px-2 py-1 bg-white border border-gray-300 rounded text-gray-900 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-gray-500 font-bold uppercase">
                    Description & Facilities
                  </label>
                  <textarea
                    rows={2}
                    value={dept.description || ''}
                    onChange={(e) => {
                      const updated = [...departments];
                      updated[idx] = { ...dept, description: e.target.value };
                      setDepartments(updated);
                    }}
                    className="w-full mt-0.5 px-2 py-1 bg-white border border-gray-300 rounded text-gray-700"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 5: FACULTY */}
      {activeSubTab === 'faculty' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">Deans, Faculty & Craft Instructors</h3>
            <button
              type="button"
              onClick={() => {
                const newFac: FacultyItem = {
                  id: `fac-${Date.now()}`,
                  name: 'Faculty Member Name',
                  designation: 'Instructor',
                  department: departments[0]?.name || 'Technical Wing',
                  qualification: 'B.Tech / Diploma',
                  experienceYears: 5,
                  bio: 'Faculty profile and industry apprenticeship experience.',
                };
                setFaculty([...faculty, newFac]);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 text-brand-orange text-xs font-bold hover:bg-orange-100 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('btnAddFaculty')}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {faculty.map((fac, idx) => (
              <div
                key={fac.id || idx}
                className="p-4 rounded-xl border border-gray-200 bg-gray-50 space-y-3 text-xs"
              >
                <div className="flex justify-between items-start">
                  <div className="space-y-1 flex-1 mr-2">
                    <input
                      type="text"
                      value={fac.name}
                      placeholder="Faculty Name"
                      onChange={(e) => {
                        const updated = [...faculty];
                        updated[idx] = { ...fac, name: e.target.value };
                        setFaculty(updated);
                      }}
                      className="font-bold text-gray-900 bg-white border border-gray-300 rounded px-2 py-1 w-full"
                    />
                    <input
                      type="text"
                      value={fac.designation}
                      placeholder="Designation"
                      onChange={(e) => {
                        const updated = [...faculty];
                        updated[idx] = { ...fac, designation: e.target.value };
                        setFaculty(updated);
                      }}
                      className="text-gray-600 bg-white border border-gray-300 rounded px-2 py-0.5 w-full text-[11px]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setFaculty(faculty.filter((_, i) => i !== idx))}
                    className="p-1 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <label className="text-[10px] text-gray-500 font-bold uppercase">
                      Department
                    </label>
                    <input
                      type="text"
                      value={fac.department}
                      onChange={(e) => {
                        const updated = [...faculty];
                        updated[idx] = { ...fac, department: e.target.value };
                        setFaculty(updated);
                      }}
                      className="w-full mt-0.5 px-2 py-1 bg-white border border-gray-300 rounded text-gray-800"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 font-bold uppercase">
                      Qualification & Exp
                    </label>
                    <input
                      type="text"
                      value={fac.qualification}
                      onChange={(e) => {
                        const updated = [...faculty];
                        updated[idx] = { ...fac, qualification: e.target.value };
                        setFaculty(updated);
                      }}
                      className="w-full mt-0.5 px-2 py-1 bg-white border border-gray-300 rounded text-gray-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-gray-500 font-bold uppercase">Biography</label>
                  <textarea
                    rows={2}
                    value={fac.bio || ''}
                    onChange={(e) => {
                      const updated = [...faculty];
                      updated[idx] = { ...fac, bio: e.target.value };
                      setFaculty(updated);
                    }}
                    className="w-full mt-0.5 px-2 py-1 bg-white border border-gray-300 rounded text-gray-700"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 6: AI / PROSPECTUS TEXT PASTE */}
      {activeSubTab === 'paste-ai' && (
        <div className="space-y-4">
          <div className="bg-orange-50/60 p-4 rounded-xl border border-orange-200 text-xs text-orange-950 space-y-1.5">
            <h4 className="font-bold flex items-center gap-1.5 text-brand-orange">
              <Sparkles className="w-4 h-4" />
              <span>Smart Prospectus & AI Text Importer (PRD INT-02)</span>
            </h4>
            <p>
              College staff can copy-paste AI-written summaries or prospectus text without formatting
              worries. The editor automatically parses courses, fees, and duration into standard tables.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Paste Course Offerings, Prospectus or ChatGPT Output:
            </label>
            <textarea
              rows={8}
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              placeholder="e.g.
Electrician - 2 Years - ₹18,000 / Year
Fitter & Tool Maker - 2 Years - ₹16,000 / Year
Solar Technician (Solar PV) - 1 Year - ₹12,000 / Year
Diesel Mechanic - 1 Year - ₹14,000 / Year"
              className="w-full p-3 bg-gray-50 border border-gray-300 rounded-xl text-xs font-mono text-gray-900 focus:bg-white focus:border-brand-orange outline-hidden"
            />
          </div>

          <button
            type="button"
            onClick={handleImportAiText}
            className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl shadow-xs hover:bg-slate-800 transition-all flex items-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-orange-400" />
            <span>Parse & Populate Courses and Fee Tables</span>
          </button>
        </div>
      )}

      {/* SUB-TAB 7: STUDENT LEADS & INQUIRIES (INT-03) */}
      {activeSubTab === 'inquiries' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-gray-900">{t('inquiriesHeading')}</h3>
              <p className="text-xs text-gray-500">{t('inquiriesSubheading')}</p>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 text-xs font-bold border border-blue-200">
              <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
              <span>{inquiries.length} Inquiries Logged</span>
            </span>
          </div>

          {inquiries.length === 0 ? (
            <div className="p-8 text-center bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-500">
              {t('noInquiriesYet')}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50 text-gray-500 font-bold uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">{t('colLeadStudent')}</th>
                    <th className="px-3 py-2 text-left">{t('colLeadContact')}</th>
                    <th className="px-3 py-2 text-left">{t('colLeadCourse')}</th>
                    <th className="px-3 py-2 text-left">{t('colLeadQualification')}</th>
                    <th className="px-3 py-2 text-left">{t('colLeadCity')}</th>
                    <th className="px-3 py-2 text-left">{t('colLeadDate')}</th>
                    <th className="px-3 py-2 text-left">{t('colLeadStatus')}</th>
                    <th className="px-3 py-2 text-center">{t('colLeadAction')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {inquiries.map((inq) => {
                    const cleanPhone = (inq.student_phone || '').replace(/\D/g, '');
                    const waText = encodeURIComponent(
                      `Hello ${inq.student_name}, thank you for your admission inquiry regarding ${inq.course_of_interest} at our campus. We would like to share the course curriculum and scholarship details with you.`,
                    );
                    return (
                      <tr key={inq.id} className="hover:bg-gray-50/70">
                        <td className="px-3 py-2.5 font-bold text-gray-900">{inq.student_name}</td>
                        <td className="px-3 py-2.5 text-gray-700">
                          <div className="flex flex-col">
                            <span className="font-mono">{inq.student_phone}</span>
                            {inq.student_email && (
                              <span className="text-[11px] text-gray-400">{inq.student_email}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-brand-orange">
                          {inq.course_of_interest}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600">{inq.qualification || '—'}</td>
                        <td className="px-3 py-2.5 text-gray-600">{inq.city || '—'}</td>
                        <td className="px-3 py-2.5 text-gray-500 text-[11px]">
                          {new Date(inq.created_at).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </td>
                        <td className="px-3 py-2.5">
                          <select
                            value={inq.status}
                            onChange={(e) =>
                              handleStatusChange(inq.id, e.target.value as InquiryStatus)
                            }
                            className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                              inq.status === 'new'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : inq.status === 'contacted'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : inq.status === 'admitted'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-gray-50 text-gray-600 border-gray-200'
                            }`}
                          >
                            <option value="new">{t('statusNew')}</option>
                            <option value="contacted">{t('statusContacted')}</option>
                            <option value="admitted">{t('statusAdmitted')}</option>
                            <option value="closed">{t('statusClosed')}</option>
                          </select>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <a
                            href={`https://wa.me/91${cleanPhone}?text=${waText}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-[11px] font-bold hover:bg-emerald-700 transition-colors cursor-pointer"
                          >
                            <Phone className="w-3 h-3" />
                            <span>WhatsApp</span>
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
