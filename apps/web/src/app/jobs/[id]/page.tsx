import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, MapPin, Share2, ShieldCheck } from 'lucide-react';
import { isIndustryCategory, isUuid, type EmploymentType, type ExperienceLevel } from '@indian-job-portal/validation';
import { Navbar } from '../../../components/layout/Navbar';
import { Footer } from '../../../components/layout/Footer';
import type { JobItem } from '../../../data/sampleJobs';
import { mapApiJobToJobItem, type ApiJobPayload } from '../../../lib/job-mapper';
import { safeJsonLd } from '../../../lib/safe-json-ld';
import { JobApplyButton } from '../../../components/jobs/JobApplyButton';

export const revalidate = 30;

interface JobDetailPageProps {
  readonly params: { readonly id: string } | Promise<{ readonly id: string }>;
}

interface JobDetailPayload extends ApiJobPayload {
  readonly isActive?: boolean;
}

const employmentLabels = {
  'Full-time': 'fullTime',
  'Part-time': 'partTime',
  Contract: 'contract',
  Apprenticeship: 'apprenticeship',
  'Shift-based': 'shiftBased',
} as const satisfies Record<EmploymentType, string>;

const experienceLabels = {
  Fresher: 'fresher',
  '1-2 Years': 'oneToTwoYears',
  '3-5 Years': 'threeToFiveYears',
  '5+ Years': 'fivePlusYears',
} as const satisfies Record<ExperienceLevel, string>;

const linkStyle =
  'inline-flex min-h-12 items-center gap-2 rounded-md px-2 text-base font-medium text-brand-orange underline underline-offset-4 hover:text-brand-orange-hover active:text-brand-orange-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal';

function JobDetailUnavailable({ slug }: { readonly slug: string }) {
  const t = useTranslations('JobDetail');
  const prefix = useLocale() === 'hi' ? '/hi' : '';

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="min-w-0 break-words text-2xl font-bold text-charcoal">{t('unavailableTitle')}</h1>
        <p className="mt-3 text-gray-text">{t('unavailableBody')}</p>
        <a className={linkStyle} href={`${prefix}/jobs/${encodeURIComponent(slug)}`}>
          {t('retry')}
        </a>
      </main>
      <Footer />
    </>
  );
}

