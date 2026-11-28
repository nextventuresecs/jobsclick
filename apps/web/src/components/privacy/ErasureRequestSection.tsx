'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';

type Phase = 'idle' | 'confirm' | 'submitting' | 'success' | 'error';

export function ErasureRequestSection() {
  const t = useTranslations('Privacy');
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorKey, setErrorKey] = useState<'errorUnauthenticated' | 'errorGeneric'>('errorGeneric');

  async function submit() {
    setPhase('submitting');
    try {
      const res = await fetch('/api/privacy/erasure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmDeletion: true }),
      });
      if (res.ok) {
        setPhase('success');
        return;
      }
      setErrorKey(res.status === 401 ? 'errorUnauthenticated' : 'errorGeneric');
    } catch {
      setErrorKey('errorGeneric');
    }
    setPhase('error');
  }

  return (
    <section className="pt-4 border-t border-gray-200" aria-labelledby="erasure-heading">
      <h2 id="erasure-heading" className="text-xl font-semibold text-gray-900 mb-2">
        {t('erasureTitle')}
      </h2>
      <p className="mb-4">{t('erasureBody')}</p>

      {phase === 'idle' && (
        <button
          type="button"
          onClick={() => setPhase('confirm')}
          className="px-4 py-2 bg-red-600 text-white font-medium rounded hover:bg-red-700"
        >
          {t('erasureButton')}
        </button>
      )}

      {(phase === 'confirm' || phase === 'submitting') && (
        <div
          role="alertdialog"
          aria-labelledby="erasure-confirm-title"
          aria-describedby="erasure-confirm-body"
          className="rounded border border-red-300 bg-red-50 p-4"
        >
          <p id="erasure-confirm-title" className="font-semibold text-red-800">{t('confirmTitle')}</p>
          <p id="erasure-confirm-body" className="mt-1 text-sm text-red-800">{t('confirmBody')}</p>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={phase === 'submitting'}
              className="px-4 py-2 bg-red-600 text-white font-medium rounded hover:bg-red-700 disabled:opacity-60"
            >
              {phase === 'submitting' ? t('submitting') : t('confirmButton')}
            </button>
            <button
              type="button"
              onClick={() => setPhase('idle')}
              disabled={phase === 'submitting'}
              className="px-4 py-2 border border-gray-300 rounded text-gray-800 hover:bg-gray-50"
            >
              {t('cancelButton')}
            </button>
          </div>
        </div>
      )}

      <div aria-live="polite">
        {phase === 'success' && <p className="text-green-700 font-medium">{t('success')}</p>}
        {phase === 'error' && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-red-700 font-medium">{t(errorKey)}</p>
            <button type="button" onClick={() => setPhase('idle')} className="underline text-gray-800">
              {t('retry')}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
