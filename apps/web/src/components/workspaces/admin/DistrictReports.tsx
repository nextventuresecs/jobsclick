'use client';

import React, { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  BarChart2,
  Building2,
  Briefcase,
  CheckCircle,
  ShieldCheck,
  Search,
  ArrowUpDown,
} from 'lucide-react';
import type { DistrictReportItem } from '@indian-job-portal/validation';

export interface DistrictReportsProps {
  readonly initialData?: DistrictReportItem[];
}

const DEFAULT_DISTRICT_REPORTS: DistrictReportItem[] = [
  { district: 'Bhopal', onboardedMsmes: 840, activeJobs: 320, totalHires: 215 },
  { district: 'Indore', onboardedMsmes: 1250, activeJobs: 640, totalHires: 490 },
  { district: 'Gwalior', onboardedMsmes: 430, activeJobs: 180, totalHires: 110 },
  { district: 'Jabalpur', onboardedMsmes: 520, activeJobs: 210, totalHires: 145 },
  { district: 'Ujjain', onboardedMsmes: 310, activeJobs: 130, totalHires: 85 },
  { district: 'Sagar', onboardedMsmes: 240, activeJobs: 95, totalHires: 60 },
  { district: 'Rewa', onboardedMsmes: 190, activeJobs: 70, totalHires: 42 },
  { district: 'Satna', onboardedMsmes: 280, activeJobs: 115, totalHires: 78 },
];

