'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { JobsClickLogo, Button } from '@indian-job-portal/ui';
import { LanguageSwitcher } from '../language-switcher';
import { Menu, X, ShieldCheck, Briefcase, LayoutDashboard, LogOut } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { ClientRole } from '@indian-job-portal/validation';

interface NavbarProps {
  readonly onOpenAuth?: (role?: string) => void;
}

const ROLE_SHORT_LABELS: Record<ClientRole, string> = {
  jobseeker: 'Job Seeker',
  employer: 'Employer',
  institution: 'Institution',
  msme_dept: 'MSME Dept',
  platform_admin: 'Central Ops',
};

export const Navbar: React.FC<NavbarProps> = ({
  onOpenAuth,
}) => {
  const t = useTranslations('Navigation');
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
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4 lg:gap-8">
          {/* Zone 1: Brand Wordmark */}
          <Link
            href="/"
            className="flex items-center text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange rounded-md shrink-0"
            aria-label="JobsClick Home"
          >
            <JobsClickLogo variant="full" size="md" />
          </Link>

          {/* Zone 2: Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-7 text-sm font-medium text-gray-700">
            <Link
              href="/jobs"
              className={`whitespace-nowrap transition-colors py-1 ${
                isActive('/jobs')
                  ? 'text-brand-orange font-semibold border-b-2 border-brand-orange'
                  : 'hover:text-brand-orange'
              }`}
            >
              {t('findJobs')}
            </Link>
            <Link
              href="/company"
              className={`whitespace-nowrap transition-colors py-1 ${
                isActive('/company')
                  ? 'text-brand-orange font-semibold border-b-2 border-brand-orange'
                  : 'hover:text-brand-orange'
              }`}
            >
              {t('companies')}
            </Link>
            <Link
              href="/workspace"
              className={`whitespace-nowrap transition-colors py-1 ${
                isActive('/workspace')
                  ? 'text-brand-orange font-semibold border-b-2 border-brand-orange'
                  : 'hover:text-brand-orange'
              }`}
            >
              Dashboard
            </Link>
            <Link
              href="/how-it-works"
              className={`whitespace-nowrap transition-colors py-1 ${
                isActive('/how-it-works')
                  ? 'text-brand-orange font-semibold border-b-2 border-brand-orange'
                  : 'hover:text-brand-orange'
              }`}
            >
              {t('howItWorks')}
            </Link>
            <Link
              href="/institutions"
              className={`whitespace-nowrap transition-colors py-1 ${
                isActive('/institutions')
                  ? 'text-brand-orange font-semibold border-b-2 border-brand-orange'
                  : 'hover:text-brand-orange'
              }`}
            >
              Institutions
            </Link>
          </nav>

          {/* Zone 3: Actions (Language, Role Switcher, Auth) */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            {/* Language Switcher */}
            <LanguageSwitcher />

            {/* Active User Role Badge (only when authenticated) */}
            {app?.isAuthenticated && app?.currentUserRole && (
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-50 text-orange-950 border border-orange-200"
                title="Current active workspace role"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-brand-orange" />
                <span>Role: {ROLE_SHORT_LABELS[app.currentUserRole]}</span>
              </div>
            )}

            {app?.isAuthenticated ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/workspace"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  <span>Workspace</span>
                </Link>
                <button
                  type="button"
                  onClick={() => app.logout()}
                  className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Sign Out"
                  aria-label="Sign Out"
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
          <div className="flex md:hidden items-center gap-2">
            <LanguageSwitcher />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-gray-600 hover:text-gray-900 rounded-md focus:outline-none"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-gray-200 bg-white px-4 pt-3 pb-6 space-y-3">
          <Link
            href="/jobs"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 text-base font-medium text-gray-800 rounded-md hover:bg-gray-50"
          >
            {t('findJobs')}
          </Link>
          <Link
            href="/company"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 text-base font-medium text-gray-800 rounded-md hover:bg-gray-50"
          >
            {t('companies')}
          </Link>
          <Link
            href="/workspace"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 text-base font-medium text-gray-800 rounded-md hover:bg-gray-50"
          >
            Dashboard
          </Link>
          <Link
            href="/how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 text-base font-medium text-gray-800 rounded-md hover:bg-gray-50"
          >
            {t('howItWorks')}
          </Link>
          <Link
            href="/institutions"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 text-base font-medium text-gray-800 rounded-md hover:bg-gray-50"
          >
            Institutions
          </Link>

          <div className="pt-3 border-t border-gray-100 flex flex-col gap-2">
            {app?.isAuthenticated && app?.currentUserRole && (
              <div className="w-full text-center px-3 py-2 text-xs font-semibold text-orange-950 bg-orange-50 border border-orange-200 rounded-lg">
                Role: {ROLE_SHORT_LABELS[app.currentUserRole]}
              </div>
            )}

            {app?.isAuthenticated ? (
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/workspace"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-center px-3 py-2 text-sm font-semibold text-white bg-gray-900 rounded-lg"
                >
                  Workspace
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    app.logout();
                  }}
                  className="text-center px-3 py-2 text-sm font-semibold text-red-600 bg-red-50 rounded-lg"
                >
                  Sign Out
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
                  className="w-full text-center px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
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
        </div>
      )}
    </header>
  );
};
