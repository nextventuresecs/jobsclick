import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import {
  CategoryBadge,
  getCategoryCardBorderClass,
  Button,
} from '@indian-job-portal/ui';
import type { IndustryCategory } from '@indian-job-portal/validation';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { mapApiJobToJobItem, type ApiJobPayload } from '../lib/job-mapper';
import {
  Search,
  MapPin,
  Briefcase,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  GraduationCap,
  Sparkles,
  ChevronRight,
  Clock,
  IndianRupee,
} from 'lucide-react';

interface FeaturedJob {
  readonly id: string;
  readonly title: string;
  readonly companyName: string;
  readonly location: string;
  readonly category: IndustryCategory;
  readonly employmentType: string;
  readonly salaryMin: number;
  readonly salaryMax: number;
  readonly description: string;
  readonly skills: readonly string[];
  readonly postedDate: string;
}



const CATEGORIES_LIST: readonly {
  readonly key: IndustryCategory;
  readonly count: number;
}[] = [
  { key: 'technology', count: 142 },
  { key: 'manufacturing', count: 328 },
  { key: 'sales_operations', count: 215 },
  { key: 'logistics_supply', count: 189 },
  { key: 'creative_services', count: 74 },
  { key: 'healthcare_services', count: 96 },
] as const;

export default async function HomePage() {
  const t = useTranslations('HomePage');
  const catT = useTranslations('Categories');
  const apiUrl = process.env['API_URL'] || 'http://localhost:3001';

  let featuredJobs: FeaturedJob[] = [];
  try {
    const res = await fetch(`${apiUrl}/jobs?limit=4`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 30 },
    });
    if (res.ok) {
      const data = (await res.json()) as { readonly jobs?: readonly ApiJobPayload[] } | null;
      if (data && Array.isArray(data.jobs)) {
        featuredJobs = data.jobs.map((j) => {
          const item = mapApiJobToJobItem(j);
          return {
            id: item.id,
            title: item.title,
            companyName: item.companyName,
            location: item.location,
            category: item.category,
            employmentType: item.employmentType,
            salaryMin: item.salaryMin,
            salaryMax: item.salaryMax,
            description: item.description,
            skills: item.skills,
            postedDate: new Date(item.postedDate).toLocaleDateString(),
          };
        });
      }
    }
  } catch {
    featuredJobs = [];
  }

  const popularKeywords = [
    'CNC Machinist',
    'React Developer',
    'B2B Sales',
    'Warehouse Supervisor',
    'UI/UX Designer',
    'Health Officer',
  ];

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-[#1F2937] flex flex-col font-sans selection:bg-brand-orange selection:text-white">
      <Navbar />

      <main className="flex-1 space-y-16 lg:space-y-24 pb-16">
        {/* 1. HERO SECTION */}
        <section className="relative bg-white border-b border-gray-200 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
              {/* Left Column: Headline & Search */}
              <div className="lg:col-span-7 space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-orange-light border border-orange-200 rounded-full text-xs font-semibold text-brand-orange-hover">
                  <Sparkles className="w-3.5 h-3.5 text-brand-orange" />
                  <span>{t('badge')}</span>
                </div>

                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-tight leading-[1.15] text-balance">
                  {t('heroTitlePrefix')}{' '}
                  <span className="text-brand-orange">{t('heroTitleHighlight')}</span>
                </h1>

                <p className="text-base sm:text-lg text-gray-600 leading-relaxed max-w-xl">
                  {t('heroDescription')}
                </p>

                {/* Central Dual Search Box with native progressive enhancement */}
                <form
                  action="/jobs"
                  method="GET"
                  className="bg-white p-2 sm:p-2.5 rounded-2xl shadow-lg border border-gray-200 flex flex-col sm:flex-row items-stretch gap-2"
                >
                  {/* Keyword */}
                  <div className="flex-1 flex items-center gap-2.5 px-3 py-2 bg-gray-50/80 rounded-xl border border-gray-200/80">
                    <Search className="w-4 h-4 text-gray-400 shrink-0" />
                    <input
                      type="text"
                      name="keyword"
                      placeholder={t('searchKeywordPlaceholder')}
                      className="w-full bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                    />
                  </div>

                  {/* Location */}
                  <div className="sm:w-56 flex items-center gap-2.5 px-3 py-2 bg-gray-50/80 rounded-xl border border-gray-200/80">
                    <MapPin className="w-4 h-4 text-brand-orange shrink-0" />
                    <input
                      type="text"
                      name="city"
                      placeholder={t('searchLocationPlaceholder')}
                      className="w-full bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                    />
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    className="shrink-0"
                  >
                    <span>{t('searchButton')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </form>

                {/* Quick Filter Shortcuts */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 pt-1">
                  <span className="font-medium text-gray-700">{t('popular')}:</span>
                  {popularKeywords.map((term) => (
                    <Link
                      key={term}
                      href={`/jobs?keyword=${encodeURIComponent(term)}`}
                      className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
                    >
                      {term}
                    </Link>
                  ))}
                </div>
              </div>

              {/* Right Column: Hero Visual */}
              <div className="lg:col-span-5 relative">
                <div className="relative rounded-2xl overflow-hidden shadow-xl border border-gray-200 aspect-[16/10] lg:aspect-[4/3] bg-gray-100">
                  <Image
                    src="/images/hero_workforce_india_1792057152670.jpg"
                    alt="Young Indian professionals collaborating in modern skills center"
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover"
                    priority
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-900/60 via-transparent to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4 text-white">
                    <div className="bg-white/95 backdrop-blur-md rounded-xl p-3.5 text-gray-900 shadow-md border border-white/50 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-brand-orange">
                          {t('badge')}
                        </p>
                        <p className="text-xs font-semibold text-gray-800 mt-0.5">
                          500+ verified MSME clusters & technical institutes
                        </p>
                      </div>
                      <Link href="/jobs">
                        <Button variant="primary" size="sm" className="shrink-0 font-bold">
                          Join Free
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. INDUSTRY CATEGORIES GRID */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-8">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-brand-orange">
                {catT('title')}
              </h2>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mt-1">
                {catT('subtitle')}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {catT('description')}
              </p>
            </div>
            <Link
              href="/jobs"
              className="mt-3 md:mt-0 text-sm font-semibold text-brand-orange hover:text-brand-orange-hover inline-flex items-center gap-1"
            >
              <span>{catT('viewAll')}</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {CATEGORIES_LIST.map(({ key, count }) => {
              const borderClass = getCategoryCardBorderClass(key);
              return (
                <Link
                  key={key}
                  href={`/jobs?category=${key}`}
                  className={`bg-white rounded-2xl p-6 border border-gray-200 ${borderClass} hover:shadow-md transition-all text-left group flex flex-col justify-between`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <CategoryBadge category={key} size="md" />
                      <span className="text-xs font-mono font-semibold text-gray-400">
                        {count} {catT('openings')}
                      </span>
                    </div>

                    <h4 className="text-base font-bold text-gray-900 group-hover:text-brand-orange transition-colors">
                      {catT(key)}
                    </h4>
                    <p className="text-xs text-gray-600 leading-relaxed mt-2">
                      {catT(`${key}Desc` as `${IndustryCategory}Desc`)}
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between text-xs font-medium text-gray-500">
                    <span className="truncate">{catT(`${key}Examples` as `${IndustryCategory}Examples`)}</span>
                    <ArrowRight className="w-4 h-4 text-brand-orange group-hover:translate-x-1 transition-transform shrink-0 ml-2" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* 3. FEATURED JOB OPPORTUNITIES (COLORED BORDER IDENTIFIER) */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-brand-orange">
                Verified Listings
              </h2>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mt-1">
                {t('featuredHeading')}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {t('featuredSubheading')}
              </p>
            </div>
            <Link
              href="/jobs"
              className="mt-3 sm:mt-0 text-sm font-semibold text-brand-orange hover:text-brand-orange-hover inline-flex items-center gap-1"
            >
              <span>{t('browseAllJobs')}</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {featuredJobs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {featuredJobs.map((job) => {
              const borderClass = getCategoryCardBorderClass(job.category);
              return (
                <div
                  key={job.id}
                  className={`bg-white rounded-2xl p-6 border border-gray-200 ${borderClass} hover:shadow-md transition-all flex flex-col justify-between`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
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
                      <CategoryBadge category={job.category} />
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

                  {/* Bottom Card Bar */}
                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-xs">
                    <span className="text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{job.postedDate}</span>
                    </span>
                    <Link href={`/jobs/${job.id}`}>
                      <Button variant="primary" size="sm" className="font-semibold">
                        {t('viewDetailsApply')}
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
              <Briefcase className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-gray-900">{t('emptyFeaturedTitle')}</h4>
              <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1 mb-4">
                {t('emptyFeaturedDesc')}
              </p>
              <Link
                href="/jobs"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-brand-orange text-white hover:bg-brand-orange-hover transition-colors"
              >
                <span>{t('browseAllJobs')}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </section>

        {/* 4. MSME SPOTLIGHT */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-xs">
            <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
              {/* Visual Column */}
              <div className="lg:col-span-5 relative bg-gray-900 min-h-[300px]">
                <Image
                  src="/images/msme_enterprise_showcase_1792057153193.jpg"
                  alt="Aarya Precision Engineering workshop"
                  fill
                  sizes="(max-width: 1024px) 100vw, 40vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div className="absolute bottom-5 left-5 right-5 text-white">
                  <span className="inline-block px-2.5 py-0.5 bg-brand-orange text-white text-[11px] font-bold uppercase tracking-wider rounded mb-1">
                    {t('msmeBadge')}
                  </span>
                  <h4 className="text-lg font-bold">Aarya Precision Engineering</h4>
                  <p className="text-xs text-gray-300">Bhosari MIDC Industrial Estate, Pune, Maharashtra</p>
                </div>
              </div>

              {/* Content Column */}
              <div className="lg:col-span-7 p-8 sm:p-10 flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Verified Udyam MSME: UDYAM-MH-26-0019482</span>
                  </div>

                  <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                    {t('msmeTitle')}
                  </h3>

                  <p className="text-sm text-gray-600 leading-relaxed">
                    {t('msmeDescription')}
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2">
                    <div className="border border-gray-200 rounded-xl p-3 bg-gray-50/50">
                      <span className="text-xs text-gray-500 block">{t('privacyFeatureDesc')}</span>
                      <span className="text-sm font-bold text-gray-900">{t('privacyFeature')}</span>
                    </div>
                    <div className="border border-gray-200 rounded-xl p-3 bg-gray-50/50">
                      <span className="text-xs text-gray-500 block">{t('costFeatureDesc')}</span>
                      <span className="text-sm font-bold text-brand-orange">{t('costFeature')}</span>
                    </div>
                    <div className="border border-gray-200 rounded-xl p-3 bg-gray-50/50 col-span-2 sm:col-span-1">
                      <span className="text-xs text-gray-500 block">{t('govFeatureDesc')}</span>
                      <span className="text-sm font-bold text-emerald-700">{t('govFeature')}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-gray-100">
                  <Link href="/company/comp-01">
                    <Button variant="outline" size="sm" className="font-semibold">
                      View Company Profile & Jobs
                    </Button>
                  </Link>
                  <Link href="/jobs">
                    <Button variant="primary" size="sm" className="font-semibold">
                      Register as MSME Employer
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 5. HOW JOBSCLICK WORKS */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-orange">
              Transparent Process
            </h2>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mt-1">
              {t('howItWorksHeading')}
            </h3>
            <p className="text-sm text-gray-600 mt-2">
              {t('howItWorksSubheading')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {[
              {
                num: '01',
                title: t('step1Title'),
                desc: t('step1Desc'),
                icon: <CheckCircle2 className="w-5 h-5 text-brand-orange" />,
              },
              {
                num: '02',
                title: t('step2Title'),
                desc: t('step2Desc'),
                icon: <Briefcase className="w-5 h-5 text-brand-orange" />,
              },
              {
                num: '03',
                title: t('step3Title'),
                desc: t('step3Desc'),
                icon: <ShieldCheck className="w-5 h-5 text-emerald-600" />,
              },
            ].map((item, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-7 border border-gray-200 relative flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <span className="text-2xl font-extrabold text-brand-orange/20 font-mono">
                      {item.num}
                    </span>
                    <div className="p-2.5 bg-brand-orange-light rounded-xl border border-orange-100">
                      {item.icon}
                    </div>
                  </div>
                  <h4 className="text-lg font-bold text-gray-900 mb-2">{item.title}</h4>
                  <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 6. INSTITUTION & PLACEMENT CELL SECTION */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-br from-teal-900 via-slate-900 to-gray-900 rounded-3xl text-white p-8 sm:p-12">
            <div className="max-w-3xl space-y-5">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-xs font-semibold text-teal-300">
                <GraduationCap className="w-4 h-4" />
                <span>{t('institutionBadge')}</span>
              </div>
              <h3 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
                {t('institutionTitle')}
              </h3>
              <p className="text-sm sm:text-base text-gray-300 leading-relaxed">
                {t('institutionDescription')}
              </p>
              <div className="flex flex-wrap gap-3 pt-3">
                <Link href="/workspace">
                  <Button variant="outline" size="sm" className="font-bold text-gray-900 bg-white hover:bg-gray-100">
                    {t('institutionLearnMore')}
                  </Button>
                </Link>
                <Link href="/workspace">
                  <Button variant="primary" size="sm" className="font-bold">
                    {t('institutionLogin')}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
