'use client';

import React from 'react';
import { AppProvider } from '../context/AppContext';
import { AuthModal } from './auth/AuthModal';
import { RoleSwitcherModal } from './common/RoleSwitcherModal';
import { ToastContainer } from './ui/ToastContainer';

export function ClientProviders({ children }: { readonly children: React.ReactNode }) {
  return (
    <AppProvider>
      {children}
      <AuthModal />
      <RoleSwitcherModal />
      <ToastContainer />
    </AppProvider>
  );
}
