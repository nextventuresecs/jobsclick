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
  const control = 'inline-flex size-12 items-center justify-center rounded-md text-base cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal disabled:cursor-wait disabled:opacity-60';

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
    <div className={`inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-100 p-0.5 font-medium ${className}`}>
      <Globe aria-hidden="true" className="ml-1 hidden h-4 w-4 shrink-0 text-gray-500 sm:block" />
      <button
        type="button"
        disabled={isPending}
        onClick={() => handleLanguageChange('en')}
        className={`${control} ${
          currentLocale === 'en'
            ? 'bg-brand-orange text-white shadow-xs font-semibold'
            : 'text-gray-600 hover:text-gray-900'
        }`}
        aria-label="Switch to English"
        aria-pressed={currentLocale === 'en'}
        lang="en"
      >
        EN
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => handleLanguageChange('hi')}
        className={`${control} ${
          currentLocale === 'hi'
            ? 'bg-brand-orange text-white shadow-xs font-semibold'
            : 'text-gray-600 hover:text-gray-900'
        }`}
        aria-label="हिंदी भाषा चुनें"
        aria-pressed={currentLocale === 'hi'}
        lang="hi"
      >
        हिन्दी
      </button>
    </div>
  );
}
