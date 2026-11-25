'use client';

import Link from 'next/link';
import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAppContext } from '@/context/AppContext';

export function InstitutionLoginButton() {
  const t = useTranslations('AuthEntry');
  const { isAuthenticated, openAuthModal } = useAppContext();
  const className = 'inline-flex items-center gap-2 rounded-lg bg-brand-orange px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-orange-600 sm:text-sm';
  const content = <><Users aria-hidden="true" className="h-4 w-4" />{t('institution')}</>;

  if (isAuthenticated) {
    return <Link href="/workspace" className={className}>{content}</Link>;
  }

  return <button type="button" className={className} onClick={() => openAuthModal('institution')}>{content}</button>;
}
