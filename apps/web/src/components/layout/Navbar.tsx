'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { JobsClickLogo, Button } from '@indian-job-portal/ui';
import { LanguageSwitcher } from '../language-switcher';
import { Menu, X, ShieldCheck, Briefcase, LayoutDashboard, LogOut } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { ClientRole } from '@indian-job-portal/validation';

interface NavbarProps {
  readonly onOpenAuth?: (role?: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenAuth,
}) => {
  const t = useTranslations('Navigation');
  const tRoles = useTranslations('Roles');
  const locale = useLocale();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Safe context access with fallback
  const app = (() => {
    try {
      return useApp();
    } catch {
      return null;
    }
  })();

  const handleOpenAuth = (role: ClientRole = 'jobseeker') => {
    if (onOpenAuth) {
      onOpenAuth(role);
    } else if (app) {
      app.openAuthModal(role);
    }
  };

  const isActive = (path: string) => {
    const localPath = pathname.replace(/^\/hi(?=\/|$)/, '') || '/';
    return localPath === path || localPath.startsWith(`${path}/`);
  };
  const localHref = (path: string) => locale === 'hi' ? '/hi' + (path === '/' ? '' : path) : path;

  const getRoleLabel = (role: ClientRole): string => {
    if (role === 'jobseeker') return tRoles('jobseeker');
    if (role === 'employer') return tRoles('employer');
    if (role === 'institution') return tRoles('institution');
    if (role === 'msme_dept') return tRoles('msmeDept');
    return tRoles('admin');
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-1 sm:gap-4">
          {/* Zone 1: Brand Wordmark */}
          <Link
            href={localHref('/')}
            className="flex min-h-12 shrink-0 items-center rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal"
            aria-label={t('home')}
          >
            <JobsClickLogo variant="full" size="sm" className="sm:[&_svg]:h-9" />
          </Link>

          {/* Zone 2: Navigation Links */}
          <nav className="hidden items-center gap-4 text-sm font-medium text-gray-700 xl:flex 2xl:gap-7">
            <Link
              href={localHref('/jobs')}
              className={`whitespace-nowrap transition-colors py-1 ${
                isActive('/jobs')
                  ? 'text-[#C2410C] font-semibold border-b-2 border-[#C2410C]'
                  : 'hover:text-[#C2410C]'
              }`}
            >
              {t('findJobs')}
            </Link>
            <Link
              href={localHref('/company')}
              className={`whitespace-nowrap transition-colors py-1 ${
                isActive('/company')
                  ? 'text-[#C2410C] font-semibold border-b-2 border-[#C2410C]'
                  : 'hover:text-[#C2410C]'
              }`}
            >
              {t('companies')}
            </Link>
            <Link
              href={localHref('/how-it-works')}
              className={`whitespace-nowrap transition-colors py-1 ${
                isActive('/how-it-works')
                  ? 'text-[#C2410C] font-semibold border-b-2 border-[#C2410C]'
                  : 'hover:text-[#C2410C]'
              }`}
            >
              {t('howItWorks')}
            </Link>
            <Link
              href={localHref('/institutions')}
              className={`whitespace-nowrap transition-colors py-1 ${
                isActive('/institutions')
                  ? 'text-[#C2410C] font-semibold border-b-2 border-[#C2410C]'
                  : 'hover:text-[#C2410C]'
              }`}
            >
              {t('institutions')}
            </Link>
          </nav>

          {/* Zone 3: Actions (Language, Role Switcher, Auth) */}
          <div className="hidden shrink-0 items-center gap-3 xl:flex">
            {/* Language Switcher */}
            <LanguageSwitcher />

            {/* Active User Role Badge (only when authenticated) */}
            {app?.isAuthenticated && app?.currentUserRole && (
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-50 text-orange-950 border border-orange-200"
                title="Current active workspace role"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-[#C2410C]" />
                <span>{getRoleLabel(app.currentUserRole)}</span>
              </div>
            )}

            {app?.isAuthenticated ? (
              <div className="flex items-center gap-2">
                <Link
                  href={localHref('/workspace')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  <span>{t('myWorkspace')}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => app.logout()}
                  className="p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-gray-100 transition-colors"
                  title={t('signOut')}
                  aria-label={t('signOut')}
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                {/* Sign In Button */}
                <button
                  type="button"
                  onClick={() => handleOpenAuth('jobseeker')}
                  className="px-3.5 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 rounded-md transition-colors cursor-pointer"
                >
                  {t('signIn')}
                </button>

                {/* Post a Job CTA */}
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleOpenAuth('employer')}
                  className="inline-flex items-center gap-1.5 font-semibold shadow-xs"
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>{t('postJob')}</span>
                </Button>
              </>
            )}
          </div>

          {/* Mobile menu trigger & Language */}
          <div className="flex shrink-0 items-center gap-1 xl:hidden">
            <LanguageSwitcher />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="grid size-12 place-items-center rounded-md text-gray-600 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal"
              aria-label={t('toggleMenu')}
              aria-expanded={mobileMenuOpen}
              aria-controls={mobileMenuOpen ? 'mobile-navigation' : undefined}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <nav id="mobile-navigation" className="max-h-[calc(100dvh-4rem)] space-y-3 overflow-y-auto border-b border-gray-200 bg-white px-4 pt-3 pb-6 xl:hidden">
          <Link
            href={localHref('/jobs')}
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 text-base font-medium text-gray-800 rounded-md hover:bg-gray-50"
          >
            {t('findJobs')}
          </Link>
          <Link
            href={localHref('/company')}
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 text-base font-medium text-gray-800 rounded-md hover:bg-gray-50"
          >
            {t('companies')}
          </Link>
          <Link
            href={localHref('/how-it-works')}
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 text-base font-medium text-gray-800 rounded-md hover:bg-gray-50"
          >
            {t('howItWorks')}
          </Link>
          <Link
            href={localHref('/institutions')}
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 text-base font-medium text-gray-800 rounded-md hover:bg-gray-50"
          >
            {t('institutions')}
          </Link>

          <div className="pt-3 border-t border-gray-100 flex flex-col gap-2">
            {app?.isAuthenticated && app?.currentUserRole && (
              <div className="w-full text-center px-3 py-2 text-xs font-semibold text-orange-950 bg-orange-50 border border-orange-200 rounded-lg">
                {getRoleLabel(app.currentUserRole)}
              </div>
            )}

            {app?.isAuthenticated ? (
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href={localHref('/workspace')}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-center px-3 py-2.5 text-sm font-semibold text-white bg-gray-900 rounded-lg"
                >
                  {t('myWorkspace')}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    app.logout();
                  }}
                  className="text-center px-3 py-2.5 text-sm font-semibold text-red-600 bg-red-50 rounded-lg"
                >
                  {t('signOut')}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleOpenAuth('jobseeker');
                  }}
                  className="w-full text-center px-3 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  {t('signIn')}
                </button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleOpenAuth('employer');
                  }}
                  className="w-full text-center"
                >
                  {t('postJob')}
                </Button>
              </div>
            )}
          </div>
        </nav>
      )}
    </header>
  );
};
