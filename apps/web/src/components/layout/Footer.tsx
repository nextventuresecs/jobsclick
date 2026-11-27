import React from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { JobsClickLogo } from '@indian-job-portal/ui';

const destinations = [
  ['/jobs', 'findJobs'],
  ['/company', 'companies'],
  ['/institutions', 'institutions'],
  ['/how-it-works', 'howItWorks'],
  ['/privacy', 'privacy'],
] as const;

const categories = [
  'technology', 'manufacturing', 'sales_operations',
  'logistics_supply', 'creative_services', 'healthcare_services',
] as const;

const linkStyle = 'inline-flex min-h-12 min-w-0 items-center rounded-md break-words text-base font-medium text-gray-text underline-offset-4 hover:text-brand-orange-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal';

export const Footer: React.FC = () => {
  const t = useTranslations('Footer');
  const navT = useTranslations('Navigation');
  const catT = useTranslations('Categories');
  const prefix = useLocale() === 'hi' ? '/hi' : '';

  return (
    <footer className="mt-12 border-t border-gray-light bg-white">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
        <JobsClickLogo variant="full" size="sm" />
        <ul className="flex flex-wrap gap-x-6 gap-y-1">
          {destinations.map(([path, key]) => (
            <li key={path}><Link href={prefix + path} className={linkStyle}>{navT(key)}</Link></li>
          ))}
        </ul>
        <details className="border-y border-gray-light py-1">
          <summary className="min-h-12 w-fit cursor-pointer rounded-md py-3 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal">
            {catT('title')}
          </summary>
          <ul className="flex flex-wrap gap-x-6 gap-y-1 px-1 pb-3">
            {categories.map((category) => (
              <li key={category}>
                <Link href={prefix + '/jobs?category=' + category} className={linkStyle}>{catT(category)}</Link>
              </li>
            ))}
          </ul>
        </details>
        <p className="text-base text-gray-text">© {new Date().getFullYear()} {t('copyright')}</p>
      </div>
    </footer>
  );
};
