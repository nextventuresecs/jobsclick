'use client';

import React, { useState } from 'react';
import {
  INITIAL_AUDIT_LOGS,
  AuditLogEntryData,
} from '../../data/sampleWorkspaces';
import { SAMPLE_JOBS, JobItem } from '../../data/sampleJobs';
import { SAMPLE_COMPANIES } from '../../data/sampleCompanies';
import { CategoryBadge } from '@indian-job-portal/ui';
import {
  ShieldCheck,
  Building,
  Briefcase,
  History,
  TrendingUp,
  Search,
  Lock,
} from 'lucide-react';

export function AdminWorkspace({ isMsmeDept = false }: { readonly isMsmeDept?: boolean }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'jobs' | 'businesses' | 'audit'>('overview');
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
              {isMsmeDept
                ? 'MSME Department Regional Facilitation Centre'
                : 'JobsClick Platform Central Operations'}
            </h1>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-800 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
              <span>State Authorized</span>
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            District Industries Centres (DIC) & National Employment Directorate
          </p>
        </div>

        <div className="text-xs text-gray-500 text-right font-mono">
          <span>Security Protocol: Enforced</span>
          <span className="block text-emerald-700 font-semibold">Candidate PII Masked</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto gap-2">
        {[
          { id: 'overview', label: 'Platform & District Stats', icon: TrendingUp },
          { id: 'jobs', label: `Job Moderation (${jobs.length})`, icon: Briefcase },
          { id: 'businesses', label: `MSME Directory (${SAMPLE_COMPANIES.length})`, icon: Building },
          { id: 'audit', label: `Immutable Audit Log (${auditLogs.length})`, icon: History },
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
              <span className="text-xs font-semibold text-gray-500">Verified MSMEs</span>
              <p className="text-2xl font-bold text-gray-900 mt-1">{SAMPLE_COMPANIES.length}</p>
              <p className="text-[11px] text-gray-500 mt-1">100% Udyam validated</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">Active Job Postings</span>
              <p className="text-2xl font-bold text-blue-600 mt-1">{jobs.length}</p>
              <p className="text-[11px] text-gray-500 mt-1">Across 6 industry sectors</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">Audit Events Logged</span>
              <p className="text-2xl font-bold text-purple-600 mt-1">48,290</p>
              <p className="text-[11px] text-gray-500 mt-1">Append-only verified</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">Hard Invariant #6</span>
              <div className="flex items-center gap-1.5 mt-2 text-emerald-700 font-semibold text-xs">
                <Lock className="w-4 h-4" />
                <span>Non-Editable Logs</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">Cryptographic integrity lock</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
            <h2 className="text-sm font-bold text-gray-900 mb-3">District Clusters Activity</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                <h3 className="font-bold text-gray-900">Pune Industrial Cluster</h3>
                <p className="text-gray-500 mt-1">Bhosari, Chakan, Pimpri Auto Belt</p>
                <p className="text-emerald-700 font-bold mt-2">1,240 Verified Jobs Active</p>
              </div>
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                <h3 className="font-bold text-gray-900">Bengaluru Tech & Hardware</h3>
                <p className="text-gray-500 mt-1">HSR, Electronic City, Peenya</p>
                <p className="text-purple-700 font-bold mt-2">890 Verified Jobs Active</p>
              </div>
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                <h3 className="font-bold text-gray-900">Delhi-NCR Manufacturing</h3>
                <p className="text-gray-500 mt-1">Okhla, Noida Phase 2, Manesar</p>
                <p className="text-blue-700 font-bold mt-2">740 Verified Jobs Active</p>
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
              <h2 className="text-base font-bold text-gray-900">Job Moderation & Verification</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Inspect public job listings against national minimum wages and DPDP compliance.
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
                      Compliant
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">{job.title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {job.companyName} • ₹{(job.salaryMin / 1000).toFixed(0)}k - ₹{(job.salaryMax / 1000).toFixed(0)}k/mo • {job.location}
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
            <h2 className="text-base font-bold text-gray-900">MSME Enterprise Directory</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Verified enterprises with Government Udyam registration certificates.
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
                      Udyam Verified
                    </span>
                  </div>
                  <p className="text-gray-500 mt-0.5">
                    Udyam: <span className="font-mono text-gray-700 font-semibold">{c.udyamNumber}</span> • {c.sector} • {c.city}, {c.state}
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-gray-700">{c.enterpriseSize} Enterprise</span>
                  <span className="block text-gray-400 font-mono mt-0.5">{c.ownershipType}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: AUDIT LOG (Hard Invariant #6) */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-900">Immutable Audit Trail</h2>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  <Lock className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Hard Invariant #6: Append-Only & Non-Editable</span>
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Admin logins, CSV imports, enterprise verifications, and permission updates are permanently recorded.
              </p>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search audit trail..."
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
                    Integrity: Verified
                  </span>
                  <span className="block text-[10px] text-gray-400 mt-1">By: {log.actor}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
