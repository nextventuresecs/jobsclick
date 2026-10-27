'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('Errors');

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md rounded-xl bg-white p-8 shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold text-gray-900 mb-2">{t('title')}</h2>
        <p className="text-sm text-gray-600 mb-6">{t('sectionError')}</p>
        <button
          onClick={() => reset()}
          className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 transition-colors"
        >
          {t('tryAgain')}
        </button>
      </div>
    </div>
  );
}
