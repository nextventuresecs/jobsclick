import React from 'react';
import Link from 'next/link';
import {
  CategoryBadge,
  getCategoryCardBorderClass,
  Button,
} from '@indian-job-portal/ui';
import type { JobCategory, IndustryCategory } from '@indian-job-portal/validation';
import { Navbar } from '../../../components/layout/Navbar';
import { Footer } from '../../../components/layout/Footer';
import { SAMPLE_JOBS, JobItem } from '../../../data/sampleJobs';
import {
  ArrowLeft,
  MapPin,
  IndianRupee,
  Briefcase,
  Clock,
  Building2,
  CheckCircle2,
  ShieldCheck,
  Calendar,
  Lock,
} from 'lucide-react';

interface JobDetailPageProps {
  readonly params: {
    readonly id: string;
  };
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const jobId = params.id;
  const apiUrl = process.env['API_URL'] || 'http://localhost:3001';

  let job: JobItem = SAMPLE_JOBS.find((j) => j.id === jobId) || {
    ...SAMPLE_JOBS[0]!,
    id: jobId,
  };

interface JobDetailApiResponse {
  readonly id: string;
  readonly title: string;
  readonly companyName?: string;
  readonly companyId?: string;
  readonly city?: string;
  readonly district?: string;
  readonly state?: string;
  readonly category?: IndustryCategory;
  readonly employmentType?: JobItem['employmentType'];
  readonly minPay?: number;
  readonly maxPay?: number;
  readonly openings?: number;
  readonly experienceLevel?: JobItem['experienceLevel'];
  readonly skills?: readonly string[];
  readonly description?: string;
  readonly requirements?: readonly string[];
  readonly createdAt?: string;
  readonly expiryDate?: string;
}

  try {
    const res = await fetch(`${apiUrl}/jobs/${jobId}`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = (await res.json()) as JobDetailApiResponse | null;
      if (data && data.id) {
        job = {
          id: data.id,
          title: data.title,
          companyName: data.companyName || 'Verified Enterprise',
          companyId: data.companyId || 'comp-01',
          location: data.city || 'India',
          district: data.district || data.city || 'National',
          state: data.state || 'India',
          category: data.category || 'manufacturing',
          employmentType: data.employmentType || 'Full-time',
          salaryMin: data.minPay || 18000,
          salaryMax: data.maxPay || 30000,
          openings: data.openings || 1,
          experienceLevel: data.experienceLevel || 'Fresher',
          skills: Array.isArray(data.skills) ? data.skills : [],
          description: data.description || '',
          requirements: Array.isArray(data.requirements) ? data.requirements : [],
          postedDate: data.createdAt ? new Date(data.createdAt).toLocaleDateString() : 'Recent',
          expiryDate: data.expiryDate || '2026-12-31',
        };
      }
    }
  } catch {
    // Graceful fallback to sample job
  }

