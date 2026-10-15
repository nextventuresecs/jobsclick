'use client';

import React, { useState } from 'react';
import {
  INITIAL_STUDENTS,
  StudentRecordData,
} from '../../data/sampleWorkspaces';
import { Button } from '@indian-job-portal/ui';
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

export function InstitutionWorkspace() {
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'bulk-import' | 'invitations'>('overview');
  const [students, setStudents] = useState<readonly StudentRecordData[]>(INITIAL_STUDENTS);

  // Bulk Import Workflow state
  const [importStep, setImportStep] = useState<1 | 2 | 3 | 4>(1);
  const [parsedRows, setParsedRows] = useState<readonly ParsedRow[]>([]);

  const sampleCsvContent = `Student Name,Roll Number,Phone,Stream,Passing Year
Manish Kushwaha,0801ME221102,9826112233,Mechanical Engineering (Diploma),2026
Ankita Soni,0801EC221105,9893044556,Electronics & Comm (Diploma),2026
Sunil Solanki,0801IT221110,9111455667,ITI Machinist & Fitter,2025
Pooja Rajput,0801EE221115,9752099881,Electrical Engineering (Diploma),2026
Rajendra Bheel,0801CS221120,9300188223,Computer Science (B.Tech),2026`;

  const handleDownloadTemplate = () => {
    const blob = new Blob([sampleCsvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'JobsClick_Student_Import_Template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleParseSample = () => {
    const lines = sampleCsvContent.trim().split('\n');
    const rows: ParsedRow[] = lines.slice(1).map((line, idx) => {
      const parts = line.split(',');
      const studentName = parts[0]?.trim() ?? '';
      const rollNumber = parts[1]?.trim() ?? '';
      const phone = parts[2]?.trim() ?? '';
      const stream = parts[3]?.trim() ?? '';
      const passingYear = parts[4]?.trim() ?? '';

      const errors: string[] = [];
      if (!studentName) errors.push('Missing Student Name');
      if (!rollNumber) errors.push('Missing Roll Number');
      if (!phone || phone.length < 10) errors.push('Invalid 10-digit phone');

      return {
        rowNumber: idx + 2,
        studentName,
        rollNumber,
        phone,
        stream,
        passingYear,
        isValid: errors.length === 0,
        errors,
      };
    });

    setParsedRows(rows);
    setImportStep(2);
  };

  const handleExecuteImport = () => {
    // Hard Invariant #2 & #3: Users created in invited state. ZERO SMS sent at import time!
    const newStudents: StudentRecordData[] = parsedRows
      .filter((r) => r.isValid)
      .map((r, idx) => ({
        id: `stu-${Date.now()}-${idx}`,
        institutionId: 'inst-01',
        studentName: r.studentName,
        rollNumber: r.rollNumber,
        phone: `+91 ${r.phone}`,
        stream: r.stream,
        passingYear: r.passingYear,
        profileCompleted: false,
        placementStatus: 'Available',
        state: 'invited', // Hard invariant: users created in 'invited' state
      }));

    setStudents([...newStudents, ...students]);
    setImportStep(3);
  };

  const handleScheduleWave = () => {
    setImportStep(4);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-teal-50 border-2 border-teal-200 flex items-center justify-center shrink-0">
            <GraduationCap className="w-8 h-8 text-teal-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                Government Polytechnic & ITI Placement Cell
              </h1>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-teal-600" />
                <span>NPIU / DGT Recognized</span>
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Department of Technical Education & Skill Development • Institutional Hub
            </p>
          </div>
        </div>

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
          <span>Bulk Student Onboarding</span>
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto gap-2">
        {[
          { id: 'overview', label: 'Placement Cell Overview', icon: GraduationCap },
          { id: 'students', label: `Student Roster (${students.length})`, icon: Users },
          { id: 'bulk-import', label: 'Bulk CSV Import (BULK-01 to 03)', icon: FileSpreadsheet },
          { id: 'invitations', label: 'Invite Batches & Costs', icon: Send },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
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

      {/* TAB: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">Enrolled Students</span>
              <p className="text-2xl font-bold text-gray-900 mt-1">{students.length}</p>
              <p className="text-[11px] text-gray-500 mt-1">Across ITI & Diploma trades</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">Active Profiles</span>
              <p className="text-2xl font-bold text-teal-600 mt-1">
                {students.filter((s) => s.profileCompleted).length}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">Ready for MSME dispatch</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">Job Placements</span>
              <p className="text-2xl font-bold text-emerald-600 mt-1">
                {students.filter((s) => s.placementStatus === 'Placed').length}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">Placed in verified MSMEs</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">Hard Invariant #2</span>
              <div className="flex items-center gap-1.5 mt-2 text-emerald-700 font-semibold text-xs">
                <ShieldCheck className="w-4 h-4" />
                <span>Zero SMS at Import</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">Batch preview enforced</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-900">Recent Student Registrations</h2>
              <button
                type="button"
                onClick={() => setActiveTab('students')}
                className="text-xs font-semibold text-[#F97316] hover:underline"
              >
                View Roster
              </button>
            </div>

            <div className="divide-y divide-gray-100">
              {students.slice(0, 5).map((s) => (
                <div key={s.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">{s.studentName}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Roll: {s.rollNumber} • {s.stream} ({s.passingYear})
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                        s.placementStatus === 'Placed'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-blue-50 text-blue-800 border border-blue-200'
                      }`}
                    >
                      {s.placementStatus}
                    </span>
                    <span className="text-[11px] font-mono text-gray-400">
                      {s.state === 'invited' ? 'State: Invited' : 'State: Active'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB: STUDENTS ROSTER */}
      {activeTab === 'students' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900">Institutional Student Roster</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Vocational students under institutional placement tracking.
              </p>
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                setActiveTab('bulk-import');
                setImportStep(1);
              }}
            >
              Upload Batch
            </Button>
          </div>

          <div className="space-y-3">
            {students.map((st) => (
              <div
                key={st.id}
                className="p-4 rounded-xl border border-gray-200 bg-gray-50/50 hover:bg-white transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <h3 className="text-sm font-bold text-gray-900">{st.studentName}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Roll: <span className="font-mono text-gray-700">{st.rollNumber}</span> • {st.stream} • Batch of {st.passingYear}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                      st.profileCompleted
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {st.profileCompleted ? 'Profile Complete' : 'Profile Pending'}
                  </span>
                  <span className="text-xs font-bold text-gray-700">{st.placementStatus}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: BULK IMPORT (BULK-01 to BULK-03) */}
      {activeTab === 'bulk-import' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="pb-4 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-900">Bulk Student CSV Onboarding Engine</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              BULK-01 to BULK-03 compliant: Browser validation, zero SMS at import, and wave cost preview.
            </p>
          </div>

          {/* Stepper bar */}
          <div className="grid grid-cols-4 gap-2 text-center text-xs font-semibold">
            {[
              { step: 1, label: '1. Select CSV' },
              { step: 2, label: '2. Verify Rows' },
              { step: 3, label: '3. Import Invited' },
              { step: 4, label: '4. Wave Dispatch' },
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

          {/* STEP 1 */}
          {importStep === 1 && (
            <div className="space-y-6">
              <div className="border-2 border-dashed border-teal-300 rounded-2xl p-8 text-center bg-teal-50/30 space-y-4">
                <FileSpreadsheet className="w-12 h-12 text-teal-600 mx-auto" />
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Upload Student Roster CSV</h3>
                  <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                    Columns: Student Name, Roll Number, Phone, Vocational Stream, Passing Year.
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
                    <span>Download Template</span>
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleParseSample}
                    className="inline-flex items-center gap-1.5"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Simulate 5-Student Batch Upload</span>
                  </Button>
                </div>
              </div>

              {/* Hard Invariant #2 reminder */}
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>Hard Invariant #2 & #3:</strong> Bulk import creates candidates in{' '}
                  <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">invited</code> state with{' '}
                  <strong>ZERO SMS sent at import</strong>. Invites go out only when an explicit batch wave is scheduled.
                </span>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {importStep === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Row Validation & Review</h3>
                  <p className="text-xs text-gray-500">{parsedRows.length} rows parsed from CSV</p>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleExecuteImport}
                >
                  Confirm & Import ({parsedRows.filter((r) => r.isValid).length} Valid)
                </Button>
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
                          <span>Valid</span>
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

          {/* STEP 3 */}
          {importStep === 3 && (
            <div className="p-6 rounded-2xl bg-teal-50 border border-teal-200 space-y-4">
              <div className="flex items-center gap-2 text-teal-900">
                <CheckCircle2 className="w-5 h-5 text-teal-600" />
                <h3 className="text-base font-bold">Import Completed Successfully</h3>
              </div>
              <p className="text-xs text-teal-800">
                {parsedRows.length} students enrolled in <code className="bg-white px-1 py-0.5 rounded font-mono font-bold">invited</code> state.
                In accordance with <strong>Hard Invariant #2</strong>, no SMS messages have been dispatched yet.
              </p>

              <div className="bg-white p-4 rounded-xl border border-teal-200 text-xs space-y-2">
                <h4 className="font-bold text-gray-900">SMS Cost Preview (BULK-03)</h4>
                <div className="flex justify-between text-gray-600">
                  <span>Target Recipients:</span>
                  <span className="font-bold text-gray-900">{parsedRows.length} Students</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>DLT Registered SMS Rate:</span>
                  <span className="font-bold text-gray-900">₹0.18 / SMS</span>
                </div>
                <div className="flex justify-between text-gray-900 font-bold pt-2 border-t border-gray-100">
                  <span>Estimated Batch Cost:</span>
                  <span className="text-emerald-700">₹{(parsedRows.length * 0.18).toFixed(2)}</span>
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
                  <span>Authorize & Schedule Invite Wave</span>
                </Button>
              </div>
            </div>
          )}

          {/* STEP 4 */}
          {importStep === 4 && (
            <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-3 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <h3 className="text-base font-bold text-emerald-950">
                Invite Wave Scheduled via BullMQ & MSG91 Hook
              </h3>
              <p className="text-xs text-emerald-800 max-w-md mx-auto">
                Delayed batch delivery queued. Candidates will receive registration link with college affiliation prefilled.
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
                  Back to Student Roster
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: INVITATIONS */}
      {activeTab === 'invitations' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Invite Batches & Tracking</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Monitor candidate registration conversion across batch dispatches.
            </p>
          </div>

          <div className="divide-y divide-gray-100 text-xs">
            <div className="py-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-gray-900">Wave #1 - Diploma Mechanical & ITI 2026</h3>
                <p className="text-gray-500 mt-0.5">Dispatched: 2026-10-01 • 120 Invitations Sent</p>
              </div>
              <span className="font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                94% Joined
              </span>
            </div>

            <div className="py-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-gray-900">Wave #2 - Electronics & BCA 2026</h3>
                <p className="text-gray-500 mt-0.5">Dispatched: 2026-10-08 • 85 Invitations Sent</p>
              </div>
              <span className="font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
                72% Joined
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
