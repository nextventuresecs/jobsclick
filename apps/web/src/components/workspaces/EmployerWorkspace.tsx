'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { SAMPLE_COMPANIES } from '../../data/sampleCompanies';
import { SAMPLE_JOBS, JobItem } from '../../data/sampleJobs';
import {
  INITIAL_APPLICATIONS,
  ApplicationData,
  maskCandidatePhone,
  maskCandidateEmail,
} from '../../data/sampleWorkspaces';
import {
  CategoryBadge,
  StatusBadge,
  Button,
} from '@indian-job-portal/ui';
import type { IndustryCategory, ApplicationStatus } from '@indian-job-portal/validation';
import {
  Building2,
  PlusCircle,
  Briefcase,
  Users,
  QrCode,
  MapPin,
  CheckCircle2,
  ShieldCheck,
  Printer,
  Search,
  Eye,
} from 'lucide-react';

export function EmployerWorkspace() {
  const [activeTab, setActiveTab] = useState<'overview' | 'post-job' | 'manage-jobs' | 'applicants' | 'qr-code'>('overview');
  const myCompany = SAMPLE_COMPANIES[0]!; // Aarya Precision Engineering Pvt Ltd

  const [companyJobs, setCompanyJobs] = useState<JobItem[]>(
    SAMPLE_JOBS.filter((j) => j.companyId === myCompany.id)
  );

  const [applicants, setApplicants] = useState<readonly ApplicationData[]>(
    INITIAL_APPLICATIONS.filter((a) => a.companyId === myCompany.id)
  );

  // Post Job form state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<IndustryCategory>('manufacturing');
  const location = myCompany.address;
  const district = myCompany.district;
  const [salaryMin, setSalaryMin] = useState(18000);
  const [salaryMax, setSalaryMax] = useState(28000);
  const [openings, setOpenings] = useState(2);
  const [experienceLevel, setExperienceLevel] = useState<'Fresher' | '1-2 Years' | '3-5 Years' | '5+ Years'>('1-2 Years');
  const [skillsInput, setSkillsInput] = useState('CNC Milling, Blueprint Reading');
  const [description, setDescription] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  // Applicant filters
  const [applicantSearch, setApplicantSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredApplicants = applicants.filter((app) => {
    if (applicantSearch.trim()) {
      const q = applicantSearch.toLowerCase();
      const matchName = app.candidateName.toLowerCase().includes(q);
      const matchJob = app.jobTitle.toLowerCase().includes(q);
      if (!matchName && !matchJob) return false;
    }
    if (statusFilter !== 'all' && app.status !== statusFilter) {
      return false;
    }
    return true;
  });

  const handlePostJob = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    const newJob: JobItem = {
      id: `job-${Date.now()}`,
      title: title.trim(),
      companyName: myCompany.name,
      companyId: myCompany.id,
      location: location.trim(),
      district: district.trim(),
      state: myCompany.state,
      category,
      employmentType: 'Full-time',
      salaryMin: Number(salaryMin),
      salaryMax: Number(salaryMax),
      openings: Number(openings),
      experienceLevel,
      skills: skillsInput.split(',').map((s) => s.trim()).filter(Boolean),
      description: description.trim(),
      requirements: ['Valid Trade Certificate or ITI diploma', 'Strong safety compliance record'],
      postedDate: new Date().toISOString().split('T')[0] ?? '2026-10-15',
      expiryDate: '2026-11-30',
      status: 'active',
      applicantCount: 0,
      isUrgent: false,
    };

    setCompanyJobs([newJob, ...companyJobs]);
    setSuccessNotice(`Job posting "${newJob.title}" published successfully.`);
    setTitle('');
    setDescription('');
    setTimeout(() => {
      setActiveTab('manage-jobs');
      setSuccessNotice('');
    }, 1200);
  };

  const handleUpdateStatus = (appId: string, newStatus: ApplicationStatus) => {
    setApplicants((prev) =>
      prev.map((a) => (a.id === appId ? { ...a, status: newStatus } : a))
    );
  };

  return (
    <div className="space-y-8">
      {/* Employer Header */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 border-2 border-blue-200 flex items-center justify-center shrink-0">
            <Building2 className="w-8 h-8 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{myCompany.name}</h1>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-blue-600" />
                <span>Udyam Verified</span>
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
              <span className="font-mono text-gray-700 font-semibold">{myCompany.udyamNumber}</span>
              <span>•</span>
              <span>{myCompany.enterpriseSize} Enterprise</span>
              <span>•</span>
              <span>{myCompany.city}, {myCompany.state}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setActiveTab('post-job')}
            className="inline-flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Post New Vacancy</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setActiveTab('qr-code')}
            className="inline-flex items-center gap-1.5"
          >
            <QrCode className="w-4 h-4" />
            <span>Walk-in QR</span>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto gap-2">
        {[
          { id: 'overview', label: 'Recruitment Overview', icon: Briefcase },
          { id: 'manage-jobs', label: `Active Jobs (${companyJobs.length})`, icon: Eye },
          { id: 'post-job', label: 'Post a Vacancy', icon: PlusCircle },
          { id: 'applicants', label: `Applicant Pipeline (${applicants.length})`, icon: Users },
          { id: 'qr-code', label: 'Walk-in QR Poster', icon: QrCode },
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
              <span className="text-xs font-semibold text-gray-500">Live Postings</span>
              <p className="text-2xl font-bold text-gray-900 mt-1">{companyJobs.length}</p>
              <p className="text-[11px] text-gray-500 mt-1">Published to national pool</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">Total Applicants</span>
              <p className="text-2xl font-bold text-blue-600 mt-1">{applicants.length}</p>
              <p className="text-[11px] text-gray-500 mt-1">Candidates awaiting review</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">Udyam Registration</span>
              <div className="flex items-center gap-1.5 mt-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-emerald-800">Verified Active</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">DIC Maharashtra Validated</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">Candidate Privacy</span>
              <div className="flex items-center gap-1.5 mt-2 text-emerald-700 font-semibold text-xs">
                <ShieldCheck className="w-4 h-4" />
                <span>Masked by Default</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">Hard Invariant #1 Active</p>
            </div>
          </div>

          {/* Quick Active Jobs Table */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-900">Current Job Vacancies</h2>
              <button
                type="button"
                onClick={() => setActiveTab('manage-jobs')}
                className="text-xs font-semibold text-[#F97316] hover:underline"
              >
                Manage all
              </button>
            </div>

            <div className="divide-y divide-gray-100">
              {companyJobs.map((job) => (
                <div key={job.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">{job.title}</h3>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                      <span>{job.location}</span>
                      <span>•</span>
                      <span>₹{(job.salaryMin / 1000).toFixed(0)}k - ₹{(job.salaryMax / 1000).toFixed(0)}k/mo</span>
                      <span>•</span>
                      <span>{job.openings} Openings</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <CategoryBadge category={job.category} />
                    <Link
                      href={`/jobs/${job.id}`}
                      className="text-xs font-semibold text-[#F97316] hover:underline"
                    >
                      View
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB: MANAGE JOBS */}
      {activeTab === 'manage-jobs' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900">Manage Job Vacancies</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                All openings posted under {myCompany.name} ({myCompany.udyamNumber}).
              </p>
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setActiveTab('post-job')}
              className="inline-flex items-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Vacancy</span>
            </Button>
          </div>

          <div className="space-y-3">
            {companyJobs.map((job) => (
              <div
                key={job.id}
                className="p-5 rounded-xl border border-gray-200 bg-gray-50/50 hover:bg-white transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <CategoryBadge category={job.category} />
                    <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      Status: Active
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-gray-900">{job.title}</h3>
                  <p className="text-xs text-gray-600 mt-1 flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-gray-400" />
                      {job.location}
                    </span>
                    <span>•</span>
                    <span className="font-semibold text-gray-900">
                      ₹{job.salaryMin.toLocaleString('en-IN')} - ₹{job.salaryMax.toLocaleString('en-IN')}/month
                    </span>
                    <span>•</span>
                    <span>{job.openings} Openings</span>
                    <span>•</span>
                    <span>Exp: {job.experienceLevel}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/jobs/${job.id}`}
                    className="py-1.5 px-3 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 hover:bg-gray-100"
                  >
                    Public Page
                  </Link>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => setActiveTab('applicants')}
                  >
                    View Applicants ({applicants.filter((a) => a.jobId === job.id).length})
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: POST A JOB */}
      {activeTab === 'post-job' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-xs">
          <div className="mb-6 pb-4 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-900">Post New Job Vacancy</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Verified under MSME Udyam Registration {myCompany.udyamNumber}.
            </p>
          </div>

          {successNotice && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{successNotice}</span>
            </div>
          )}

          <form onSubmit={handlePostJob} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Job Title / Designation *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Senior VMC & CNC Milling Specialist"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  National Industry Category *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as IndustryCategory)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden bg-white"
                >
                  <option value="manufacturing">Industrial & Manufacturing (Blue)</option>
                  <option value="technology">Technology & Digital (Purple)</option>
                  <option value="sales_operations">Sales & Frontline Operations (Teal)</option>
                  <option value="logistics_supply">Logistics & Supply Chain (Amber)</option>
                  <option value="creative_services">Creative & Design Services (Rose)</option>
                  <option value="healthcare_services">Healthcare & Industrial Wellness (Emerald)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Experience Level
                </label>
                <select
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden bg-white"
                >
                  <option value="Fresher">Fresher / Trainee</option>
                  <option value="1-2 Years">1-2 Years</option>
                  <option value="3-5 Years">3-5 Years</option>
                  <option value="5+ Years">5+ Years Senior</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Min Monthly Salary (₹ INR)
                </label>
                <input
                  type="number"
                  step="1000"
                  value={salaryMin}
                  onChange={(e) => setSalaryMin(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Max Monthly Salary (₹ INR)
                </label>
                <input
                  type="number"
                  step="1000"
                  value={salaryMax}
                  onChange={(e) => setSalaryMax(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Number of Openings
                </label>
                <input
                  type="number"
                  min="1"
                  value={openings}
                  onChange={(e) => setOpenings(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Key Skills (Comma separated)
                </label>
                <input
                  type="text"
                  value={skillsInput}
                  onChange={(e) => setSkillsInput(e.target.value)}
                  placeholder="CNC, Lathe, Gauging, 5S"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Job Description & Scope of Work *
                </label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Specify key work duties, equipment to operate, shift details, and statutory workplace benefits."
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveTab('manage-jobs')}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Publish Vacancy
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* TAB: APPLICANTS PIPELINE (Hard Invariant #1) */}
      {activeTab === 'applicants' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-900">Candidate Pipeline</h2>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Hard Invariant #1 Active: Contact details protected</span>
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Recruiter access only to verified qualification, trade skills, and platform messenger.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search candidates or jobs..."
                  value={applicantSearch}
                  onChange={(e) => setApplicantSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="py-1.5 px-3 text-xs rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden bg-white"
              >
                <option value="all">All Stages</option>
                <option value="applied">Applied</option>
                <option value="under_review">Under Review</option>
                <option value="shortlisted">Shortlisted</option>
                <option value="selected">Selected</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          {/* Applicant cards */}
          <div className="space-y-4">
            {filteredApplicants.map((app) => (
              <div
                key={app.id}
                className="p-5 rounded-xl border border-gray-200 bg-gray-50/50 hover:bg-white transition-all space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-gray-900">{app.candidateName}</h3>
                      <span className="text-[11px] font-mono text-gray-400">ID: {app.candidateId}</span>
                    </div>
                    <p className="text-xs text-gray-600 font-semibold mt-0.5">
                      Applied for: <span className="text-gray-900">{app.jobTitle}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {app.candidateEducation} • {app.candidateExperience}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={app.status} />
                    <select
                      value={app.status}
                      onChange={(e) => handleUpdateStatus(app.id, e.target.value as ApplicationStatus)}
                      className="py-1 px-2 text-xs rounded-lg border border-gray-300 bg-white font-semibold text-gray-700"
                    >
                      <option value="applied">Applied</option>
                      <option value="under_review">Under Review</option>
                      <option value="shortlisted">Shortlist</option>
                      <option value="interview_scheduled">Interview</option>
                      <option value="selected">Hire</option>
                      <option value="rejected">Decline</option>
                    </select>
                  </div>
                </div>

                {/* Candidate Skills */}
                <div className="flex flex-wrap gap-1.5">
                  {app.candidateSkills.map((sk, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 bg-white text-gray-700 text-xs font-semibold rounded border border-gray-200"
                    >
                      {sk}
                    </span>
                  ))}
                </div>

                {/* HARD INVARIANT #1: Phone & Email Display (Masked) */}
                <div className="p-3 rounded-lg bg-orange-50/50 border border-orange-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-4 text-gray-600">
                    <span className="flex items-center gap-1.5">
                      <strong className="text-gray-700 font-semibold">Phone:</strong>
                      <span className="font-mono text-gray-500">{maskCandidatePhone('+91 98260 14829')}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <strong className="text-gray-700 font-semibold">Email:</strong>
                      <span className="font-mono text-gray-500">{maskCandidateEmail('rahul.sharma@example.com')}</span>
                    </span>
                  </div>

                  <span className="text-[11px] text-orange-950 font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-orange-600" />
                    <span>Direct messaging enabled via JobsClick Platform</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: WALK-IN QR POSTER (EMP-03) */}
      {activeTab === 'qr-code' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Walk-in QR Recruitment Poster (EMP-03)</h2>
              <p className="text-xs text-gray-500">
                Display at your factory gate or office reception for walk-in candidate registration.
              </p>
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              <span>Print Poster</span>
            </Button>
          </div>

          <div
            id="company-qr-poster"
            className="bg-white p-8 sm:p-12 rounded-2xl border-2 border-dashed border-gray-300 max-w-xl mx-auto text-center space-y-6 print:border-none print:p-0"
          >
            <div className="inline-flex p-3 rounded-2xl bg-orange-50 border border-orange-200">
              <Building2 className="w-8 h-8 text-[#F97316]" />
            </div>

            <div>
              <h3 className="text-2xl font-bold text-gray-900">{myCompany.name}</h3>
              <p className="text-xs text-gray-500 mt-1 font-mono">
                Udyam Registration: {myCompany.udyamNumber}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">{myCompany.address}, {myCompany.city}</p>
            </div>

            {/* QR SVG */}
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 inline-block">
              <svg
                viewBox="0 0 100 100"
                className="w-48 h-48 mx-auto"
                fill="currentColor"
              >
                <rect width="100" height="100" fill="white" />
                <rect x="10" y="10" width="30" height="30" fill="#111827" />
                <rect x="15" y="15" width="20" height="20" fill="white" />
                <rect x="20" y="20" width="10" height="10" fill="#F97316" />

                <rect x="60" y="10" width="30" height="30" fill="#111827" />
                <rect x="65" y="15" width="20" height="20" fill="white" />
                <rect x="70" y="20" width="10" height="10" fill="#F97316" />

                <rect x="10" y="60" width="30" height="30" fill="#111827" />
                <rect x="15" y="65" width="20" height="20" fill="white" />
                <rect x="20" y="70" width="10" height="10" fill="#F97316" />

                <rect x="45" y="15" width="8" height="8" fill="#111827" />
                <rect x="45" y="30" width="8" height="8" fill="#111827" />
                <rect x="45" y="60" width="8" height="8" fill="#111827" />
                <rect x="45" y="75" width="8" height="8" fill="#111827" />
                <rect x="65" y="45" width="8" height="8" fill="#111827" />
                <rect x="75" y="60" width="8" height="8" fill="#111827" />
                <rect x="60" y="75" width="8" height="8" fill="#111827" />
                <rect x="75" y="75" width="15" height="15" fill="#111827" />
              </svg>
            </div>

            <div>
              <p className="text-sm font-bold text-gray-900">
                Scan with any Smartphone Camera to Apply
              </p>
              <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                Direct walk-in registration. No resume printing required. Instant OTP login.
              </p>
            </div>

            <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
              <span>National MSME Employment Platform</span>
              <span>JobsClick • jobsclick.in/company/{myCompany.id}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
