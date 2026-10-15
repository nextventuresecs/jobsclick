'use client';

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Globe } from 'lucide-react';

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const handleLanguageChange = (newLocale: string) => {
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000`;
    let newPath = pathname;
    if (pathname.startsWith('/hi') || pathname.startsWith('/en')) {
      newPath = `/${newLocale}${pathname.slice(3)}`;
    } else {
      newPath = `/${newLocale}${pathname}`;
    }
    router.push(newPath);
  };

  const currentLocale = pathname.startsWith('/hi') ? 'hi' : 'en';

  return (
    <div className={`inline-flex items-center gap-1.5 bg-gray-100 p-1 rounded-lg border border-gray-200 text-xs font-medium ${className}`}>
      <Globe className="w-3.5 h-3.5 text-gray-500 ml-1 shrink-0" />
      <button
        type="button"
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
