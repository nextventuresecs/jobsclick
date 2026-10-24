'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  INITIAL_AUDIT_LOGS,
  AuditLogEntryData,
} from '../../data/sampleWorkspaces';
import { SAMPLE_JOBS, JobItem } from '../../data/sampleJobs';
import { SAMPLE_COMPANIES } from '../../data/sampleCompanies';
import { CategoryBadge } from '@indian-job-portal/ui';
import { MsmeBroadcastConsole } from "./admin/MsmeBroadcastConsole";
import { DistrictReports } from "./admin/DistrictReports";
import {
  Radio,
  BarChart2,
  ShieldCheck,
  Building,
  Briefcase,
  History,
  TrendingUp,
  Search,
  Lock,
} from 'lucide-react';

export function AdminWorkspace({ isMsmeDept = false }: { readonly isMsmeDept?: boolean }) {
  const t = useTranslations('AdminWorkspace');
  const [activeTab, setActiveTab] = useState<'overview' | 'broadcast' | 'reports' | 'jobs' | 'businesses' | 'audit'>(isMsmeDept ? 'broadcast' : 'overview');
  const [auditLogs] = useState<readonly AuditLogEntryData[]>(INITIAL_AUDIT_LOGS);
  const [jobs] = useState<readonly JobItem[]>(SAMPLE_JOBS);
  const [searchLog, setSearchLog] = useState('');

  const filteredLogs = auditLogs.filter((l) => {
    if (!searchLog.trim()) return true;
    const q = searchLog.toLowerCase();
    return (
      l.actor.toLowerCase().includes(q) ||
      l.action.toLowerCase().includes(q) ||
      l.details.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              {isMsmeDept ? t('titleMsme') : t('titleCentralOps')}
            </h1>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-800 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
              <span>{t('stateAuthorized')}</span>
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {t('subheading')}
          </p>
        </div>

        <div className="text-xs text-gray-500 text-right font-mono">
          <span>{t('securityProtocol')}</span>
          <span className="block text-emerald-700 font-semibold">{t('candidatePiiMasked')}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto gap-2">
        {([
          { id: 'overview', label: t('tabOverview'), icon: TrendingUp },
          { id: 'broadcast', label: t('tabBroadcast'), icon: Radio },
          { id: 'reports', label: t('tabReports'), icon: BarChart2 },
          { id: 'jobs', label: `${t('tabJobs')} (${jobs.length})`, icon: Briefcase },
          { id: 'businesses', label: `${t('tabBusinesses')} (${SAMPLE_COMPANIES.length})`, icon: Building },
          { id: 'audit', label: `${t('tabAudit')} (${auditLogs.length})`, icon: History },
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

      {/* TAB: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">{t('statVerifiedMsmes')}</span>
              <p className="text-2xl font-bold text-gray-900 mt-1">{SAMPLE_COMPANIES.length}</p>
              <p className="text-[11px] text-gray-500 mt-1">{t('statUdyamValidated')}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">{t('statActiveJobs')}</span>
              <p className="text-2xl font-bold text-blue-600 mt-1">{jobs.length}</p>
              <p className="text-[11px] text-gray-500 mt-1">{t('statAcrossSectors')}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">{t('statAuditEvents')}</span>
              <p className="text-2xl font-bold text-purple-600 mt-1">48,290</p>
              <p className="text-[11px] text-gray-500 mt-1">{t('statAppendOnly')}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">{t('statHardInvariant6')}</span>
              <div className="flex items-center gap-1.5 mt-2 text-emerald-700 font-semibold text-xs">
                <Lock className="w-4 h-4" />
                <span>{t('statNonEditable')}</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">{t('statCryptoLock')}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
            <h2 className="text-sm font-bold text-gray-900 mb-3">{t('headingDistrictClusters')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                <h3 className="font-bold text-gray-900">{t('puneClusterTitle')}</h3>
                <p className="text-gray-500 mt-1">{t('puneClusterSub')}</p>
                <p className="text-emerald-700 font-bold mt-2">{t('puneClusterJobs')}</p>
              </div>
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                <h3 className="font-bold text-gray-900">{t('blrClusterTitle')}</h3>
                <p className="text-gray-500 mt-1">{t('blrClusterSub')}</p>
                <p className="text-purple-700 font-bold mt-2">{t('blrClusterJobs')}</p>
              </div>
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                <h3 className="font-bold text-gray-900">{t('delhiClusterTitle')}</h3>
                <p className="text-gray-500 mt-1">{t('delhiClusterSub')}</p>
                <p className="text-blue-700 font-bold mt-2">{t('delhiClusterJobs')}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: JOBS */}
      {activeTab === 'jobs' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900">{t('jobsModerationTitle')}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {t('jobsModerationDesc')}
              </p>
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {jobs.map((job) => (
              <div key={job.id} className="py-4 flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <CategoryBadge category={job.category} />
                    <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      {t('badgeCompliant')}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">{job.title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {job.companyName} • ₹{(job.salaryMin / 1000).toFixed(0)}k - ₹{(job.salaryMax / 1000).toFixed(0)}{t('perMonth')} • {job.location}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 font-mono">ID: {job.id}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: BUSINESSES */}
      {activeTab === 'businesses' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
          <div className="pb-4 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-900">{t('msmeDirectoryTitle')}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {t('msmeDirectoryDesc')}
            </p>
          </div>

          <div className="space-y-3">
            {SAMPLE_COMPANIES.map((c) => (
              <div
                key={c.id}
                className="p-4 rounded-xl border border-gray-200 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900 text-sm">{c.name}</h3>
                    <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">
                      {t('badgeUdyamVerified')}
                    </span>
                  </div>
                  <p className="text-gray-500 mt-0.5">
                    {t('udyamLabel')} <span className="font-mono text-gray-700 font-semibold">{c.udyamNumber}</span> • {c.sector} • {c.city}, {c.state}
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-gray-700">{c.enterpriseSize} {t('enterprise')}</span>
                  <span className="block text-gray-400 font-mono mt-0.5">{c.ownershipType}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: MSME BROADCAST CONSOLE */}
      {activeTab === 'broadcast' && <MsmeBroadcastConsole />}

      {/* TAB: DISTRICT EMPLOYMENT REPORTS */}
      {activeTab === 'reports' && <DistrictReports />}

      {/* TAB: AUDIT LOG (Hard Invariant #6) */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-900">{t('auditTrailTitle')}</h2>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  <Lock className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{t('auditBadge')}</span>
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {t('auditTrailDesc')}
              </p>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder={t('searchAuditPlaceholder')}
                value={searchLog}
                onChange={(e) => setSearchLog(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
              />
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 text-xs font-mono">
            {filteredLogs.map((log) => (
              <div key={log.id} className="p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 font-normal">{log.timestamp}</span>
                    <span className="font-bold text-gray-900">{log.action}</span>
                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-[10px] uppercase">
                      {log.role}
                    </span>
                  </div>
                  <p className="text-gray-600 font-sans text-xs">{log.details}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    {t('integrityVerified')}
                  </span>
                  <span className="block text-[10px] text-gray-400 mt-1">{t('byActor')} {log.actor}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
