'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Navbar } from '../../../components/layout/Navbar';
import { Footer } from '../../../components/layout/Footer';
import { Button } from '@indian-job-portal/ui';
import { useAppContext } from '@/context/AppContext';
import {
  parseSharedCsv,
  normalizeIndianPhone,
  udyamNumberSchema,
} from '@indian-job-portal/validation';
import {
  Upload,
  Download,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Building2,
  Clock,
  Sparkles,
  HelpCircle,
  FileSpreadsheet,
  Lock,
} from 'lucide-react';

interface ParsedCompanyRow {
  readonly rowNumber: number;
  readonly companyName: string;
  readonly phone: string;
  readonly ownershipType: string;
  readonly companySize: string;
  readonly sector: string;
  readonly city: string;
  readonly district: string;
  readonly email: string;
  readonly udyamNumber: string;
  readonly gstin: string;
  readonly pincode: string;
  readonly isValid: boolean;
  readonly errors: readonly string[];
}

const TEMPLATE_CSV = `company_name,phone,ownership_type,company_size,sector,city,district,state,address,email,udyam_number,gstin,pincode
Shree Ganesh Textiles,9876543210,Proprietorship,Micro,Textiles,Indore,Indore,Madhya Pradesh,"Plot 14, Sector C, Industrial Area",contact@shreetextiles.in,UDYAM-MP-01-0012345,23AABCC1234D1Z5,452001
Malwa Agro Processing Pvt Ltd,9876543211,Private Limited,Small,Food Processing,Indore,Indore,Madhya Pradesh,Gram Sanwer Road,admin@malwaagro.com,,,452015`;

