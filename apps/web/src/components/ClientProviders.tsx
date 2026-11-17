'use client';

import React from 'react';
import { AppProvider } from '../context/AppContext';
import { AuthModal } from './auth/AuthModal';
import { ToastContainer } from './ui/ToastContainer';
import type { AuthenticatedUser } from '../context/AppContext';

export function ClientProviders({
  children,
  initialUser,
}: {
  readonly children: React.ReactNode;
  readonly initialUser?: AuthenticatedUser | null;
}) {
  return (
    <AppProvider initialUser={initialUser}>
      {children}
      <AuthModal />
      <ToastContainer />
    </AppProvider>
  );
}
