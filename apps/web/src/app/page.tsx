import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@indian-job-portal/ui';
import { ClipboardCheck, GraduationCap, Search, ShieldCheck, UserRound } from 'lucide-react';
import { HireWorkersAction, MobileJobsAction } from '../components/home-marketing-actions';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { mapApiJobToJobItem, type ApiJobPayload } from '../lib/job-mapper';

const steps = [
  { label: 'stepBrowse', Icon: Search },
  { label: 'stepApply', Icon: UserRound },
  { label: 'stepTrack', Icon: ClipboardCheck },
] as const;

const questions = [
  { title: 'faqPrivacy', answer: 'faqPrivacyAnswer' },
  { title: 'faqNext', answer: 'faqNextAnswer' },
] as const;

const container = 'mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8';
const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-charcoal';
const action = 'inline-flex min-h-12 min-w-12 items-center gap-2 rounded-md font-semibold text-brand-orange-hover underline-offset-4 hover:underline active:bg-brand-orange-light ' + focus;
const roleAction = 'inline-flex min-h-14 w-full items-center gap-3 rounded-xl border border-gray-muted bg-white p-4 text-left font-semibold text-charcoal hover:bg-brand-orange-light active:bg-brand-orange-light ' + focus;
const input = 'min-h-12 w-full rounded-lg border border-gray-muted bg-white px-3 py-2 text-base text-charcoal placeholder:text-gray-text ' + focus;