export function DistrictReports({ initialData }: DistrictReportsProps) {
  const t = useTranslations('DistrictReports');
  const [data] = useState<DistrictReportItem[]>(initialData || DEFAULT_DISTRICT_REPORTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'district' | 'msmes' | 'jobs' | 'hires'>('hires');
  const [sortAsc, setSortAsc] = useState(false);

  // Totals
  const totals = useMemo(() => {
    return data.reduce(
      (acc, item) => ({
        msmes: acc.msmes + item.onboardedMsmes,
        jobs: acc.jobs + item.activeJobs,
        hires: acc.hires + item.totalHires,
      }),
      { msmes: 0, jobs: 0, hires: 0 },
    );
  }, [data]);

  // Max values for relative bar chart scaling
  const maxHires = useMemo(() => Math.max(...data.map((d) => d.totalHires), 1), [data]);
  const maxJobs = useMemo(() => Math.max(...data.map((d) => d.activeJobs), 1), [data]);

  const filteredAndSorted = useMemo(() => {
    let result = data.filter((item) =>
      item.district.toLowerCase().includes(searchQuery.trim().toLowerCase()),
    );

    result = [...result].sort((a, b) => {
      let valA: string | number = a.district;
      let valB: string | number = b.district;

      if (sortBy === 'msmes') {
        valA = a.onboardedMsmes;
        valB = b.onboardedMsmes;
      } else if (sortBy === 'jobs') {
        valA = a.activeJobs;
        valB = b.activeJobs;
      } else if (sortBy === 'hires') {
        valA = a.totalHires;
        valB = b.totalHires;
      }

      if (typeof valA === 'string') {
        return sortAsc
          ? valA.localeCompare(valB as string)
          : (valB as string).localeCompare(valA);
      }
      return sortAsc
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number);
    });

    return result;
  }, [data, searchQuery, sortBy, sortAsc]);

  const toggleSort = (column: 'district' | 'msmes' | 'jobs' | 'hires') => {
    if (sortBy === column) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(column);
      setSortAsc(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
              <BarChart2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{t('title')}</h2>
              <p className="text-xs text-gray-600 mt-0.5">{t('subtitle')}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-blue-800 bg-blue-100/60 px-3 py-1.5 rounded-xl border border-blue-200 self-start sm:self-auto">
            <ShieldCheck className="w-4 h-4 text-blue-700" />
            <span className="font-semibold">{t('privacyNotice')}</span>
          </div>
        </div>
      </div>

      {/* Aggregate KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {/* Total Districts */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-xs font-semibold text-gray-500">{t('statTotalDistricts')}</span>
          <p className="text-2xl font-bold text-gray-900 mt-1">{data.length}</p>
          <span className="text-[11px] text-gray-400 mt-1 block">Active District Clusters</span>
        </div>

        {/* Total MSMEs */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-xs font-semibold text-gray-500 flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5 text-orange-600" />
            {t('statTotalMsmes')}
          </span>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {totals.msmes.toLocaleString('en-IN')}
          </p>
          <span className="text-[11px] text-emerald-600 font-semibold mt-1 block">
            Udyam Verified & Categorized
          </span>
        </div>

        {/* Total Active Jobs */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-xs font-semibold text-gray-500 flex items-center gap-1">
            <Briefcase className="w-3.5 h-3.5 text-blue-600" />
            {t('statTotalJobs')}
          </span>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {totals.jobs.toLocaleString('en-IN')}
          </p>
          <span className="text-[11px] text-blue-600 font-semibold mt-1 block">
            Live Openings
          </span>
        </div>

        {/* Verified Hires */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-xs font-semibold text-gray-500 flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            {t('statTotalHires')}
          </span>
          <p className="text-2xl font-bold text-emerald-700 mt-1">
            {totals.hires.toLocaleString('en-IN')}
          </p>
          <span className="text-[11px] text-emerald-600 font-semibold mt-1 block">
            {((totals.hires / Math.max(totals.jobs, 1)) * 100).toFixed(1)}% Conversion Rate
          </span>
        </div>
      </div>

      {/* Visual Chart Bars & Data Table Container */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        {/* Table Controls */}
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by district name..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="text-xs text-gray-500 font-medium">
            Showing <strong className="text-gray-800">{filteredAndSorted.length}</strong> of{' '}
            {data.length} reporting districts
          </div>
        </div>

        {/* Table / Visualization */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-[11px] font-bold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                <th
                  scope="col"
                  onClick={() => toggleSort('district')}
                  className="py-3 px-4 cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>{t('colDistrict')}</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th
                  scope="col"
                  onClick={() => toggleSort('msmes')}
                  className="py-3 px-4 cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>{t('colMsmes')}</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th
                  scope="col"
                  onClick={() => toggleSort('jobs')}
                  className="py-3 px-4 cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>{t('colJobs')}</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th
                  scope="col"
                  onClick={() => toggleSort('hires')}
                  className="py-3 px-4 cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>{t('colHires')}</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th scope="col" className="py-3 px-4">
                  <span>Relative Employment Impact (Visual Gauge)</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
              {filteredAndSorted.map((item) => {
                const hireBarPercent = Math.round((item.totalHires / maxHires) * 100);
                const jobBarPercent = Math.round((item.activeJobs / maxJobs) * 100);

                return (
                  <tr key={item.district} className="hover:bg-blue-50/30 transition-colors">
                    {/* District */}
                    <td className="py-3.5 px-4 font-bold text-gray-900">
                      {item.district}
                    </td>

                    {/* Onboarded MSMEs */}
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-gray-800">
                        {item.onboardedMsmes.toLocaleString('en-IN')}
                      </span>
                    </td>

                    {/* Active Jobs */}
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-blue-700">
                        {item.activeJobs.toLocaleString('en-IN')}
                      </span>
                    </td>

                    {/* Total Hires */}
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-emerald-700">
                        {item.totalHires.toLocaleString('en-IN')}
                      </span>
                    </td>

                    {/* Visual Progress Bar */}
                    <td className="py-3.5 px-4 w-72">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] text-gray-500 font-mono">
                          <span>Hires: {item.totalHires}</span>
                          <span>Jobs: {item.activeJobs}</span>
                        </div>
                        {/* Dual bar: Blue = Open Jobs, Green = Realized Hires */}
                        <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden flex">
                          <div
                            className="bg-emerald-500 h-full transition-all duration-500 rounded-l-full"
                            style={{ width: `${Math.min(100, hireBarPercent)}%` }}
                            title={`Hires: ${item.totalHires}`}
                          />
                          <div
                            className="bg-blue-300 h-full transition-all duration-500 rounded-r-full"
                            style={{ width: `${Math.max(0, jobBarPercent - hireBarPercent)}%` }}
                            title={`Remaining Active Openings: ${Math.max(0, item.activeJobs - item.totalHires)}`}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
