'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppContext } from '@/context/AppContext';

export default function AuthCallbackPage() {
  const router = useRouter();
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
        // Supabase OAuth returns 'code' (for PKCE) or hash fragment / access_token
        const hashParams = typeof window !== 'undefined' && window.location.hash
          ? new URLSearchParams(window.location.hash.replace(/^#/, ''))
          : null;
        const code = params.get('code') || params.get('access_token') || hashParams?.get('access_token');
        const role = params.get('role') === 'employer' ? 'employer' : 'job_seeker';

        if (!code) {
          setErrorState('Missing authentication authorization code or token.');
          return;
        }

        const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
        if (!apiBaseUrl) {
          setErrorState('Service configuration error: Missing API URL.');
          return;
        }

        // Exchange code/token on backend
        const response = await fetch(`${apiBaseUrl}/auth/oauth/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerToken: code,
            role,
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.accessToken) {
          setErrorState(data?.message || 'Could not verify your sign-in session.');
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
          setErrorState('Failed to establish browser session cookie.');
          return;
        }

        const user = await refreshSession();
        addToast({
          type: 'success',
          title: 'Signed in successfully',
        });

        if (user?.requiresPhoneLink) {
          router.replace('/workspace?promptPhoneLink=true');
        } else {
          router.replace('/workspace');
        }
      } catch {
        setErrorState('An unexpected network error occurred during sign-in.');
      }
    };

    void completeAuthCallback();
  }, [refreshSession, addToast, router]);

  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        {!errorState ? (
          <>
            <div
              className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600"
              role="status"
              aria-label="Completing sign in"
            />
            <h1 className="mt-4 text-lg font-semibold text-slate-900">
              Securing your workspace…
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Verifying your credentials and setting up your session.
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
              !
            </div>
            <h1 className="mt-4 text-lg font-semibold text-slate-900">
              Sign-in could not be completed
            </h1>
            <p className="mt-2 text-sm text-slate-600">{errorState}</p>
            <button
              type="button"
              onClick={() => router.replace('/')}
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Return to Home
            </button>
          </>
        )}
      </div>
    </main>
  );
}