async function getRecentJobs() {
  const apiUrl = process.env['API_URL'] || 'http://localhost:3001';

  try {
    const response = await fetch(apiUrl + '/jobs?limit=4', {
      headers: { Accept: 'application/json' },
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { readonly jobs?: readonly ApiJobPayload[] } | null;
    if (!Array.isArray(data?.jobs)) return null;

    return data.jobs.slice(0, 4).flatMap((job) => {
      if (!job?.title) return [];
      const item = mapApiJobToJobItem(job);
      if (!item.id) return [];

      return [{
        id: item.id,
        title: item.title,
        companyName: job.companyName,
        city: job.city,
        district: job.district,
        salaryMin: item.salaryMin,
        salaryMax: item.salaryMax,
      }];
    });
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('HomePage')]);

  return {
    title: t('seoTitle'),
    description: t('intro'),
    alternates: {
      canonical: locale === 'hi' ? '/hi' : '/',
      languages: { en: '/', hi: '/hi', 'x-default': '/' },
    },
  };
}

export default async function HomePage() {
  const [locale, t, jobsT, jobs] = await Promise.all([
    getLocale(),
    getTranslations('HomePage'),
    getTranslations('JobsPage'),
    getRecentJobs(),
  ]);
  const localePrefix = locale === 'hi' ? '/hi' : '';
  const jobsPath = localePrefix + '/jobs';
  const numberFormat = new Intl.NumberFormat(locale + '-IN');

  return (
    <div className="flex min-h-screen flex-col bg-gray-soft text-charcoal">
      <a
        href="#home-main"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:min-h-12 focus-visible:rounded-md focus-visible:bg-white focus-visible:px-4 focus-visible:py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-charcoal"
      >
        {t('skipLink')}
      </a>
      <Navbar />

      <main id="home-main" tabIndex={-1} className="flex-1 scroll-mt-20 outline-none">
        <section className="border-b border-gray-light bg-white">
          <div className={container + ' space-y-6 py-10 sm:py-16 lg:py-20'}>
            <h1 className="max-w-4xl min-w-0 break-words text-balance text-3xl font-bold leading-tight text-charcoal-dark sm:text-5xl lg:text-6xl">
              {t('heroTitlePrefix')}{' '}{t('heroTitleHighlight')}
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-gray-text">{t('intro')}</p>

            <form
              id="home-job-search"
              action={jobsPath}
              method="GET"
              className="grid max-w-4xl items-end gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <div className="min-w-0 space-y-2">
                <label htmlFor="home-search-keyword" className="block font-semibold">{t('keywordLabel')}</label>
                <input
                  id="home-search-keyword"
                  name="keyword"
                  type="search"
                  enterKeyHint="search"
                  placeholder={t('searchKeywordPlaceholder')}
                  className={input}
                />
              </div>
              <div className="min-w-0 space-y-2">
                <label htmlFor="home-search-city" className="block font-semibold">{t('cityLabel')}</label>
                <input
                  id="home-search-city"
                  name="city"
                  type="text"
                  enterKeyHint="search"
                  placeholder={t('searchLocationPlaceholder')}
                  className={input}
                />
              </div>
              <Button type="submit" variant="primary" size="md" className="w-full sm:w-auto">
                <Search aria-hidden="true" className="h-5 w-5 shrink-0" />
                {t('searchButton')}
              </Button>
            </form>
          </div>
        </section>

        <section aria-labelledby="home-role-heading" className={container + ' space-y-4 py-8 sm:py-10'}>
          <h2 id="home-role-heading" className="text-2xl font-bold text-charcoal-dark">{t('chooseRole')}</h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            <li>
              <Link href={jobsPath} className={roleAction}>
                <Search aria-hidden="true" className="h-6 w-6 shrink-0 text-brand-orange" />
                {t('findWork')}
              </Link>
            </li>
            <li><HireWorkersAction label={t('hireWorkers')} workspacePath={localePrefix + '/workspace'} /></li>
            <li>
              <Link href={localePrefix + '/institutions'} className={roleAction}>
                <GraduationCap aria-hidden="true" className="h-6 w-6 shrink-0 text-brand-orange" />
                {t('college')}
              </Link>
            </li>
          </ul>
        </section>

        <section aria-labelledby="home-steps-heading" className="border-y border-gray-light bg-white">
          <div className={container + ' space-y-5 py-8 sm:py-10'}>
            <h2 id="home-steps-heading" className="text-2xl font-bold text-charcoal-dark">{t('howItWorksHeading')}</h2>
            <ol className="grid gap-5 sm:grid-cols-3">
              {steps.map(({ label, Icon }) => (
                <li key={label} className="flex items-start gap-3 text-base leading-relaxed text-gray-text">
                  <Icon aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-brand-orange" />
                  <span>{t(label)}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="home-recent-jobs" className={container + ' space-y-5 py-8 sm:py-12'}>
          <div className="flex flex-wrap items-center justify-between gap-x-6">
            <h2 id="home-recent-jobs" className="text-2xl font-bold text-charcoal-dark">{t('recentJobs')}</h2>
            <Link href={jobsPath} className={action}>{t('browseAllJobs')}</Link>
          </div>
          {jobs?.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {jobs.map((job) => (
                <li key={job.id}>
                  <Link
                    href={jobsPath + '/' + encodeURIComponent(job.id)}
                    className={'block h-full rounded-xl border border-gray-muted bg-white p-4 hover:bg-gray-surface active:bg-brand-orange-light ' + focus}
                  >
                    <h3 className="break-words text-lg font-bold leading-snug text-charcoal-dark">{job.title}</h3>
                    {job.companyName && <p className="mt-1 text-gray-text">{job.companyName}</p>}
                    {(job.city || job.district) && <p className="mt-1 text-gray-text">{job.city || job.district}</p>}
                    {job.salaryMin > 0 && job.salaryMax >= job.salaryMin && (
                      <p className="mt-2 font-semibold">
                        {jobsT('monthlySalary', { min: numberFormat.format(job.salaryMin), max: numberFormat.format(job.salaryMax) })}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-base leading-relaxed text-gray-text">
              {t(jobs === null ? 'recentJobsUnavailable' : 'noRecentJobs')}
            </p>
          )}
        </section>

        <section aria-labelledby="home-safety-heading" className="border-y border-gray-light bg-brand-orange-light">
          <div className={container + ' flex flex-wrap items-center justify-between gap-3 py-6'}>
            <div className="flex items-start gap-3">
              <ShieldCheck aria-hidden="true" className="mt-1 h-6 w-6 shrink-0 text-brand-orange" />
              <div>
                <h2 id="home-safety-heading" className="text-xl font-bold text-charcoal-dark">{t('safetyHeading')}</h2>
                <p className="mt-1 leading-relaxed">{t('noPay')}</p>
              </div>
            </div>
            <Link href={localePrefix + '/company'} className={action}>{t('browseEmployers')}</Link>
          </div>
        </section>

        <section aria-labelledby="home-faq-heading" className={container + ' space-y-4 py-8 sm:py-12'}>
          <h2 id="home-faq-heading" className="text-2xl font-bold text-charcoal-dark">{t('faqHeading')}</h2>
          <div className="max-w-3xl divide-y divide-gray-light rounded-xl border border-gray-muted bg-white">
            {questions.map(({ title, answer }) => (
              <details key={title}>
                <summary className={'min-h-12 cursor-pointer px-4 py-3 font-semibold active:bg-brand-orange-light ' + focus}>{t(title)}</summary>
                <p className="px-4 pb-4 leading-relaxed text-gray-text">{t(answer)}</p>
              </details>
            ))}
          </div>
          <Link href={localePrefix + '/how-it-works'} className={action}>
            {t('helpLink')}
          </Link>
          <Link href={localePrefix + '/workspace'} className={action + ' ml-4'}>{t('institutionLogin')}</Link>
        </section>
      </main>

      <div id="home-footer"><Footer /></div>
      <MobileJobsAction href={jobsPath} label={t('findWork')} />
    </div>
  );
}