  // Google JobPosting JSON-LD Structured Data (Hard Invariant #9 / PRD 9)
  const jobPostingJsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description,
    datePosted: job.postedDate,
    validThrough: job.expiryDate,
    employmentType: job.employmentType.toUpperCase().replace('-', '_'),
    hiringOrganization: {
      '@type': 'Organization',
      name: job.companyName,
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job.location,
        addressRegion: job.district,
        addressCountry: 'IN',
      },
    },
    baseSalary: {
      '@type': 'MonetaryAmount',
      currency: 'INR',
      value: {
        '@type': 'QuantitativeValue',
        minValue: job.salaryMin,
        maxValue: job.salaryMax,
        unitText: 'MONTH',
      },
    },
  };

  const borderClass = getCategoryCardBorderClass(job.category as JobCategory);

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-[#1F2937] flex flex-col font-sans">
      <Navbar />

      {/* Structured SEO Data for Google Jobs */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPostingJsonLd) }}
      />

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 w-full">
        {/* Back Link */}
        <Link
          href="/jobs"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-brand-orange transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Search Results</span>
        </Link>

        {/* Main Details Card */}
        <div className={`bg-white rounded-2xl border border-gray-200 ${borderClass} overflow-hidden shadow-xs`}>
          {/* Header Strip */}
          <div className="p-6 sm:p-8 border-b border-gray-200 bg-gradient-to-b from-gray-50/50 to-white">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-2">
                <CategoryBadge category={job.category as JobCategory} size="md" />
                <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                  {job.title}
                </h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 font-medium">
                  <Link
                    href={`/company/${job.companyId}`}
                    className="hover:text-brand-orange flex items-center gap-1 text-gray-800"
                  >
                    <Building2 className="w-4 h-4 text-gray-400" />
                    <span>{job.companyName}</span>
                  </Link>
                  <span aria-hidden="true" className="text-gray-300">·</span>
                  <span className="flex items-center gap-1 text-gray-500">
                    <MapPin className="w-4 h-4 text-brand-orange" />
                    {job.location} ({job.district})
                  </span>
                </div>
              </div>

              {/* Action Apply Button */}
              <div className="shrink-0 flex sm:flex-col items-center sm:items-end gap-2">
                <Button variant="primary" size="lg" className="w-full sm:w-auto font-bold shadow-sm">
                  Apply Now
                </Button>
                <span className="text-[11px] text-gray-400">Direct Application</span>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
              <div className="space-y-0.5">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <IndianRupee className="w-3.5 h-3.5" />
                  Monthly Compensation
                </span>
                <p className="text-sm font-bold text-gray-900">
                  ₹{job.salaryMin.toLocaleString('en-IN')} - ₹{job.salaryMax.toLocaleString('en-IN')}
                </p>
              </div>

              <div className="space-y-0.5">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Briefcase className="w-3.5 h-3.5" />
                  Employment Type
                </span>
                <p className="text-sm font-bold text-gray-900">{job.employmentType}</p>
              </div>

              <div className="space-y-0.5">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  Experience Level
                </span>
                <p className="text-sm font-bold text-gray-900">{job.experienceLevel}</p>
              </div>

              <div className="space-y-0.5">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Open Vacancies
                </span>
                <p className="text-sm font-bold text-brand-orange">{job.openings} Openings</p>
              </div>
            </div>
          </div>

          {/* Body Content */}
          <div className="p-6 sm:p-8 space-y-8">
            {/* Hard Invariant #1 Privacy Callout */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed text-emerald-900">
                <strong className="font-semibold block text-emerald-950">Candidate Contact Privacy Guaranteed</strong>
                Employers never see your personal phone number or email address. All interview scheduling and communications happen securely through JobsClick platform messaging.
              </div>
            </div>

            {/* Description */}
            <div className="space-y-3">
              <h2 className="text-base font-bold text-gray-900">Job Overview & Responsibilities</h2>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                {job.description}
              </p>
            </div>

            {/* Requirements Checklist */}
            {job.requirements && job.requirements.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-gray-100">
                <h2 className="text-base font-bold text-gray-900">Eligibility & Requirements</h2>
                <ul className="space-y-2">
                  {job.requirements.map((req, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-sm text-gray-700">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Skills */}
            <div className="space-y-3 pt-4 border-t border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Required Skills & Competencies</h2>
              <div className="flex flex-wrap gap-2">
                {job.skills.map((skill, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 bg-gray-100 border border-gray-200 text-xs font-semibold text-gray-800 rounded-lg"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            {/* Verified Employer Box */}
            <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  Verified Employer Information
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded text-xs font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Udyam Registered MSME
                </span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">{job.companyName}</h3>
              <p className="text-xs text-gray-600">
                Direct enterprise employer located in {job.location}, {job.district}, {job.state}. Hiring verified candidates with zero commission.
              </p>
              <div className="pt-2">
                <Link href={`/company/${job.companyId}`}>
                  <Button variant="outline" size="sm" className="font-semibold">
                    View Verified Company Profile
                  </Button>
                </Link>
              </div>
            </div>

            {/* Bottom Apply CTA Bar */}
            <div className="pt-6 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-gray-500 flex items-center gap-2">
                <Lock className="w-4 h-4 text-gray-400" />
                <span>One-click apply with your verified digital profile</span>
              </div>
              <Button variant="primary" size="lg" className="w-full sm:w-auto font-bold shadow-sm">
                Apply for this Position
              </Button>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
