'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAppContext } from '@/context/AppContext';
import { getSupabaseBrowserClient } from '@/lib/supabaseClient';

export default function AuthCallbackPage() {
  const router = useRouter();
  const t = useTranslations('GoogleCallback');
  const { refreshSession, addToast } = useAppContext();
  const hasExchangedRef = useRef<boolean>(false);
  const [errorState, setErrorState] = useState<string | null>(null);

  useEffect(() => {
    // Prevent double code exchange in React 18 Strict Mode (Fixes P3 OAuth double-fire)
    if (hasExchangedRef.current) return;
    hasExchangedRef.current = true;

    const completeAuthCallback = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const role = params.get('role') === 'employer' ? 'employer' : 'job_seeker';

        if (!code) {
          setErrorState(t('missingCode'));
          return;
        }

        const supabase = getSupabaseBrowserClient();
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
        if (!supabase || !apiBaseUrl) {
          setErrorState(t('unavailable'));
          return;
        }

        const { data: provider, error } = await supabase.auth.exchangeCodeForSession(code);
        const providerToken = provider.session?.access_token;
        if (error || !providerToken) {
          setErrorState(t('verificationFailed'));
          return;
        }

        // The backend verifies the provider session before issuing an application session.
        const response = await fetch(`${apiBaseUrl}/auth/oauth/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerToken,
            role,
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.accessToken) {
          setErrorState(t('verificationFailed'));
          return;
        }

        // Persist into HttpOnly __Host- cookie so Google users get a real isolated session
        const sessionRes = await fetch('/api/auth/session', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: data.accessToken }),
        });

        if (!sessionRes.ok) {
          setErrorState(t('sessionFailed'));
          return;
        }

        const user = await refreshSession();
        addToast({
          type: 'success',
          title: t('success'),
        });

        if (user?.requiresPhoneLink) {
          router.replace('/workspace?promptPhoneLink=true');
        } else {
          router.replace('/workspace');
        }
      } catch {
        setErrorState(t('networkError'));
      }
    };

    void completeAuthCallback();
  }, [refreshSession, addToast, router, t]);

  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        {!errorState ? (
          <>
            <div
              className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600"
              role="status"
              aria-label={t('loadingLabel')}
            />
            <h1 className="mt-4 text-lg font-semibold text-slate-900">
              {t('loadingTitle')}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {t('loadingDescription')}
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
              !
            </div>
            <h1 className="mt-4 text-lg font-semibold text-slate-900">
              {t('failedTitle')}
            </h1>
            <p className="mt-2 text-sm text-slate-600">{errorState}</p>
            <button
              type="button"
              onClick={() => router.replace('/')}
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              {t('returnHome')}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