function JobDetailContent({
  job,
  slug,
  active,
  companyName,
  companySlug,
  canonicalUrl,
  jsonLd,
  openings,
}: {
  readonly job: JobItem;
  readonly slug: string;
  readonly active: boolean;
  readonly companyName?: string;
  readonly companySlug?: string;
  readonly canonicalUrl: string;
  readonly jsonLd: string;
  readonly openings?: number;
}) {
  const locale = useLocale();
  const t = useTranslations('JobDetail');
  const jobsT = useTranslations('JobsPage');
  const categoriesT = useTranslations('Categories');
  const prefix = locale === 'hi' ? '/hi' : '';
  const number = new Intl.NumberFormat(`${locale}-IN`);
  const pay = new Intl.NumberFormat(`${locale}-IN`, {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });
  const salary = job.salaryMin > 0 && job.salaryMax > job.salaryMin
    ? `${pay.format(job.salaryMin)} – ${pay.format(job.salaryMax)}`
    : job.salaryMin > 0 || job.salaryMax > 0
      ? pay.format(job.salaryMin || job.salaryMax)
      : t('payUnlisted');
  const workLocation = [...new Set([job.location, job.district, job.state].filter(Boolean))].join(', ');
  const companyPath = companySlug ? `${prefix}/company/${encodeURIComponent(companySlug)}` : undefined;
  const shareUrl = new URL(canonicalUrl);
  shareUrl.pathname = prefix + shareUrl.pathname;
  const companyLabel = companyName || t('employer');
  const employmentLabel = employmentLabels[job.employmentType];
  const experienceLabel = experienceLabels[job.experienceLevel];

  return (
    <div className="flex min-h-screen flex-col bg-gray-soft pb-[calc(6rem+env(safe-area-inset-bottom))] text-charcoal lg:pb-0">
      <Navbar />
      {active && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />}

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 sm:px-6 sm:py-8">
        <Link href={prefix + '/jobs'} className={linkStyle}>
          <ArrowLeft className="size-5" aria-hidden="true" />
          {t('back')}
        </Link>

        <div className="mt-2 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <article className="min-w-0 space-y-7 rounded-xl border border-gray-light bg-white p-5 sm:p-8">
            <header className="space-y-3">
              <h1 className="min-w-0 break-words text-3xl font-bold text-charcoal sm:text-4xl">{job.title}</h1>
              {companyPath ? (
                <Link href={companyPath} className={linkStyle}>{companyLabel}</Link>
              ) : (
                <p className="break-words text-lg font-medium">{companyLabel}</p>
              )}
              {isIndustryCategory(job.category) && (
                <p className="text-gray-text">{categoriesT(job.category)}</p>
              )}
            </header>

            <dl className="grid gap-x-6 gap-y-4 border-y border-gray-light py-5 sm:grid-cols-2">
              <div>
                <dt className="font-medium text-gray-text">{t('pay')}</dt>
                <dd className="mt-1 text-lg font-bold">{salary}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-text">{t('place')}</dt>
                <dd className="mt-1 flex items-start gap-2 break-words font-semibold">
                  <MapPin className="mt-0.5 size-5 shrink-0 text-brand-orange" aria-hidden="true" />
                  {workLocation}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-gray-text">{t('timing')}</dt>
                <dd className="mt-1 font-semibold">
                  {employmentLabel ? jobsT(employmentLabel) : job.employmentType}
                </dd>
              </div>
              {openings !== undefined && (
                <div>
                  <dt className="font-medium text-gray-text">{t('openings')}</dt>
                  <dd className="mt-1 font-semibold">{number.format(openings)}</dd>
                </div>
              )}
            </dl>

            {job.description && (
              <section aria-labelledby="job-description" className="space-y-2">
                <h2 id="job-description" className="min-w-0 break-words text-xl font-bold">{t('description')}</h2>
                {job.description.length > 240 ? (
                  <details>
                    <summary className="min-h-12 cursor-pointer rounded-md py-3 font-medium text-brand-orange underline underline-offset-4 hover:text-brand-orange-hover active:text-brand-orange-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal">
                      {t('readMore')}
                    </summary>
                    <p className="whitespace-pre-line break-words text-gray-text">{job.description}</p>
                  </details>
                ) : (
                  <p className="whitespace-pre-line break-words text-gray-text">{job.description}</p>
                )}
              </section>
            )}

            <section aria-labelledby="job-requirements" className="space-y-3">
              <h2 id="job-requirements" className="min-w-0 break-words text-xl font-bold">{t('requirements')}</h2>
              <dl>
                <dt className="font-medium text-gray-text">{t('experience')}</dt>
                <dd>{experienceLabel ? t(experienceLabel) : job.experienceLevel}</dd>
              </dl>
              {job.requirements.length > 0 && (
                <ul className="list-disc space-y-1 ps-6 text-gray-text">
                  {job.requirements.map((requirement, index) => <li key={index} className="break-words">{requirement}</li>)}
                </ul>
              )}
              {job.skills.length > 0 && (
                <div className="space-y-2">
                  <h3 className="min-w-0 break-words font-semibold">{t('skills')}</h3>
                  <ul className="flex flex-wrap gap-2">
                    {job.skills.map((skill, index) => (
                      <li key={index} className="min-w-0 break-words rounded-md bg-gray-soft px-3 py-1 text-gray-text">{skill}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {(companyName || companyPath) && (
              <section aria-labelledby="job-company" className="space-y-2 border-t border-gray-light pt-5">
                <h2 id="job-company" className="min-w-0 break-words text-xl font-bold">{t('company')}</h2>
                {companyName && <p className="break-words text-gray-text">{companyName}</p>}
                {companyPath && <Link href={companyPath} className={linkStyle}>{t('companyLink')}</Link>}
              </section>
            )}

            <section aria-labelledby="job-privacy" className="flex gap-3 border-t border-gray-light pt-5">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
              <div className="space-y-1">
                <h2 id="job-privacy" className="min-w-0 break-words text-lg font-bold">{t('privacyTitle')}</h2>
                <p className="text-gray-text">{t('privacyBody')}</p>
              </div>
            </section>

            <a href={`https://wa.me/?text=${encodeURIComponent(shareUrl.toString())}`} className={linkStyle}>
              <Share2 className="size-5" aria-hidden="true" />
              {t('share')}
            </a>
          </article>

          <section
            id="apply"
            tabIndex={-1}
            aria-label={t('apply')}
            className="fixed inset-x-0 bottom-0 z-20 scroll-mt-24 border-t border-gray-light bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal lg:sticky lg:inset-x-auto lg:bottom-auto lg:top-24 lg:rounded-xl lg:border lg:p-4"
          >
            {active ? (
              <JobApplyButton
                jobId={slug}
                jobTitle={job.title}
                companyName={companyLabel}
                companyId={companySlug || ''}
                size="md"
                className="w-full justify-center active:bg-brand-orange-hover"
                label={t('apply')}
              />
            ) : (
              <p className="text-center font-medium text-gray-text">{t('closed')}</p>
            )}
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { id: jobSlug } = await params;
  // ID-02: Public routes never redirect legacy internal IDs to public records.
  if (isUuid(jobSlug)) notFound();
  const apiUrl = process.env['API_URL'] || 'http://localhost:3001';
  let response: Response;
  let data: JobDetailPayload | null;
  try {
    response = await fetch(`${apiUrl}/jobs/${encodeURIComponent(jobSlug)}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 30 },
    });
    data = response.ok ? (await response.json()) as JobDetailPayload | null : null;
  } catch {
    return <JobDetailUnavailable slug={jobSlug} />;
  }
  if (response.status === 404) notFound();
  if (!response.ok || !data || (!data.slug && !data.id)) {
    return <JobDetailUnavailable slug={jobSlug} />;
  }

  const job = mapApiJobToJobItem(data);
  const publicSlug = data.slug && !isUuid(data.slug) ? data.slug : jobSlug;
  const companySlug = data.companySlug && !isUuid(data.companySlug) ? data.companySlug : undefined;
  let companyName = data.companyName;
  if (!companyName && companySlug) {
    try {
      const companyResponse = await fetch(`${apiUrl}/profiles/business/${encodeURIComponent(companySlug)}`, {
        headers: { Accept: 'application/json' },
        next: { revalidate: 30 },
        signal: AbortSignal.timeout(1500),
      });
      if (companyResponse.ok) {
        const company = (await companyResponse.json()) as { readonly companyName?: unknown } | null;
        if (typeof company?.companyName === 'string') companyName = company.companyName;
      }
    } catch {
      // A failed company lookup leaves the public company link available.
    }
  }
  const baseUrl = process.env['WEB_URL'] || process.env['NEXT_PUBLIC_APP_URL'] || 'http://localhost:3000';
  const canonicalUrl = new URL(`/jobs/${encodeURIComponent(publicSlug)}`, baseUrl).toString();
  const organization = {
    '@type': 'Organization',
    ...(companyName && { name: companyName }),
    ...(companySlug && { sameAs: new URL(`/company/${encodeURIComponent(companySlug)}`, baseUrl).toString() }),
  };
  const jsonLd = safeJsonLd({
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description,
    url: canonicalUrl,
    identifier: {
      '@type': 'PropertyValue',
      ...(companyName && { name: companyName }),
      value: publicSlug,
    },
    ...(data.createdAt && { datePosted: job.postedDate }),
    ...(data.expiryDate && { validThrough: job.expiryDate }),
    employmentType: job.employmentType.toUpperCase().replace('-', '_'),
    directApply: true,
    hiringOrganization: organization,
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job.location,
        addressRegion: job.district,
        addressCountry: 'IN',
      },
    },
    applicantLocationRequirements: {
      '@type': 'Country',
      name: 'IN',
    },
    ...(job.salaryMin > 0 || job.salaryMax > 0 ? {
      baseSalary: {
        '@type': 'MonetaryAmount',
        currency: 'INR',
        value: {
          '@type': 'QuantitativeValue',
          ...(job.salaryMin > 0 && { minValue: job.salaryMin }),
          ...(job.salaryMax > 0 && { maxValue: job.salaryMax }),
          unitText: 'MONTH',
        },
      },
    } : {}),
  });

  return (
    <JobDetailContent
      job={job}
      slug={publicSlug}
      active={data.isActive !== false}
      companyName={companyName}
      companySlug={companySlug}
      canonicalUrl={canonicalUrl}
      jsonLd={jsonLd}
      openings={data.openings}
    />
  );
}
