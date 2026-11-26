import React from 'react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  CategoryBadge,
  getCategoryCardBorderClass,
  Button,
} from '@indian-job-portal/ui';
import { employmentTypeSchema, type EmploymentType, type JobCategory } from '@indian-job-portal/validation';
import { Navbar } from '../../components/layout/Navbar';
import { Footer } from '../../components/layout/Footer';
import type { JobItem } from '../../data/sampleJobs';
import { mapApiJobToJobItem, type ApiJobPayload } from '../../lib/job-mapper';
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

export const revalidate = 30;

interface JobsPageProps {
  readonly searchParams?: {
    readonly keyword?: string;
    readonly city?: string;
    readonly category?: string;
    readonly employmentType?: string;
    readonly minPay?: string;
  };
}

const CATEGORY_TABS = [
  '', 'technology', 'manufacturing', 'sales_operations', 'logistics_supply',
  'creative_services', 'healthcare_services',
] as const;

const EMPLOYMENT_FILTERS = ['', 'Full-time', 'Apprenticeship', 'Contract', 'Shift-based'] as const;
const EMPLOYMENT_LABELS = {
  'Full-time': 'fullTime',
  'Part-time': 'partTime',
  Apprenticeship: 'apprenticeship',
  Contract: 'contract',
  'Shift-based': 'shiftBased',
} as const satisfies Record<EmploymentType, string>;

