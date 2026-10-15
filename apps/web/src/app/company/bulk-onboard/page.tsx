'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Navbar } from '../../../components/layout/Navbar';
import { Footer } from '../../../components/layout/Footer';
import { Button } from '@indian-job-portal/ui';
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
} from 'lucide-react';

interface ParsedCompanyRow {
  readonly companyName: string;
  readonly phone: string;
  readonly ownershipType: string;
  readonly companySize: string;
  readonly sector: string;
  readonly city: string;
  readonly district: string;
  readonly email: string;
  readonly isValidPhone: boolean;
}

const SAMPLE_CSV = `company_name,phone,ownership_type,company_size,sector,address,city,district,email,logo_url
Shree Ganesh Textiles,9876543210,Proprietorship,Micro,Textiles & Garments,"Plot 14, Sector C, Industrial Area",Indore,Indore,contact@shreetextiles.in,https://example.com/logo1.png
Malwa Agro Processing Pvt Ltd,9876543211,Private Limited,Small,Food Processing,Gram Sanwer Road,Indore,Indore,admin@malwaagro.com,
Mahakal Auto Components,9876543212,LLP,Micro,Manufacturing,"Plot 5, Nagziri Industrial Area",Ujjain,Ujjain,info@mahakalauto.in,
Kalyan Precision Forgings,9876543213,Private Limited,Medium,Manufacturing,"Phase 2, Pithampur Industrial Belt",Dhar,Dhar,contact@kalyanforgings.in,
Narmada Logistics & Warehousing,9876543214,Partnership,Small,Logistics & Supply,"Depot 8, AB Road",Dewas,Dewas,dispatch@narmadalogistics.com,`;

// RFC-4180 compliant CSV line parser respecting quoted commas
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

