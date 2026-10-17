'use client';

import React, { useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Globe } from 'lucide-react';

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const currentLocale = useLocale();
  const [isPending, startTransition] = useTransition();

  const handleLanguageChange = (newLocale: string) => {
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
    startTransition(() => {
      if (newLocale === 'hi') {
        if (!pathname.startsWith('/hi')) {
          const target = pathname === '/' ? '/hi' : `/hi${pathname}`;
          router.push(target);
          return;
        }
      } else if (newLocale === 'en') {
        if (pathname.startsWith('/hi')) {
          const target = pathname.replace(/^\/hi(?:\/|$)/, '/') || '/';
          router.push(target);
          return;
        }
      }
      router.refresh();
    });
  };

  return (
    <div className={`inline-flex items-center gap-1.5 bg-gray-100 p-1 rounded-lg border border-gray-200 text-xs font-medium ${className}`}>
      <Globe className="w-3.5 h-3.5 text-gray-500 ml-1 shrink-0" />
      <button
        type="button"
        disabled={isPending}
        onClick={() => handleLanguageChange('en')}
        className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
          currentLocale === 'en'
            ? 'bg-brand-orange text-white shadow-xs font-semibold'
            : 'text-gray-600 hover:text-gray-900'
        }`}
        aria-label="Switch to English"
      >
        EN
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => handleLanguageChange('hi')}
        className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
          currentLocale === 'hi'
            ? 'bg-brand-orange text-white shadow-xs font-semibold'
            : 'text-gray-600 hover:text-gray-900'
        }`}
        aria-label="हिंदी भाषा चुनें"
      >
        हिन्दी
      </button>
    </div>
  );
}
