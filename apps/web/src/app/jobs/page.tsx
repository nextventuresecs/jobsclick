import React from 'react';
import Link from 'next/link';
import {
  CategoryBadge,
  getCategoryCardBorderClass,
  Button,
} from '@indian-job-portal/ui';
import type { JobCategory, IndustryCategory } from '@indian-job-portal/validation';
import { Navbar } from '../../components/layout/Navbar';
import { Footer } from '../../components/layout/Footer';
import { SAMPLE_JOBS, JobItem } from '../../data/sampleJobs';
import {
  Search,
  MapPin,
  Briefcase,
  IndianRupee,
  Clock,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { SaveSearchAlertModal } from '../../components/jobs/SaveSearchAlertModal';

interface JobsPageProps {
  readonly searchParams?: {
    readonly keyword?: string;
    readonly city?: string;
    readonly category?: string;
    readonly employmentType?: string;
    readonly minPay?: string;
  };
}

const CATEGORY_TABS: readonly {
  readonly key: string;
  readonly label: string;
}[] = [
  { key: '', label: 'All Sectors' },
  { key: 'technology', label: 'Technology & Software' },
  { key: 'manufacturing', label: 'Manufacturing & Trades' },
  { key: 'sales_operations', label: 'Sales & Operations' },
  { key: 'logistics_supply', label: 'Logistics & Supply Chain' },
  { key: 'creative_services', label: 'Creative & Design' },
  { key: 'healthcare_services', label: 'Healthcare & Services' },
] as const;

export default async function JobsListPage({ searchParams }: JobsPageProps) {
  const keyword = searchParams?.keyword?.trim() || '';
  const city = searchParams?.city?.trim() || '';
  const category = searchParams?.category?.trim() || '';
  const employmentType = searchParams?.employmentType?.trim() || '';
  const minPay = searchParams?.minPay ? Number(searchParams.minPay) : 0;
  const apiUrl = process.env['API_URL'] || 'http://localhost:3001';

  let liveJobs: JobItem[] = [...SAMPLE_JOBS];

interface RawJobsListResponse {
  readonly jobs?: readonly {
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
    readonly isFeatured?: boolean;
    readonly isPromoted?: boolean;
    readonly featuredUntil?: string;
  }[];
}

  try {
    const queryParams = new URLSearchParams();
    if (keyword) queryParams.set('keyword', keyword);
    if (city) queryParams.set('city', city);
    if (category) queryParams.set('category', category);

    const res = await fetch(`${apiUrl}/jobs?${queryParams.toString()}`, {
      next: { revalidate: 30 },
    });
    if (res.ok) {
      const data = (await res.json()) as RawJobsListResponse | null;
      if (data && Array.isArray(data.jobs) && data.jobs.length > 0) {
        liveJobs = data.jobs.map((j) => ({
          id: j.id,
          title: j.title,
          companyName: j.companyName || 'Verified Enterprise',
          companyId: j.companyId || 'comp-01',
          location: j.city || 'India',
          district: j.district || j.city || 'National',
          state: j.state || 'India',
          category: j.category || 'manufacturing',
          employmentType: j.employmentType || 'Full-time',
          salaryMin: j.minPay || 18000,
          salaryMax: j.maxPay || 30000,
          openings: j.openings || 1,
          experienceLevel: j.experienceLevel || 'Fresher',
          skills: Array.isArray(j.skills) ? j.skills : [],
          description: j.description || '',
          requirements: Array.isArray(j.requirements) ? j.requirements : [],
          postedDate: j.createdAt ? new Date(j.createdAt).toLocaleDateString() : 'Recent',
          expiryDate: j.expiryDate || '',
          isPromoted: j.isPromoted,
          isFeatured: j.isFeatured,
          featuredUntil: j.featuredUntil,
        }));
      }
    }
  } catch {
    // Graceful fallback to SAMPLE_JOBS
  }

  // Filter in-memory if API fell back to sample data
  const filteredJobs = liveJobs.filter((job) => {
    if (keyword) {
      const q = keyword.toLowerCase();
      const matchTitle = job.title.toLowerCase().includes(q);
      const matchComp = job.companyName.toLowerCase().includes(q);
      const matchSkill = job.skills.some((s) => s.toLowerCase().includes(q));
      if (!matchTitle && !matchComp && !matchSkill) return false;
    }
    if (city) {
      const c = city.toLowerCase();
      const matchLoc = job.location.toLowerCase().includes(c);
      const matchDist = job.district.toLowerCase().includes(c);
      if (!matchLoc && !matchDist) return false;
    }
    if (category && category !== 'all') {
      if (job.category !== category) return false;
    }
    if (employmentType && employmentType !== 'all') {
      if (job.employmentType !== employmentType) return false;
    }
    if (minPay > 0) {
      if (job.salaryMax < minPay) return false;
    }
    return true;
  });

  filteredJobs.sort((a, b) => {
    const aPromoted = Boolean(a.isPromoted);
    const bPromoted = Boolean(b.isPromoted);
    if (aPromoted !== bPromoted) return aPromoted ? -1 : 1;
    return 0;
  });

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-[#1F2937] flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 w-full">
        {/* Search Header Banner */}
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-xs space-y-6">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-brand-orange">
              Pan-India Job Directory
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mt-1">
              Find Verified Opportunities Nationwide
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              Direct hiring with verified MSMEs and enterprises. Contact privacy guaranteed.
            </p>
          </div>

          {/* Search Inputs */}
          <form action="/jobs" method="GET" className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-5 flex items-center gap-2.5 px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200">
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                type="text"
                name="keyword"
                defaultValue={keyword}
                placeholder="Job title, skill (e.g. CNC, React, Sales, Logistics)..."
                className="w-full bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-4 flex items-center gap-2.5 px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200">
              <MapPin className="w-4 h-4 text-brand-orange shrink-0" />
              <input
                type="text"
                name="city"
                defaultValue={city}
                placeholder="City (e.g. Bengaluru, Pune, Delhi, Mumbai)..."
                className="w-full bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
              />
            </div>

            {category && <input type="hidden" name="category" value={category} />}
            {employmentType && <input type="hidden" name="employmentType" value={employmentType} />}
            {minPay > 0 && <input type="hidden" name="minPay" value={minPay} />}

            <div className="sm:col-span-3 flex items-center gap-2">
              <Button type="submit" variant="primary" size="md" className="flex-1 font-semibold">
                Search Jobs
              </Button>
              {(keyword || city || category || employmentType || minPay > 0) && (
                <Link
                  href="/jobs"
                  className="p-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors"
                  title="Reset filters"
                >
                  <RotateCcw className="w-4 h-4" />
                </Link>
              )}
            </div>
          </form>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
            <span className="text-xs font-semibold text-gray-500 mr-1 flex items-center gap-1">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Sectors:
            </span>
            {CATEGORY_TABS.map((tab) => {
              const isSelected = category === tab.key;
              const nextQuery = new URLSearchParams();
              if (keyword) nextQuery.set('keyword', keyword);
              if (city) nextQuery.set('city', city);
              if (tab.key) nextQuery.set('category', tab.key);
              if (employmentType) nextQuery.set('employmentType', employmentType);
              if (minPay > 0) nextQuery.set('minPay', String(minPay));

              return (
                <Link
                  key={tab.key}
                  href={`/jobs?${nextQuery.toString()}`}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-brand-orange text-white shadow-xs font-semibold'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>

          {/* Employment Type Quick Filters */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
            <span className="text-xs font-semibold text-gray-500 mr-1 flex items-center gap-1">
              <Briefcase className="w-3.5 h-3.5" />
              Job Type:
            </span>
            {['', 'Full-time', 'Apprenticeship', 'Contract', 'Shift-based'].map((type) => {
              const isSelected = employmentType === type;
              const nextQuery = new URLSearchParams();
              if (keyword) nextQuery.set('keyword', keyword);
              if (city) nextQuery.set('city', city);
              if (category) nextQuery.set('category', category);
              if (type) nextQuery.set('employmentType', type);
              if (minPay > 0) nextQuery.set('minPay', String(minPay));

              return (
                <Link
                  key={type || 'all'}
                  href={`/jobs?${nextQuery.toString()}`}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-gray-900 text-white shadow-xs font-semibold'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                  }`}
                >
                  {type || 'All Types'}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Results Header */}
        <div className="flex flex-wrap items-center justify-between text-xs text-gray-500 px-1 gap-2">
          <span>
            Showing <strong className="text-gray-900">{filteredJobs.length}</strong> verified opportunities
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {category && (
              <span className="font-medium text-brand-orange bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                Sector: {category.replace('_', ' ')}
              </span>
            )}
            {employmentType && (
              <span className="font-medium text-gray-800 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                Type: {employmentType}
              </span>
            )}
            <SaveSearchAlertModal
              currentKeyword={keyword}
              currentCity={city}
              currentCategory={category}
            />
          </div>
        </div>

        {/* Job Listings Grid */}
        {filteredJobs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredJobs.map((job) => {
              const borderClass = getCategoryCardBorderClass(job.category as JobCategory);
              return (
                <div
                  key={job.id}
                  className={`bg-white rounded-2xl p-6 border ${job.isPromoted ? 'border-amber-400 ring-2 ring-amber-300/50 bg-amber-50/20' : 'border-gray-200'} ${borderClass} hover:shadow-md transition-all flex flex-col justify-between`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        {job.isPromoted && (
                          <div className="mb-1.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                              <Sparkles className="w-3 h-3 text-amber-600 fill-amber-500" />
                              Featured Opportunity
                            </span>
                          </div>
                        )}
                        <span className="text-xs font-medium text-gray-500 block mb-0.5">
                          {job.companyName}
                        </span>
                        <Link
                          href={`/jobs/${job.id}`}
                          className="text-lg font-bold text-gray-900 hover:text-brand-orange transition-colors"
                        >
                          {job.title}
                        </Link>
                      </div>
                      <CategoryBadge category={job.category as JobCategory} />
                    </div>

                    <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-gray-600 mb-4">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-gray-400" />
                        <span>{job.location}</span>
                      </div>
                      <div className="flex items-center gap-1 font-semibold text-gray-900">
                        <IndianRupee className="w-3.5 h-3.5 text-emerald-600" />
                        <span>
                          ₹{job.salaryMin.toLocaleString('en-IN')} - ₹{job.salaryMax.toLocaleString('en-IN')}/mo
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Briefcase className="w-3.5 h-3.5 text-gray-400" />
                        <span>{job.employmentType}</span>
                      </div>
                    </div>

                    <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed mb-4">
                      {job.description}
                    </p>

                    {/* Skills pills */}
                    <div className="flex flex-wrap gap-1.5 mb-5">
                      {job.skills.map((skill, idx) => (
                        <span
                          key={idx}
                          className="text-[11px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Bottom Bar */}
                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-xs">
                    <span className="text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{job.postedDate}</span>
                    </span>
                    <Link href={`/jobs/${job.id}`}>
                      <Button variant="primary" size="sm" className="font-semibold">
                        View Details & Apply
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-12 text-center border border-gray-200 max-w-lg mx-auto space-y-4">
            <Search className="w-12 h-12 text-gray-300 mx-auto" />
            <h3 className="text-lg font-bold text-gray-900">No matching jobs found</h3>
            <p className="text-xs text-gray-500">
              Try broadening your keyword, searching for a different city, or clearing your active filters.
            </p>
            <Link href="/jobs">
              <Button variant="outline" size="sm">
                Clear All Filters
              </Button>
            </Link>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