export default function EmployerBulkOnboardPage() {
  const t = useTranslations('BulkOnboard');
  const [sourceName, setSourceName] = useState('District Industries Centre (DIC) Indore');
  const [coordinatorPhone, setCoordinatorPhone] = useState('9876543210');
  const [csvText, setCsvText] = useState(SAMPLE_CSV);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [batchResult, setBatchResult] = useState<{
    readonly batchId: string;
    readonly totalRows: number;
    readonly validCount: number;
    readonly source: string;
    readonly createdAt: string;
  } | null>(null);

  // Parse CSV rows with RFC-4180 compliance
  const parseRows = (text: string): readonly ParsedCompanyRow[] => {
    const lines = text.trim().split('\n');
    if (lines.length <= 1) return [];

    const rows: ParsedCompanyRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;

      const parts = parseCsvLine(line);
      const companyName = parts[0]?.replace(/"/g, '') || 'Unnamed Company';
      const rawPhone = parts[1]?.trim() || '';
      const cleanPhone = rawPhone.replace(/\D/g, '');
      const isValidPhone = /^[6-9]\d{9}$/.test(cleanPhone);

      rows.push({
        companyName,
        phone: rawPhone,
        ownershipType: parts[2] || 'Private Limited',
        companySize: parts[3] || 'Small',
        sector: parts[4]?.replace(/"/g, '') || 'Manufacturing',
        city: parts[6] || 'Indore',
        district: parts[7] || 'Indore',
        email: parts[8] || '',
        isValidPhone,
      });
    }
    return rows;
  };

  const parsedRows = parseRows(csvText);
  const validCount = parsedRows.filter((r) => r.isValidPhone).length;
  const invalidCount = parsedRows.length - validCount;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

  const handleSubmitBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (parsedRows.length === 0) {
      setErrorMessage('Please upload or enter at least one valid enterprise row.');
      return;
    }

    setIsSubmitting(true);
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

    try {
      const res = await fetch(`${apiUrl}/bulk/batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: sourceName,
          entityType: 'employer',
          csvContent: csvText,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setBatchResult({
          batchId: data.batchId || `batch_emp_${Date.now()}`,
          totalRows: parsedRows.length,
          validCount,
          source: sourceName,
          createdAt: new Date().toLocaleTimeString(),
        });
      } else {
        const errorData = await res.json().catch(() => null);
        const err = errorData?.message || `Server returned error (${res.status})`;
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

            {/* Template Download Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
              <a
                href="/templates/msme_business_onboarding_template.xlsx"
                download="msme_business_onboarding_template.xlsx"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors shadow-2xs"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                <span>{t('downloadExcel')}</span>
              </a>
              <a
                href="/templates/msme_business_onboarding_template.csv"
                download="msme_business_onboarding_template.csv"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors shadow-2xs"
              >
                <Download className="w-4 h-4 text-blue-600" />
                <span>{t('downloadCsv')}</span>
              </a>
            </div>
          </div>
        </div>

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
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 shadow-xs flex items-center gap-3 text-xs text-red-700">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
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
                <p className="font-bold text-gray-900 mt-0.5">{batchResult.source}</p>
              </div>
              <div className="p-3 bg-white rounded-xl border border-emerald-100">
                <span className="text-gray-500">Total Records</span>
                <p className="font-bold text-gray-900 mt-0.5 font-mono">{batchResult.totalRows}</p>
              </div>
              <div className="p-3 bg-white rounded-xl border border-emerald-100">
                <span className="text-gray-500">{t('valid')} Phones</span>
                <p className="font-bold text-emerald-700 mt-0.5 font-mono">{batchResult.validCount}</p>
              </div>
              <div className="p-3 bg-white rounded-xl border border-emerald-100">
                <span className="text-gray-500">Initial State</span>
                <p className="font-bold text-orange-600 mt-0.5">Invited (No SMS Sent)</p>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <span className="text-xs text-emerald-900">
                Companies have been added to your cluster directory in invited status.
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
                1. Authority Details
              </h2>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('sourceLabel')}
                </label>
                <input
                  type="text"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  placeholder="e.g. DIC Indore, Auto Cluster Pune"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden"
                  required
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  {t('sourceDesc')}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('coordinatorLabel')}
                </label>
                <div className="flex rounded-xl border border-gray-300 shadow-2xs overflow-hidden focus-within:ring-2 focus-within:ring-brand-orange">
                  <span className="inline-flex items-center px-3 bg-gray-50 border-r border-gray-300 text-gray-600 text-xs font-semibold">
                    +91
                  </span>
                  <input
                    type="tel"
                    maxLength={10}
                    value={coordinatorPhone}
                    onChange={(e) => setCoordinatorPhone(e.target.value)}
                    placeholder="9876543210"
                    className="w-full px-3 py-2 text-sm font-mono text-gray-900 focus:outline-hidden"
                    required
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  2. {t('uploadLabel')}
                </label>
                <label className="border-2 border-dashed border-gray-300 hover:border-brand-orange rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-gray-50/50 hover:bg-orange-50/20">
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <span className="text-xs font-bold text-gray-800">
                    {t('uploadClick')}
                  </span>
                  <span className="text-[11px] text-gray-500 mt-0.5">
                    {t('uploadFormat')}
                  </span>
                  <input
                    type="file"
                    accept=".csv, .xlsx, .xls"
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
                disabled={isSubmitting || parsedRows.length === 0}
              >
                {isSubmitting
                  ? '...'
                  : `${t('queueButton')} (${parsedRows.length})`}
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
                    {t('previewDesc')}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-semibold">
                    {validCount} {t('valid')}
                  </span>
                  {invalidCount > 0 && (
                    <span className="px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded font-semibold">
                      {invalidCount} {t('invalid')}
                    </span>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto max-h-[480px] border border-gray-200 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10 text-gray-600 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">{t('companyNameCol')}</th>
                      <th className="py-2.5 px-3">{t('phoneCol')}</th>
                      <th className="py-2.5 px-3">{t('sectorCol')}</th>
                      <th className="py-2.5 px-3">{t('cityCol')}</th>
                      <th className="py-2.5 px-3">{t('sizeCol')}</th>
                      <th className="py-2.5 px-3 text-center">{t('statusCol')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-normal">
                    {parsedRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/70">
                        <td className="py-2.5 px-3 font-medium text-gray-900 max-w-[180px] truncate">
                          {row.companyName}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-gray-700">
                          {row.phone}
                        </td>
                        <td className="py-2.5 px-3 text-gray-600">
                          {row.sector}
                        </td>
                        <td className="py-2.5 px-3 text-gray-600">
                          {row.city}
                        </td>
                        <td className="py-2.5 px-3 text-gray-600">
                          {row.companySize}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {row.isValidPhone ? (
                            <span className="inline-flex items-center text-emerald-600" title="Valid mobile format">
                              <CheckCircle2 className="w-4 h-4" />
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-red-500" title="Invalid Indian mobile number">
                              <AlertCircle className="w-4 h-4" />
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <details className="text-xs text-gray-500 pt-2">
                <summary className="font-semibold text-gray-700 cursor-pointer hover:text-brand-orange">
                  View or Edit Raw CSV Text
                </summary>
                <div className="mt-2">
                  <textarea
                    rows={6}
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
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
