'use client';

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';

export function LanguageSwitcher() {
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
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-500 font-medium">Language / भाषा:</span>
      <button
        onClick={() => handleLanguageChange('en')}
        className={`px-2 py-1 rounded text-xs font-semibold ${
          currentLocale === 'en' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
        }`}
      >
        English
      </button>
      <button
        onClick={() => handleLanguageChange('hi')}
        className={`px-2 py-1 rounded text-xs font-semibold ${
          currentLocale === 'hi' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
        }`}
      >
        हिंदी
      </button>
    </div>
  );
}