export default function EmployerBulkOnboardPage() {
  const t = useTranslations('BulkOnboard');
  const { user, isAuthenticated, isLoadingSession, openAuthModal } = useAppContext();

  // No prefilled sample CSV (PR 4 requirement)
  const [csvText, setCsvText] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [batchResult, setBatchResult] = useState<{
    readonly batchId: string;
    readonly totalRows: number;
    readonly validCount: number;
    readonly source: string;
    readonly createdAt: string;
  } | null>(null);

  // Parse CSV rows using shared RFC-4180 compliant parser
  const parseRows = (text: string): readonly ParsedCompanyRow[] => {
    if (!text.trim()) return [];

    let records: Array<Record<string, string>> = [];
    try {
      records = parseSharedCsv(text);
    } catch {
      return [];
    }

    const seenPhones = new Set<string>();
    const rows: ParsedCompanyRow[] = [];

    records.forEach((record, idx) => {
      const rowNumber = idx + 2;
      const errors: string[] = [];

      const companyName = (
        record['company_name'] ||
        record['Company Name'] ||
        record['companyName'] ||
        record['name'] ||
        record['Name'] ||
        ''
      ).trim();
      const rawPhone = (
        record['phone'] ||
        record['Phone'] ||
        record['mobile'] ||
        record['Mobile'] ||
        record['contact'] ||
        ''
      ).trim();
      const ownershipType = (
        record['ownership_type'] ||
        record['Ownership Type'] ||
        record['ownershipType'] ||
        record['legal_status'] ||
        ''
      ).trim();
      const companySize = (
        record['company_size'] ||
        record['Company Size'] ||
        record['companySize'] ||
        record['size'] ||
        ''
      ).trim();
      const sector = (
        record['sector'] ||
        record['Sector'] ||
        record['industry'] ||
        record['Industry'] ||
        ''
      ).trim();
      const city = (record['city'] || record['City'] || '').trim();
      const district = (record['district'] || record['District'] || '').trim();
      const email = (record['email'] || record['Email'] || '').trim();
      const udyamNumber = (
        record['udyam_number'] ||
        record['Udyam Number'] ||
        record['udyamNumber'] ||
        record['udyam'] ||
        ''
      ).trim();
      const gstin = (
        record['gstin'] ||
        record['GSTIN'] ||
        record['gst_number'] ||
        record['GST'] ||
        ''
      ).trim();
      const pincode = (
        record['pincode'] ||
        record['Pincode'] ||
        record['pin_code'] ||
        record['PIN'] ||
        ''
      ).trim();

      // 1. Mandatory Company Name (no silent default)
      if (!companyName) {
        errors.push('Missing company name');
      }

      // 2. Mandatory Valid Indian Phone (10 digits starting 6-9)
      const phone = normalizeIndianPhone(rawPhone);
      if (!phone) {
        errors.push('Invalid Indian 10-digit mobile number format');
      } else if (seenPhones.has(phone)) {
        errors.push('Duplicate mobile number inside file');
      } else {
        seenPhones.add(phone);
      }

      // 3. Mandatory Ownership Type (no silent default)
      if (!ownershipType) {
        errors.push('Missing ownership type (e.g. Private Limited, Proprietorship, LLP)');
      }

      // 4. Mandatory Company Size (no silent default)
      if (!companySize) {
        errors.push('Missing company size (e.g. Micro, Small, Medium)');
      }

      // 5. Udyam Number format validation if provided
      if (udyamNumber) {
        const udyamCheck = udyamNumberSchema.safeParse(udyamNumber);
        if (!udyamCheck.success) {
          errors.push('Invalid Udyam registration number (expected UDYAM-XX-00-0000000)');
        }
      }

      // 6. GSTIN format validation if provided
      if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) {
        errors.push('Invalid GSTIN format (expected 15 alphanumeric characters)');
      }

      // 7. Pincode validation if provided
      if (pincode && !/^\d{6}$/.test(pincode)) {
        errors.push('Invalid 6-digit Indian PIN code');
      }

      rows.push({
        rowNumber,
        companyName,
        phone: phone || rawPhone,
        ownershipType,
        companySize,
        sector,
        city,
        district,
        email,
        udyamNumber,
        gstin,
        pincode,
        isValid: errors.length === 0,
        errors,
      });
    });

    return rows;
  };

  const parsedRows = parseRows(csvText);
  const validCount = parsedRows.filter((r) => r.isValid).length;
  const invalidCount = parsedRows.length - validCount;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reject .xlsx / .xls binary files gracefully (no readAsText breakage)
    if (
      file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xls') ||
      file.type.includes('spreadsheet') ||
      file.type.includes('excel')
    ) {
      setErrorMessage(
        'Excel (.xlsx, .xls) binary files are not supported. Please export or save your file as CSV (.csv) before uploading.'
      );
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        setCsvText(text);
        setErrorMessage('');
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'JobsClick_Enterprise_Bulk_Onboarding_Template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadErrorReport = () => {
    const invalidRows = parsedRows.filter((r) => !r.isValid);
    if (invalidRows.length === 0) return;

    const errorCsv =
      'row,company_name,phone,errors\n' +
      invalidRows
        .map(
          (r) =>
            `${r.rowNumber},"${r.companyName.replace(/"/g, '""')}","${r.phone.replace(/"/g, '""')}","${r.errors.join('; ').replace(/"/g, '""')}"`
        )
        .join('\n');

    const blob = new Blob([errorCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk_onboarding_validation_errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmitBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!isAuthenticated) {
      setErrorMessage('Authentication required. Please sign in to submit a bulk enterprise batch.');
      openAuthModal('employer');
      return;
    }

    if (parsedRows.length === 0) {
      setErrorMessage('Please upload or enter at least one valid enterprise row.');
      return;
    }

    if (invalidCount > 0) {
      setErrorMessage(
        `Cannot submit: Found ${invalidCount} validation error(s). Please review and correct the invalid rows or download the error report.`
      );
      return;
    }

    setIsSubmitting(true);

    try {
      // Calls authenticated Next.js proxy route; session auth attached via secure HttpOnly cookie
      const res = await fetch('/api/bulk/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          entityType: 'employer',
          csvContent: csvText,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setBatchResult({
          batchId: data.id || data.batchId || `batch_emp_${Date.now()}`,
          totalRows: parsedRows.length,
          validCount,
          source: data.source || 'Enterprise Onboarding Session',
          createdAt: new Date().toLocaleTimeString(),
        });
        setCsvText('');
      } else {
        const errorData = await res.json().catch(() => null);
        const err = errorData?.error || errorData?.message || `Server returned error (${res.status})`;
        setErrorMessage(`Failed to queue batch: ${err}`);
      }
    } catch {
      setErrorMessage('Unable to connect to bulk processing API service. Please verify your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-[#1F2937] flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 w-full">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Link href="/" className="hover:text-brand-orange">
            Home
          </Link>
          <span>/</span>
          <Link href="/company" className="hover:text-brand-orange">
            Companies
          </Link>
          <span>/</span>
          <span className="text-gray-900 font-semibold">{t('breadcrumb')}</span>
        </div>

        {/* Page Header */}
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-brand-orange flex items-center gap-1.5">
                <Building2 className="w-4 h-4" />
                <span>{t('tag')}</span>
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mt-1">
                {t('title')}
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 mt-1 max-w-3xl leading-relaxed">
                {t('subtitle')}
              </p>
            </div>

            {/* Template Download Button */}
            <div className="flex items-center gap-2.5 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-2 border-gray-300 hover:border-gray-400 text-xs font-semibold"
              >
                <Download className="w-4 h-4 text-brand-orange" />
                <span>Download CSV Template</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Authentication Gate if not logged in */}
        {!isLoadingSession && !isAuthenticated && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-amber-950">
                  Authentication Required
                </h2>
                <p className="text-xs text-amber-800 mt-0.5">
                  Bulk enterprise onboarding requires a verified employer, institution, or administrator account.
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => openAuthModal('employer')}
              className="shrink-0"
            >
              Sign In to Continue
            </Button>
          </div>
        )}

        {/* Invariant Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-2xs flex items-start gap-3">
            <div className="p-2 bg-orange-50 text-brand-orange rounded-lg shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-gray-900">{t('inv2Title')}</h2>
              <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                {t('inv2Desc')}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-2xs flex items-start gap-3">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-gray-900">{t('inv3Title')}</h2>
              <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                {t('inv3Desc')}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-2xs flex items-start gap-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-gray-900">{t('waveTitle')}</h2>
              <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                {t('waveDesc')}
              </p>
            </div>
          </div>
        </div>

        {/* Error banner if submission failed */}
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 shadow-xs flex items-center justify-between gap-3 text-xs text-red-700">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            {invalidCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadErrorReport}
                className="shrink-0 bg-white border-red-300 text-red-700 hover:bg-red-50 text-xs"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Download Error CSV
              </Button>
            )}
          </div>
        )}

        {/* Success Banner if batch submitted */}
        {batchResult && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 shadow-xs space-y-3 animate-in fade-in">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <h2 className="text-base font-bold text-emerald-950">
                  {t('batchSuccess')}
                </h2>
                <p className="text-xs text-emerald-800">
                  Batch ID: <span className="font-mono font-bold text-emerald-900">{batchResult.batchId}</span> · Submitted at {batchResult.createdAt}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
              <div className="p-3 bg-white rounded-xl border border-emerald-100">
                <span className="text-gray-500">{t('sourceLabel')}</span>
                <p className="font-bold text-gray-900 mt-0.5 truncate">{batchResult.source}</p>
              </div>
              <div className="p-3 bg-white rounded-xl border border-emerald-100">
                <span className="text-gray-500">Total Records</span>
                <p className="font-bold text-gray-900 mt-0.5 font-mono">{batchResult.totalRows}</p>
              </div>
              <div className="p-3 bg-white rounded-xl border border-emerald-100">
                <span className="text-gray-500">{t('valid')} Enterprise Profiles</span>
                <p className="font-bold text-emerald-700 mt-0.5 font-mono">{batchResult.validCount}</p>
              </div>
              <div className="p-3 bg-white rounded-xl border border-emerald-100">
                <span className="text-gray-500">Initial State</span>
                <p className="font-bold text-orange-600 mt-0.5">Invited (Zero SMS Sent)</p>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <span className="text-xs text-emerald-900">
                Enterprises have been registered in invited status with business profiles attached.
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBatchResult(null)}
              >
                {t('uploadAnother')}
              </Button>
            </div>
          </div>
        )}

        {/* Upload & Configuration Form */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 space-y-6">
            <form onSubmit={handleSubmitBatch} className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                1. Verified Authority
              </h2>

              <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-1">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Session Identity
                </span>
                <p className="text-xs font-bold text-gray-900">
                  {user ? `Authenticated as ${user.role} (${user.id.slice(0, 8)}...)` : 'Not Authenticated'}
                </p>
                <p className="text-[11px] text-gray-500">
                  Source attribution and coordinator logs are bound directly to your authenticated session.
                </p>
              </div>

              <div className="pt-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  2. Upload Roster (CSV)
                </label>
                <label className="border-2 border-dashed border-gray-300 hover:border-brand-orange rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-gray-50/50 hover:bg-orange-50/20">
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <span className="text-xs font-bold text-gray-800">
                    {t('uploadClick')}
                  </span>
                  <span className="text-[11px] text-gray-500 mt-0.5">
                    CSV format only (.csv) · UTF-8 encoded
                  </span>
                  <input
                    type="file"
                    accept=".csv, text/csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full justify-center font-semibold mt-2"
                disabled={isSubmitting || parsedRows.length === 0 || !isAuthenticated}
              >
                {isSubmitting
                  ? 'Queueing Batch...'
                  : `${t('queueButton')} (${parsedRows.length} Rows)`}
              </Button>
            </form>

            {/* Assistance Card */}
            <div className="p-4 bg-orange-50/60 rounded-xl border border-orange-100 flex items-start gap-3 text-xs text-orange-950">
              <HelpCircle className="w-5 h-5 text-brand-orange shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">{t('assistedTitle')}</p>
                <p className="text-[11px] text-orange-900 leading-relaxed">
                  {t('assistedDesc')} <span className="font-semibold">support@jobsclick.in</span>.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Spreadsheet Preview */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                    {t('previewTitle')}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {parsedRows.length === 0
                      ? 'Upload a CSV file or paste raw CSV text below to preview entries.'
                      : `${parsedRows.length} total rows parsed.`}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {validCount > 0 && (
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-semibold">
                      {validCount} {t('valid')}
                    </span>
                  )}
                  {invalidCount > 0 && (
                    <span className="px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded font-semibold">
                      {invalidCount} {t('invalid')}
                    </span>
                  )}
                </div>
              </div>

              {parsedRows.length === 0 ? (
                <div className="border border-dashed border-gray-200 rounded-xl p-8 text-center text-gray-400 space-y-2">
                  <FileSpreadsheet className="w-8 h-8 mx-auto text-gray-300" />
                  <p className="text-xs font-semibold text-gray-600">No Enterprise Data Loaded</p>
                  <p className="text-[11px] text-gray-400 max-w-sm mx-auto">
                    Download our official CSV template to prepare your file, or upload an existing CSV roster.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadTemplate}
                    className="text-xs mt-2"
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5 text-brand-orange" />
                    Download CSV Template
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[480px] border border-gray-200 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10 text-gray-600 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">{t('companyNameCol')}</th>
                        <th className="py-2.5 px-3">{t('phoneCol')}</th>
                        <th className="py-2.5 px-3">{t('sectorCol')}</th>
                        <th className="py-2.5 px-3">{t('sizeCol')}</th>
                        <th className="py-2.5 px-3">Udyam No</th>
                        <th className="py-2.5 px-3 text-center">{t('statusCol')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-normal">
                      {parsedRows.map((row) => (
                        <tr
                          key={row.rowNumber}
                          className={row.isValid ? 'hover:bg-gray-50/70' : 'bg-red-50/40 hover:bg-red-50/70'}
                        >
                          <td className="py-2.5 px-3 font-mono text-gray-400">{row.rowNumber}</td>
                          <td className="py-2.5 px-3 font-medium text-gray-900 max-w-[160px] truncate">
                            {row.companyName || <span className="text-red-500 italic">Missing</span>}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-gray-700">{row.phone}</td>
                          <td className="py-2.5 px-3 text-gray-600">{row.sector || '—'}</td>
                          <td className="py-2.5 px-3 text-gray-600">
                            {row.companySize || <span className="text-red-500 italic">Missing</span>}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-gray-500">
                            {row.udyamNumber || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {row.isValid ? (
                              <span className="inline-flex items-center text-emerald-600" title="Valid">
                                <CheckCircle2 className="w-4 h-4" />
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center text-red-500 cursor-help"
                                title={row.errors.join(', ')}
                              >
                                <AlertCircle className="w-4 h-4" />
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <details className="text-xs text-gray-500 pt-2">
                <summary className="font-semibold text-gray-700 cursor-pointer hover:text-brand-orange">
                  Paste or Edit Raw CSV Text
                </summary>
                <div className="mt-2 space-y-2">
                  <textarea
                    rows={6}
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder="Paste CSV text with headers: company_name,phone,ownership_type,company_size,sector,city,district..."
                    className="w-full p-2.5 font-mono text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-orange focus:outline-hidden bg-gray-50"
                  />
                </div>
              </details>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