export default async function JobsListPage({ searchParams }: JobsPageProps) {
  const [locale, t, categoryT] = await Promise.all([
    getLocale(),
    getTranslations('JobsPage'),
    getTranslations('Categories'),
  ]);
  const jobsPath = locale === 'hi' ? '/hi/jobs' : '/jobs';
  const keyword = searchParams?.keyword?.trim() || '';
  const city = searchParams?.city?.trim() || '';
  const category = searchParams?.category?.trim() || '';
  const employmentType = searchParams?.employmentType?.trim() || '';
  const selectedCategory = CATEGORY_TABS.find((key) => key === category);
  const selectedEmployment = employmentTypeSchema.safeParse(employmentType);
  const minPay = searchParams?.minPay ? Number(searchParams.minPay) : 0;
  const apiUrl = process.env['API_URL'] || 'http://localhost:3001';

  let liveJobs: JobItem[] = [];

  try {
    const queryParams = new URLSearchParams();
    if (keyword) queryParams.set('keyword', keyword);
    if (city) queryParams.set('city', city);
    if (category) queryParams.set('category', category);
    if (minPay > 0) queryParams.set('minPay', String(minPay));

    const res = await fetch(`${apiUrl}/jobs?${queryParams.toString()}`, {
      headers: {
        Accept: 'application/json',
      },
      next: { revalidate: 30 },
    });
    if (res.ok) {
      const data = (await res.json()) as { readonly jobs?: readonly ApiJobPayload[] } | null;
      if (data && Array.isArray(data.jobs)) {
        liveJobs = data.jobs.map((j) => mapApiJobToJobItem(j));
      }
    }
  } catch {
    liveJobs = [];
  }

  // Active listings from live API (apply client-side employmentType filter only if requested)
  const filteredJobs = employmentType && employmentType !== 'all'
    ? liveJobs.filter((job) => job.employmentType === employmentType)
    : liveJobs;

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
              {t('directoryLabel')}
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mt-1">
              {t('heading')}
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              {t('subheading')}
            </p>
          </div>

          {/* Search Inputs */}
          <form action={jobsPath} method="GET" className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-5 flex items-center gap-2.5 px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200">
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                type="text"
                name="keyword"
                defaultValue={keyword}
                placeholder={t('searchPlaceholder')}
                className="w-full bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-4 flex items-center gap-2.5 px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200">
              <MapPin className="w-4 h-4 text-brand-orange shrink-0" />
              <input
                type="text"
                name="city"
                defaultValue={city}
                placeholder={t('cityPlaceholder')}
                className="w-full bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
              />
            </div>

            {category && <input type="hidden" name="category" value={category} />}
            {employmentType && <input type="hidden" name="employmentType" value={employmentType} />}
            {minPay > 0 && <input type="hidden" name="minPay" value={minPay} />}

            <div className="sm:col-span-3 flex items-center gap-2">
              <Button type="submit" variant="primary" size="md" className="flex-1 font-semibold">
                {t('searchJobs')}
              </Button>
              {(keyword || city || category || employmentType || minPay > 0) && (
                <Link
                  href={jobsPath}
                  className="p-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors"
                  title={t('resetFilters')}
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
              {t('sectorsLabel')}
            </span>
            {CATEGORY_TABS.map((categoryKey) => {
              const isSelected = category === categoryKey;
              const nextQuery = new URLSearchParams();
              if (keyword) nextQuery.set('keyword', keyword);
              if (city) nextQuery.set('city', city);
              if (categoryKey) nextQuery.set('category', categoryKey);
              if (employmentType) nextQuery.set('employmentType', employmentType);
              if (minPay > 0) nextQuery.set('minPay', String(minPay));

              return (
                <Link
                  key={categoryKey}
                  href={`${jobsPath}?${nextQuery.toString()}`}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-brand-orange text-white shadow-xs font-semibold'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  {categoryKey ? categoryT(categoryKey) : t('allCategories')}
                </Link>
              );
            })}
          </div>

          {/* Employment Type Quick Filters */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
            <span className="text-xs font-semibold text-gray-500 mr-1 flex items-center gap-1">
              <Briefcase className="w-3.5 h-3.5" />
              {t('jobTypeLabel')}
            </span>
            {EMPLOYMENT_FILTERS.map((type) => {
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
                  href={`${jobsPath}?${nextQuery.toString()}`}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-gray-900 text-white shadow-xs font-semibold'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                  }`}
                >
                  {t(type ? EMPLOYMENT_LABELS[type] : 'allTypes')}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Results Header */}
        <div className="flex flex-wrap items-center justify-between text-xs text-gray-500 px-1 gap-2">
          <span>
            {t.rich('resultsCount', {
              count: filteredJobs.length.toLocaleString(`${locale}-IN`),
              strong: (count) => <strong className="text-gray-900">{count}</strong>,
            })}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {category && (
              <span className="font-medium text-brand-orange bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                {t('selectedSector', {
                  sector: selectedCategory ? categoryT(selectedCategory) : category.replace('_', ' '),
                })}
              </span>
            )}
            {employmentType && (
              <span className="font-medium text-gray-800 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                {t('selectedType', {
                  type: selectedEmployment.success ? t(EMPLOYMENT_LABELS[selectedEmployment.data]) : employmentType,
                })}
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
              const employment = employmentTypeSchema.safeParse(job.employmentType);
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
                              {t('featuredBadge')}
                            </span>
                          </div>
                        )}
                        <span className="text-xs font-medium text-gray-500 block mb-0.5">
                          {job.companyName}
                        </span>
                        <Link
                          href={`${jobsPath}/${job.id}`}
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
                          {t('monthlySalary', {
                            min: job.salaryMin.toLocaleString(`${locale}-IN`),
                            max: job.salaryMax.toLocaleString(`${locale}-IN`),
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Briefcase className="w-3.5 h-3.5 text-gray-400" />
                        <span>{employment.success ? t(EMPLOYMENT_LABELS[employment.data]) : job.employmentType}</span>
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
                    <Link href={`${jobsPath}/${job.id}`}>
                      <Button variant="primary" size="sm" className="font-semibold">
                        {t('viewAndApply')}
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
            <h3 className="text-lg font-bold text-gray-900">{t('emptyTitle')}</h3>
            <p className="text-xs text-gray-500">
              {t('emptyDescription')}
            </p>
            <Link href={jobsPath}>
              <Button variant="outline" size="sm">
                {t('clearAllFilters')}
              </Button>
            </Link>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
