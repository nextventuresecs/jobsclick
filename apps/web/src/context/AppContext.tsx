'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ClientRole } from '@indian-job-portal/validation';
import { isClientRole } from '@indian-job-portal/validation';

export interface ToastMessage {
  readonly id: string;
  readonly type: 'success' | 'info' | 'warning' | 'error';
  readonly title: string;
  readonly message?: string;
}

interface AppContextType {
  readonly currentUserRole: ClientRole | null;
  readonly isAuthenticated: boolean;
  readonly isAuthModalOpen: boolean;
  readonly authModalDefaultRole: ClientRole;
  readonly isRoleSwitcherOpen: boolean;
  readonly toasts: readonly ToastMessage[];
  readonly openAuthModal: (defaultRole?: ClientRole) => void;
  readonly closeAuthModal: () => void;
  readonly openRoleSwitcher: () => void;
  readonly closeRoleSwitcher: () => void;
  readonly loginAs: (role: ClientRole) => void;
  readonly logout: () => void;
  readonly addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  readonly removeToast: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const ROLE_STORAGE_KEY = 'jobsclick_user_role';

export function AppProvider({ children }: { readonly children: React.ReactNode }) {
  const [currentUserRole, setCurrentUserRole] = useState<ClientRole | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalDefaultRole, setAuthModalDefaultRole] = useState<ClientRole>('jobseeker');
  const [isRoleSwitcherOpen, setIsRoleSwitcherOpen] = useState(false);
  const [toasts, setToasts] = useState<readonly ToastMessage[]>([]);

  // Hydrate role from localStorage on mount (client-only)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(ROLE_STORAGE_KEY);
      if (stored && isClientRole(stored)) {
        setCurrentUserRole(stored);
      }
    } catch {
      // Ignore localStorage access failures (SSR / private mode)
    }
  }, []);

  const openAuthModal = useCallback((defaultRole: ClientRole = 'jobseeker') => {
    setAuthModalDefaultRole(defaultRole);
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
  }, []);

  const openRoleSwitcher = useCallback(() => {
    setIsRoleSwitcherOpen(true);
  }, []);

  const closeRoleSwitcher = useCallback(() => {
    setIsRoleSwitcherOpen(false);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    ({ type, title, message }: Omit<ToastMessage, 'id'>) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newToast: ToastMessage = { id, type, title, message };
      setToasts((prev) => [...prev, newToast]);

      // Auto dismiss after 4 seconds
      setTimeout(() => {
        removeToast(id);
      }, 4000);
    },
    [removeToast]
  );

  const loginAs = useCallback(
    (role: ClientRole) => {
      setCurrentUserRole(role);
      try {
        localStorage.setItem(ROLE_STORAGE_KEY, role);
      } catch {
        // Ignore storage errors
      }
      setIsAuthModalOpen(false);
      setIsRoleSwitcherOpen(false);
    },
    []
  );

  const logout = useCallback(() => {
    setCurrentUserRole(null);
    try {
      localStorage.removeItem(ROLE_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
    addToast({
      type: 'info',
      title: 'Signed Out',
      message: 'You have been safely signed out.',
    });
  }, [addToast]);

  const value = {
    currentUserRole,
    isAuthenticated: currentUserRole !== null,
    isAuthModalOpen,
    authModalDefaultRole,
    isRoleSwitcherOpen,
    toasts,
    openAuthModal,
    closeAuthModal,
    openRoleSwitcher,
    closeRoleSwitcher,
    loginAs,
    logout,
    addToast,
    removeToast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextType {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
