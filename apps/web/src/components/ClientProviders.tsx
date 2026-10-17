'use client';

import React from 'react';
import { AppProvider } from '../context/AppContext';
import { AuthModal } from './auth/AuthModal';
import { ToastContainer } from './ui/ToastContainer';
import type { VerifiedSession } from '../lib/auth-session';

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
