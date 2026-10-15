import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { JobsClickLogo } from '@indian-job-portal/ui';
import { ShieldCheck, MapPin, PhoneCall } from 'lucide-react';

export const Footer: React.FC = () => {
  const t = useTranslations('Footer');
  const catT = useTranslations('Categories');

  const categories = [
    { key: 'technology', label: catT('technology') },
    { key: 'manufacturing', label: catT('manufacturing') },
    { key: 'sales_operations', label: catT('sales_operations') },
    { key: 'logistics_supply', label: catT('logistics_supply') },
    { key: 'creative_services', label: catT('creative_services') },
    { key: 'healthcare_services', label: catT('healthcare_services') },
  ];

  return (
    <footer className="bg-white border-t border-gray-200 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Brand & Mission */}
          <div className="lg:col-span-2 space-y-4">
            <JobsClickLogo variant="full" size="md" showTagline />
            <p className="text-sm text-gray-600 max-w-sm leading-relaxed">
              {t('tagline')}
            </p>
            <div className="flex items-center gap-2 text-xs text-gray-500 pt-2">
              <MapPin className="w-4 h-4 text-brand-orange shrink-0" />
              <span>{t('coverage')}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{t('privacyPromise')}</span>
            </div>
          </div>

          {/* Industry Categories */}
          <div>
            <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">
              {catT('title')}
            </h4>
            <ul className="space-y-2 text-sm text-gray-600">
              {categories.map((cat) => (
                <li key={cat.key}>
                  <Link
                    href={`/jobs?category=${cat.key}`}
                    className="hover:text-brand-orange transition-colors"
                  >
                    {cat.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Workspaces & Portals */}
          <div>
            <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">
              {t('forEmployers')}
            </h4>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>
                <Link href="/jobs" className="hover:text-brand-orange transition-colors">
                  {t('browseJobs')}
                </Link>
              </li>
              <li>
                <Link href="/company" className="hover:text-brand-orange transition-colors">
                  {t('verifiedCompanies')}
                </Link>
              </li>
              <li>
                <Link href="/institutions" className="hover:text-brand-orange transition-colors">
                  {t('bulkOnboarding')}
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-brand-orange transition-colors">
                  {t('candidatePrivacy')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Trust & Support */}
          <div>
            <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">
              {t('trustSupport')}
            </h4>
            <ul className="space-y-2.5 text-sm text-gray-600">
              <li>
                <span className="block text-gray-900 font-medium">{t('panIndia')}</span>
                <span className="text-xs text-gray-500">{t('panIndiaSub')}</span>
              </li>
              <li className="pt-2">
                <span className="block text-gray-900 font-medium flex items-center gap-1.5">
                  <PhoneCall className="w-3.5 h-3.5 text-brand-orange" />
                  {t('helpline')}
                </span>
                <span className="text-xs text-gray-500 font-mono">{t('helplineNumber')}</span>
              </li>
              <li className="text-xs text-gray-500">
                {t('supportEmail')}
              </li>
              <li className="pt-1">
                <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  {t('dpdpCompliance')}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-200 mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
          <p>© {new Date().getFullYear()} {t('copyright')}</p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-gray-700">
              {t('candidatePrivacy')}
            </Link>
            <Link href="/how-it-works" className="hover:text-gray-700">
              {catT('description')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
