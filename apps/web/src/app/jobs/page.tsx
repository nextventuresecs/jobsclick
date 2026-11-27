import React from 'react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button, getCategoryCardBorderClass } from '@indian-job-portal/ui';
import { employmentTypeSchema, type EmploymentType } from '@indian-job-portal/validation';
import { Briefcase, Clock, MapPin, Search, SlidersHorizontal } from 'lucide-react';
import { Navbar } from '../../components/layout/Navbar';
import { Footer } from '../../components/layout/Footer';
import { SaveSearchAlertModal } from '../../components/jobs/SaveSearchAlertModal';
import type { JobItem } from '../../data/sampleJobs';
import { mapApiJobToJobItem, type ApiJobPayload } from '../../lib/job-mapper';

export const revalidate = 30;

interface JobsPageProps {
  readonly searchParams?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
}

const CATEGORIES = [
  'technology', 'manufacturing', 'sales_operations',
  'logistics_supply', 'creative_services', 'healthcare_services',
] as const;
const EMPLOYMENT_LABELS = {
  'Full-time': 'fullTime',
  'Part-time': 'partTime',
  Apprenticeship: 'apprenticeship',
  Contract: 'contract',
  'Shift-based': 'shiftBased',
} as const satisfies Record<EmploymentType, string>;
const MIN_PAY_CHOICES = [10000, 20000, 35000];
const PAGE_SIZE = 20;
const focusClass = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal';
const fieldClass = 'min-h-12 w-full min-w-0 rounded-lg border border-gray-muted bg-white px-3 text-base text-charcoal ' + focusClass;

