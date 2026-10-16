'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { JobsClickLogo, Button } from '@indian-job-portal/ui';
import { isClientRole, ClientRole } from '@indian-job-portal/validation';
import { useApp } from '../../../context/AppContext';
import { getSupabaseBrowserClient } from '../../../lib/supabaseClient';
import { Loader2, AlertCircle, ArrowRight } from 'lucide-react';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loginAs, addToast } = useApp();

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    let isMounted = true;

    async function handleAuth() {
      try {
        const supabase = getSupabaseBrowserClient();

        // If Supabase client is not available (mock fallback)
        if (!supabase) {
          const fallbackRole = searchParams.get('role');
          const resolvedRole: ClientRole =
            fallbackRole && isClientRole(fallbackRole) ? fallbackRole : 'jobseeker';

          loginAs(resolvedRole);
          addToast({
            type: 'success',
            title: 'Signed In',
            message: `Authenticated as ${resolvedRole}.`,
          });
          router.replace('/workspace');
          return;
        }

        // 1. If PKCE code is present in query parameters, exchange it for session
        const code = searchParams.get('code');
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw exchangeError;
          }
        }

        // 2. Fetch session (auto-detects hash fragment tokens or existing cookies)
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw sessionError;
        }

        const session = data.session;
        if (session) {
          // Resolve role: URL query param -> localStorage fallback -> session user_metadata -> default 'jobseeker'
          const urlRole = searchParams.get('role');
          const pendingRole =
            typeof window !== 'undefined'
              ? localStorage.getItem('jobsclick_pending_oauth_role')
              : null;
          const metaRole = session.user?.user_metadata?.role;

          let resolvedRole: ClientRole = 'jobseeker';
          if (urlRole && isClientRole(urlRole)) {
            resolvedRole = urlRole;
          } else if (pendingRole && isClientRole(pendingRole)) {
            resolvedRole = pendingRole;
          } else if (metaRole && isClientRole(metaRole)) {
            resolvedRole = metaRole;
          }

          if (typeof window !== 'undefined') {
            localStorage.removeItem('jobsclick_pending_oauth_role');
          }

          if (!isMounted) return;

          setStatus('success');
          loginAs(resolvedRole);
          addToast({
            type: 'success',
            title: 'Google Sign-In Successful',
            message: `Welcome back! Signed in as ${resolvedRole}.`,
          });

          router.replace('/workspace');
        } else {
          // Listen for auth state change in case token is asynchronously processed
          const { data: authListener } = supabase.auth.onAuthStateChange(
            (event, changedSession) => {
              if (changedSession && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
                const urlRole = searchParams.get('role');
                const pendingRole =
                  typeof window !== 'undefined'
                    ? localStorage.getItem('jobsclick_pending_oauth_role')
                    : null;
                const metaRole = changedSession.user?.user_metadata?.role;

                let resolvedRole: ClientRole = 'jobseeker';
                if (urlRole && isClientRole(urlRole)) {
                  resolvedRole = urlRole;
                } else if (pendingRole && isClientRole(pendingRole)) {
                  resolvedRole = pendingRole;
                } else if (metaRole && isClientRole(metaRole)) {
                  resolvedRole = metaRole;
                }

                if (typeof window !== 'undefined') {
                  localStorage.removeItem('jobsclick_pending_oauth_role');
                }

                if (!isMounted) return;

                setStatus('success');
                loginAs(resolvedRole);
                addToast({
                  type: 'success',
                  title: 'Google Sign-In Successful',
                  message: `Welcome back! Signed in as ${resolvedRole}.`,
                });

                router.replace('/workspace');
                authListener.subscription.unsubscribe();
              }
            }
          );
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        setStatus('error');
        setErrorMessage(
          err instanceof Error ? err.message : 'Google authentication callback failed'
        );
      }
    }

    handleAuth();

    return () => {
      isMounted = false;
    };
  }, [router, searchParams, loginAs, addToast]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-md w-full p-8 text-center">
        <div className="flex justify-center mb-6">
          <JobsClickLogo variant="full" size="md" />
        </div>

        {status === 'loading' && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">
              Verifying Google Authentication...
            </h2>
            <p className="text-sm text-gray-500">
              Completing secure authentication with Supabase. You will be redirected shortly.
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900">
              Authentication Confirmed!
            </h2>
            <p className="text-sm text-gray-500">
              Redirecting you to your workspace...
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                <AlertCircle className="w-6 h-6" />
              </div>
            </div>
            <h2 className="text-lg font-bold text-gray-900">
              Authentication Failed
            </h2>
            <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">
              {errorMessage || 'Unable to complete sign-in.'}
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <Link href="/">
                <Button variant="primary" className="w-full justify-center">
                  <span>Return to Home</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex items-center justify-center p-4">
          <div className="flex items-center gap-3 text-gray-500">
            <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
            <span>Loading authentication...</span>
          </div>
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
