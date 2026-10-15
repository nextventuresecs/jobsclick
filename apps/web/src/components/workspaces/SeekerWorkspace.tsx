'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  INITIAL_SEEKER_PROFILE,
  INITIAL_APPLICATIONS,
  SeekerProfileData,
  ApplicationData,
} from '../../data/sampleWorkspaces';
import { SAMPLE_JOBS } from '../../data/sampleJobs';
import {
  CategoryBadge,
  StatusBadge,
  getCategoryCardBorderClass,
  Button,
  JobsClickLogo,
} from '@indian-job-portal/ui';
import {
  User,
  Briefcase,
  FileText,
  Printer,
  CheckCircle2,
  Clock,
  MapPin,
  Building2,
  ShieldCheck,
  Calendar,
  Edit3,
  ArrowRight,
} from 'lucide-react';

export function SeekerWorkspace() {
  const [activeTab, setActiveTab] = useState<'overview' | 'applications' | 'profile' | 'cv-preview'>('overview');
  const [profile, setProfile] = useState<SeekerProfileData>(INITIAL_SEEKER_PROFILE);
  const [applications] = useState<readonly ApplicationData[]>(INITIAL_APPLICATIONS);
  const [isEditing, setIsEditing] = useState(false);

  // Edit form state
  const [name, setName] = useState(profile.name);
  const [city, setCity] = useState(profile.city);
  const [qualification, setQualification] = useState(profile.qualification);
  const [institution, setInstitution] = useState(profile.institution);
  const [experienceYears, setExperienceYears] = useState(profile.experienceYears);
  const [skillsInput, setSkillsInput] = useState(profile.skills.join(', '));
  const [bio, setBio] = useState(profile.bio);

  const myApplications = applications.filter((a) => a.candidateId === profile.id);
  const recommendedJobs = SAMPLE_JOBS.filter((j) =>
    profile.preferredCategories.includes(j.category)
  ).slice(0, 3);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const skills = skillsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    setProfile({
      ...profile,
      name,
      city,
      qualification,
      institution,
      experienceYears: Number(experienceYears),
      skills: skills.length > 0 ? skills : profile.skills,
      bio,
    });
    setIsEditing(false);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-8">
      {/* Candidate Banner */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-orange-200 bg-gray-100 shrink-0">
            {profile.avatar ? (
              <img
                src={profile.avatar}
                alt={profile.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[#FFF0E5] text-[#F97316] font-bold text-xl">
                {profile.name.charAt(0)}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{profile.name}</h1>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>Verified Candidate</span>
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
              <span>{profile.currentRole || 'Candidate'}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3 text-gray-400" />
                {profile.city}, {profile.state}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-xs font-semibold text-gray-500">Profile Readiness</span>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-28 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${profile.completionPercentage}%` }}
                />
              </div>
              <span className="text-xs font-bold text-gray-900">{profile.completionPercentage}%</span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setActiveTab('cv-preview')}
            className="hidden sm:inline-flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4 text-gray-600" />
            <span>Digital CV</span>
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto gap-2">
        {[
          { id: 'overview', label: 'Dashboard Overview', icon: Briefcase },
          { id: 'applications', label: `My Applications (${myApplications.length})`, icon: Clock },
          { id: 'profile', label: 'Professional Profile', icon: User },
          { id: 'cv-preview', label: 'Verified CV & PDF', icon: FileText },
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
          {/* Quick Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">Active Applications</span>
              <p className="text-2xl font-bold text-gray-900 mt-1">{myApplications.length}</p>
              <p className="text-[11px] text-gray-500 mt-1">Submitted to verified MSMEs</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">Shortlisted / Under Review</span>
              <p className="text-2xl font-bold text-blue-600 mt-1">
                {myApplications.filter((a) => a.status === 'shortlisted' || a.status === 'under_review').length}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">Employer evaluation active</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-semibold text-gray-500">Privacy Status</span>
              <div className="flex items-center gap-1.5 mt-1.5">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <span className="text-sm font-bold text-emerald-700">100% PII Protected</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">Phone & email hidden from recruiters</p>
            </div>
          </div>

          {/* Active Applications preview */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-900">Application Pipeline</h2>
              <button
                type="button"
                onClick={() => setActiveTab('applications')}
                className="text-xs font-semibold text-[#F97316] hover:underline"
              >
                View all ({myApplications.length})
              </button>
            </div>

            <div className="space-y-3">
              {myApplications.map((app) => (
                <div
                  key={app.id}
                  className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">{app.jobTitle}</h3>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-gray-400" />
                      <span>{app.companyName}</span>
                      <span>•</span>
                      <span>Applied on {app.appliedDate}</span>
                    </p>
                    {app.interviewDate && (
                      <p className="text-xs font-semibold text-blue-700 mt-1.5 flex items-center gap-1 bg-blue-50 px-2.5 py-1 rounded-md w-fit">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Interview Scheduled: {app.interviewDate}</span>
                      </p>
                    )}
                  </div>
                  <div className="shrink-0">
                    <StatusBadge status={app.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recommended Jobs */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-gray-900">Recommended Opportunities</h2>
                <p className="text-xs text-gray-500">Based on your skills & vocational preferences</p>
              </div>
              <Link
                href="/jobs"
                className="text-xs font-semibold text-[#F97316] hover:underline inline-flex items-center gap-1"
              >
                <span>Browse All Jobs</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {recommendedJobs.map((job) => (
                <div
                  key={job.id}
                  className={`bg-white rounded-xl border border-gray-200 p-4 shadow-2xs hover:shadow-md transition-all ${getCategoryCardBorderClass(
                    job.category
                  )} flex flex-col justify-between`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <CategoryBadge category={job.category} />
                      <span className="text-xs font-bold text-gray-900">
                        ₹{(job.salaryMin / 1000).toFixed(0)}k - ₹{(job.salaryMax / 1000).toFixed(0)}k/mo
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-gray-900 line-clamp-1">{job.title}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{job.companyName}</p>
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      <span>{job.location}</span>
                    </p>
                  </div>
                  <Link
                    href={`/jobs/${job.id}`}
                    className="mt-4 block text-center py-2 px-3 rounded-lg text-xs font-semibold text-[#F97316] bg-orange-50 hover:bg-orange-100 transition-colors"
                  >
                    View Details & Apply
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB: APPLICATIONS */}
      {activeTab === 'applications' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">My Job Applications</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Live status updates for your direct submissions to verified MSME employers.
            </p>
          </div>

          <div className="space-y-4">
            {myApplications.map((app) => (
              <div
                key={app.id}
                className="p-5 rounded-xl border border-gray-200 bg-gray-50/50 hover:bg-white transition-all space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">{app.jobTitle}</h3>
                    <p className="text-xs text-gray-600 mt-1 flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-gray-400" />
                      <span className="font-semibold">{app.companyName}</span>
                      <span>•</span>
                      <span>Applied on {app.appliedDate}</span>
                    </p>
                  </div>
                  <StatusBadge status={app.status} />
                </div>

                {app.notes && (
                  <div className="p-3 rounded-lg bg-orange-50 border border-orange-200 text-xs text-orange-950">
                    <span className="font-semibold">Recruiter Note:</span> {app.notes}
                  </div>
                )}

                {app.interviewDate && (
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-950 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>
                      <strong className="font-semibold">Interview Scheduled:</strong> {app.interviewDate}
                    </span>
                  </div>
                )}

                <div className="pt-2 border-t border-gray-200 flex flex-wrap items-center justify-between text-xs text-gray-500 gap-2">
                  <span>Candidate ID: {app.candidateId}</span>
                  <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Contact details masked for privacy</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: PROFILE */}
      {activeTab === 'profile' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-xs">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900">Professional Profile</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Keep your technical skills and trade certifications up to date.
              </p>
            </div>
            {!isEditing ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center gap-1.5"
              >
                <Edit3 className="w-4 h-4 text-gray-600" />
                <span>Edit Profile</span>
              </Button>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-xs text-gray-500 hover:underline"
              >
                Cancel
              </button>
            )}
          </div>

          {!isEditing ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              <div>
                <span className="text-xs font-semibold text-gray-500 block">Full Name</span>
                <p className="font-bold text-gray-900 mt-0.5">{profile.name}</p>
              </div>

              <div>
                <span className="text-xs font-semibold text-gray-500 block">Location</span>
                <p className="font-bold text-gray-900 mt-0.5">
                  {profile.city}, {profile.district}, {profile.state} ({profile.pincode})
                </p>
              </div>

              <div>
                <span className="text-xs font-semibold text-gray-500 block">Highest Qualification</span>
                <p className="font-bold text-gray-900 mt-0.5">{profile.qualification}</p>
                <p className="text-xs text-gray-500 mt-0.5">{profile.institution} ({profile.graduationYear})</p>
              </div>

              <div>
                <span className="text-xs font-semibold text-gray-500 block">Total Experience</span>
                <p className="font-bold text-gray-900 mt-0.5">{profile.experienceYears} Years</p>
              </div>

              <div className="md:col-span-2">
                <span className="text-xs font-semibold text-gray-500 block mb-1.5">
                  Technical Skills & Competencies
                </span>
                <div className="flex flex-wrap gap-2">
                  {profile.skills.map((s, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 bg-gray-100 text-gray-800 text-xs font-semibold rounded-lg border border-gray-200"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <div className="md:col-span-2">
                <span className="text-xs font-semibold text-gray-500 block mb-1">Professional Bio</span>
                <p className="text-xs text-gray-700 leading-relaxed bg-gray-50 p-4 rounded-xl border border-gray-200">
                  {profile.bio}
                </p>
              </div>

              <div className="md:col-span-2 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Hard Invariant #1: Employer/anyone never sees a candidate phone or email.</span>
                </div>
                <span>Masked: +91 ••••• ••829</span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Qualification</label>
                  <input
                    type="text"
                    value={qualification}
                    onChange={(e) => setQualification(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Institution</label>
                  <input
                    type="text"
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Experience (Years)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={experienceYears}
                    onChange={(e) => setExperienceYears(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Skills (Comma separated)
                  </label>
                  <input
                    type="text"
                    value={skillsInput}
                    onChange={(e) => setSkillsInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Professional Summary / Bio
                  </label>
                  <textarea
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
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
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  Save Changes
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* TAB: CV PREVIEW & PRINT */}
      {activeTab === 'cv-preview' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Authenticated JobsClick Digital CV</h2>
              <p className="text-xs text-gray-500">
                Hard Invariant #1 & #8a: Bilingual ready, privacy-shielded format.
              </p>
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Download PDF</span>
            </Button>
          </div>

          {/* Printable CV sheet */}
          <div
            id="candidate-cv-sheet"
            className="bg-white p-8 sm:p-12 rounded-2xl border border-gray-300 shadow-lg max-w-4xl mx-auto space-y-6 print:border-none print:shadow-none print:p-0"
          >
            {/* CV Header */}
            <div className="flex items-start justify-between border-b-2 border-orange-500 pb-6">
              <div>
                <JobsClickLogo variant="full" size="md" />
                <h2 className="text-2xl font-bold text-gray-900 mt-4">{profile.name}</h2>
                <p className="text-sm font-semibold text-gray-600 mt-0.5">
                  {profile.qualification} • {profile.city}, {profile.state}
                </p>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>JobsClick Verified</span>
                </span>
                <p className="text-[11px] text-gray-400 font-mono mt-2">Candidate ID: {profile.id}</p>
              </div>
            </div>

            {/* Privacy notice banner */}
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 flex items-center justify-between">
              <span className="font-semibold text-gray-800">
                Contact Privacy Protocol Enforced:
              </span>
              <span>Direct communication via verified platform messaging only.</span>
            </div>

            {/* Profile summary */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">
                Professional Summary
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed">{profile.bio}</p>
            </div>

            {/* Qualifications */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">
                  Technical Education
                </h3>
                <p className="font-bold text-gray-900 text-sm">{profile.qualification}</p>
                <p className="text-xs text-gray-600 mt-0.5">{profile.institution}</p>
                <p className="text-xs text-gray-500 mt-0.5">Batch of {profile.graduationYear}</p>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">
                  Experience & Roles
                </h3>
                <p className="font-bold text-gray-900 text-sm">
                  {profile.experienceYears} Years Hands-on Experience
                </p>
                <p className="text-xs text-gray-600 mt-0.5">Current Role: {profile.currentRole}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Willing to Relocate: {profile.willingToRelocate ? 'Yes' : 'No'}
                </p>
              </div>
            </div>

            {/* Skills */}
            <div className="pt-4 border-t border-gray-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">
                Certified Skills & Tools
              </h3>
              <div className="flex flex-wrap gap-2">
                {profile.skills.map((s, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 bg-gray-100 text-gray-800 text-xs font-semibold rounded-md border border-gray-200"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