function param(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

export default async function JobsListPage({ searchParams }: JobsPageProps) {
  const [resolvedSearchParams, locale, t, categoryT] = await Promise.all([
    searchParams ? Promise.resolve(searchParams) : Promise.resolve(undefined),
    getLocale(),
    getTranslations('JobsPage'),
    getTranslations('Categories'),
  ]);
  const jobsPath = locale === 'hi' ? '/hi/jobs' : '/jobs';
  const number = new Intl.NumberFormat(locale + '-IN');
  const date = new Intl.DateTimeFormat(locale + '-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' });
  const keyword = param(resolvedSearchParams?.keyword);
  const city = param(resolvedSearchParams?.city);
  const category = CATEGORIES.find((key) => key === param(resolvedSearchParams?.category)) ?? '';
  const type = employmentTypeSchema.safeParse(param(resolvedSearchParams?.employmentType));
  const employmentType = type.success ? type.data : '';
  const rawPay = Number(param(resolvedSearchParams?.minPay));
  const minPay = Number.isFinite(rawPay) && rawPay > 0 ? rawPay : 0;
  const page = Number(param(resolvedSearchParams?.page));
  const pageNumber = Number.isSafeInteger(page) && page > 1 && page <= 10000 ? page : 1;
  const offset = (pageNumber - 1) * PAGE_SIZE;
  const filters = { keyword, city, category, employmentType, minPay: minPay ? String(minPay) : '' };
  const active = Object.values(filters).some(Boolean);
  const href = (values: Record<string, string | number>) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (value) query.set(key, String(value));
    }
    const qs = query.toString();
    return qs ? jobsPath + '?' + qs : jobsPath;
  };

  let jobs: JobItem[] | null = null;
  let total: number | undefined;
  try {
    const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (keyword) query.set('keyword', keyword);
    if (city) query.set('city', city);
    if (category) query.set('category', category);
    if (employmentType) query.set('employmentType', employmentType);
    if (minPay) query.set('minPay', String(minPay));
    const apiUrl = process.env['API_URL'] || 'http://localhost:3001';
    const response = await fetch(apiUrl + '/jobs?' + query, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 30 },
    });
    if (response.ok) {
      const data = (await response.json()) as { jobs?: ApiJobPayload[]; total?: number } | null;
      if (Array.isArray(data?.jobs)) {
        // JOB-05 (ENABLE_P2_FEATURED_PROMOTIONS) is P2-gated off by default; when enabled, promoted-first ordering is handled server-side.
        jobs = data.jobs
          .filter((job) => typeof job?.slug === 'string' && job.slug.length > 0)
          .map((job) => mapApiJobToJobItem(job, t('employer')));
        if (typeof data.total === 'number' && Number.isSafeInteger(data.total) && data.total >= 0) {
          total = data.total;
        }
      }
    }
  } catch {
    jobs = null;
  }

  const activeFilters = [
    { key: 'keyword', label: keyword },
    { key: 'city', label: city },
    { key: 'category', label: category ? categoryT(category) : '' },
    { key: 'employmentType', label: employmentType ? t('selectedType', { type: t(EMPLOYMENT_LABELS[employmentType]) }) : '' },
    { key: 'minPay', label: minPay ? t('payFrom', { min: number.format(minPay) }) : '' },
  ];
  const count = jobs?.length ?? 0;

  return (
    <div className="min-h-screen bg-gray-soft text-charcoal flex flex-col">
      <Navbar />
      <a href="#job-results" className={'sr-only focus:not-sr-only focus:inline-flex focus:min-h-12 focus:items-center focus:bg-white focus:px-4 ' + focusClass}>
        {t('skipToResults')}
      </a>
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-7 sm:px-6 sm:py-10">
        <header className="max-w-2xl">
          <h1 className="break-words text-3xl font-bold leading-tight sm:text-4xl">{t('heading')}</h1>
          <p className="mt-3 text-base leading-relaxed text-gray-text">{t('subheading')}</p>
        </header>

        <form action={jobsPath} method="GET" className="space-y-4 rounded-xl border border-gray-light bg-white p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
            <div>
              <label htmlFor="jobs-keyword" className="mb-2 block font-semibold">{t('keywordLabel')}</label>
              <input id="jobs-keyword" type="search" name="keyword" defaultValue={keyword} placeholder={t('searchPlaceholder')} enterKeyHint="search" className={fieldClass} />
            </div>
            <div>
              <label htmlFor="jobs-city" className="mb-2 block font-semibold">{t('cityLabel')}</label>
              <input id="jobs-city" name="city" defaultValue={city} placeholder={t('cityPlaceholder')} enterKeyHint="search" className={fieldClass} />
            </div>
            <Button type="submit" className="w-full sm:w-auto"><Search aria-hidden="true" className="mr-2 h-5 w-5" />{t('searchJobs')}</Button>
          </div>
          <details open={Boolean(category || employmentType || minPay)} className="border-t border-gray-light pt-2">
            <summary className={'inline-flex min-h-12 cursor-pointer items-center gap-2 rounded px-2 font-semibold ' + focusClass}>
              <SlidersHorizontal aria-hidden="true" className="h-5 w-5" />{t('filterLabel')}
            </summary>
            <div className="mt-2 grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="jobs-category" className="mb-2 block font-semibold">{t('sectorsLabel')}</label>
                <select id="jobs-category" name="category" defaultValue={category} className={fieldClass}>
                  <option value="">{t('allCategories')}</option>
                  {CATEGORIES.map((key) => <option key={key} value={key}>{categoryT(key)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="jobs-type" className="mb-2 block font-semibold">{t('jobTypeLabel')}</label>
                <select id="jobs-type" name="employmentType" defaultValue={employmentType} className={fieldClass}>
                  <option value="">{t('allTypes')}</option>
                  {Object.entries(EMPLOYMENT_LABELS).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="jobs-pay" className="mb-2 block font-semibold">{t('minimumPay')}</label>
                <select id="jobs-pay" name="minPay" defaultValue={filters.minPay} className={fieldClass}>
                  <option value="">{t('anyPay')}</option>
                  {minPay > 0 && !MIN_PAY_CHOICES.includes(minPay) && <option value={minPay}>{t('payFrom', { min: number.format(minPay) })}</option>}
                  {MIN_PAY_CHOICES.map((value) => <option key={value} value={value}>{t('payFrom', { min: number.format(value) })}</option>)}
                </select>
              </div>
            </div>
            <Button type="submit" variant="outline" className="mt-4">{t('applyFilters')}</Button>
          </details>
        </form>

        <section aria-labelledby="job-results" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="job-results" tabIndex={-1} className="text-xl font-bold">{t('resultsTitle')}</h2>
              <p role="status" className="text-base text-gray-text">
                {jobs === null ? null : total === undefined || !count
                  ? t.rich('resultsCount', { count: number.format(count), strong: (value) => <strong>{value}</strong> })
                  : t('pageCount', { start: number.format(offset + 1), end: number.format(offset + count), total: number.format(total) })}
              </p>
            </div>
            <SaveSearchAlertModal currentKeyword={keyword} currentCity={city} currentCategory={category} />
          </div>
          {active && (
            <ul aria-label={t('activeFilters')} className="flex flex-wrap gap-2">
              {activeFilters.filter(({ label }) => label).map(({ key, label }) => (
                <li key={key} className="min-w-0 max-w-full">
                  <Link href={href({ ...filters, [key]: '' })} className={'inline-flex min-h-12 max-w-full items-center break-words rounded-full border border-gray-light bg-white px-4 text-base ' + focusClass}>
                    {t('removeFilter', { filter: label })}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {jobs === null ? (
            <div className="rounded-xl border border-gray-light bg-white p-6">
              <h3 className="text-lg font-semibold">{t('searchUnavailable')}</h3>
              <p className="mt-2 text-base text-gray-text">{t('searchUnavailableHelp')}</p>
              <form action={jobsPath} method="GET">
                {Object.entries(filters).filter(([, value]) => value).map(([name, value]) => (
                  <input key={name} type="hidden" name={name} value={value} />
                ))}
                {pageNumber > 1 && <input type="hidden" name="page" value={pageNumber} />}
                <Button type="submit" variant="outline" className="mt-4">{t('retrySearch')}</Button>
              </form>
            </div>
          ) : count > 0 ? (
            <ul className="grid gap-4 md:grid-cols-2">
              {jobs.map((job) => {
                const detailPath = jobsPath + '/' + encodeURIComponent(job.id);
                const categoryKey = CATEGORIES.find((key) => key === job.category);
                const posted = new Date(job.postedDate);
                return (
                  <li key={job.id} className={'relative min-w-0 rounded-xl border border-gray-light bg-white p-5 ' + getCategoryCardBorderClass(job.category)}>
                    <h3 className="break-words text-xl font-bold">
                      <Link href={detailPath} className={'rounded after:absolute after:inset-0 after:rounded-xl hover:text-brand-orange ' + focusClass}>{job.title}</Link>
                    </h3>
                    <p className="mt-1 break-words text-base text-gray-text">{job.companyName}</p>
                    <p className="mt-4 text-base font-semibold">
                      {job.salaryMin > 0 && job.salaryMax > 0
                        ? t('monthlySalary', { min: number.format(job.salaryMin), max: number.format(job.salaryMax) })
                        : t('payUnlisted')}
                    </p>
                    <p className="mt-2 flex items-start gap-2 break-words text-base text-gray-text">
                      <MapPin aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
                      <span>{job.district || job.location}</span>
                      {categoryKey && <span className="inline-flex min-w-0 items-start gap-1"><Briefcase aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{categoryT(categoryKey)}</span>}
                    </p>
                    {Number.isFinite(posted.valueOf()) && (
                      <p className="mt-2 flex items-center gap-2 text-base text-gray-text">
                        <Clock aria-hidden="true" className="h-5 w-5 shrink-0" />
                        <time dateTime={job.postedDate}>{date.format(posted)}</time>
                      </p>
                    )}
                    <Link href={detailPath + '#apply'} aria-label={t('applyToJob', { job: job.title })} className={'relative z-10 mt-4 inline-flex min-h-12 items-center rounded-lg bg-brand-orange px-4 font-semibold text-white hover:bg-brand-orange-hover ' + focusClass}>
                      {t('applyLink')}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-xl border border-gray-light bg-white p-6">
              <h3 className="text-lg font-semibold">{t('emptyTitle')}</h3>
              <p className="mt-2 text-base text-gray-text">{t('emptyDescription')}</p>
              {active && (
                <Link href={jobsPath} className={'mt-4 inline-flex min-h-12 items-center rounded-lg border border-gray-muted px-4 font-semibold ' + focusClass}>
                  {t('clearAllFilters')}
                </Link>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            {pageNumber > 1 && (
              <Link rel="prev" href={href({ ...filters, page: pageNumber > 2 ? pageNumber - 1 : '' })} className={'inline-flex min-h-12 items-center rounded-lg border border-gray-muted bg-white px-4 font-semibold ' + focusClass}>
                {t('previousJobs')}
              </Link>
            )}
            {total !== undefined && offset + count < total && count > 0 && pageNumber < 10000 && (
              <Link rel="next" href={href({ ...filters, page: pageNumber + 1 })} className={'inline-flex min-h-12 items-center rounded-lg border border-gray-muted bg-white px-4 font-semibold ' + focusClass}>
                {t('nextJobs')}
              </Link>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
