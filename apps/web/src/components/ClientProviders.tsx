'use client';

import React from 'react';
import posthog from 'posthog-js';
import { AppProvider } from '../context/AppContext';
import { AuthModal } from './auth/AuthModal';
import { ToastContainer } from './ui/ToastContainer';
import type { VerifiedSession } from '../lib/auth-session';

const posthogToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (posthogToken && posthogHost) {
  posthog.init(posthogToken, {
    api_host: posthogHost,
    capture_exceptions: true,
  });
} else if (process.env.NODE_ENV !== 'production') {
  if (!posthogToken) {
    console.error(
      'NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured'
    );
  }
  if (!posthogHost) {
    console.error(
      'NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured'
    );
  }
}

export function ClientProviders({
  children,
  initialSession,
}: {
  readonly children: React.ReactNode;
  readonly initialSession?: VerifiedSession | null;
}) {
  return (
    <AppProvider initialSession={initialSession}>
      {children}
      <AuthModal />
      <ToastContainer />
    </AppProvider>
  );
}
