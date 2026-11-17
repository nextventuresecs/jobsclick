'use client';

import { useTranslations } from 'next-intl';
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { UserRole, ClientRole } from '@indian-job-portal/validation';
import { toClientRole } from '@indian-job-portal/validation';

export interface AuthenticatedUser {
  readonly id: string; // Strictly server-issued UUID
  readonly role: UserRole;
  readonly status: 'active' | 'invited' | 'disabled' | 'suspended';
}

export interface ToastMessage {
  readonly id: string;
  readonly type: 'success' | 'error' | 'info' | 'warning';
  readonly title: string;
  readonly description?: string;
  readonly message?: string;
}

export interface AppContextValue {
  readonly user: AuthenticatedUser | null;
  readonly currentUserRole: ClientRole | null;
  readonly isAuthenticated: boolean;
  readonly isLoadingSession: boolean;
  readonly isAuthModalOpen: boolean;
  readonly authModalDefaultRole: 'job_seeker' | 'employer';
  readonly isRoleSwitcherOpen: boolean;
  readonly toasts: readonly ToastMessage[];
  readonly openAuthModal: (defaultRole?: 'job_seeker' | 'employer' | ClientRole) => void;
  readonly closeAuthModal: () => void;
  readonly openRoleSwitcher: () => void;
  readonly closeRoleSwitcher: () => void;
  readonly loginAs: (role: ClientRole, session?: unknown) => void;
  readonly logout: (signOutAll?: boolean) => Promise<void>;
  readonly refreshSession: (background?: boolean) => Promise<AuthenticatedUser | null>;
  readonly signOut: () => Promise<void>;
  readonly addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  readonly removeToast: (id: string) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({
  children,
  initialUser = null,
}: {
  readonly children: React.ReactNode;
  readonly initialUser?: AuthenticatedUser | null;
}) {
  const t = useTranslations('Auth');
  const resolvedInitialUser = initialUser;

  const [user, setUser] = useState<AuthenticatedUser | null>(resolvedInitialUser);
  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(!resolvedInitialUser);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isRoleSwitcherOpen, setIsRoleSwitcherOpen] = useState<boolean>(false);
  const [authModalDefaultRole, setAuthModalDefaultRole] = useState<
    'job_seeker' | 'employer'
  >('job_seeker');
  const [toasts, setToasts] = useState<readonly ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<ToastMessage, 'id'>) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { ...toast, id }]);
      setTimeout(() => removeToast(id), 5000);
    },
    [removeToast]
  );

  const refreshSession = useCallback(async (background = false): Promise<AuthenticatedUser | null> => {
    try {
      if (!background) setIsLoadingSession(true);
      const res = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (!res.ok) {
        setUser(null);
        return null;
      }

      const data = await res.json();
      if (data?.authenticated && data?.user?.id && data?.user?.role) {
        setUser((previous) => previous && previous.id === data.user.id && previous.role === data.user.role && previous.status === data.user.status ? previous : data.user);
        return data.user as AuthenticatedUser;
      }

      setUser(null);
      return null;
    } catch {
      setUser(null);
      return null;
    } finally {
      if (!background) setIsLoadingSession(false);
    }
  }, []);

  useEffect(() => {
    if (!resolvedInitialUser) {
      void refreshSession();
    }
  }, [resolvedInitialUser, refreshSession]);

  useEffect(() => {
    const refresh = () => { void refreshSession(true); };
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshSession]);

  const openAuthModal = useCallback(
    (defaultRole: 'job_seeker' | 'employer' | ClientRole = 'job_seeker') => {
      const normalized = defaultRole === 'employer' ? 'employer' : 'job_seeker';
      setAuthModalDefaultRole(normalized);
      setIsAuthModalOpen(true);
    },
    []
  );

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
  }, []);

  const openRoleSwitcher = useCallback(() => {
    setIsRoleSwitcherOpen(true);
  }, []);

  const closeRoleSwitcher = useCallback(() => {
    setIsRoleSwitcherOpen(false);
  }, []);

  const signOut = useCallback(async (allDevices = false) => {
    try {
      const response = await fetch(`/api/auth/session${allDevices ? '?allDevices=true' : ''}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('AUTH_SIGNOUT_FAILED');

      setUser(null);
      window.location.assign('/');
    } catch {
      addToast({ type: 'error', title: t('signOutFailed') });
    }
  }, [addToast, t]);

  const logout = useCallback(
    async (_signOutAll = false) => {
      return signOut(_signOutAll);
    },
    [signOut]
  );

  const loginAs = useCallback(
    (_role: ClientRole, _session?: unknown) => {
      setIsAuthModalOpen(false);
      setIsRoleSwitcherOpen(false);
    },
    []
  );

  // Strictly derived from verified server user object + active status
  const isAuthenticated = Boolean(user && user.id && user.status === 'active');
  const currentUserRole = user ? toClientRole(user.role) : null;

  const contextValue = useMemo<AppContextValue>(
    () => ({
      user,
      currentUserRole,
      isAuthenticated,
      isLoadingSession,
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
      refreshSession,
      signOut,
      addToast,
      removeToast,
    }),
    [
      user,
      currentUserRole,
      isAuthenticated,
      isLoadingSession,
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
      refreshSession,
      signOut,
      addToast,
      removeToast,
    ]
  );

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return ctx;
}

export const useApp = useAppContext;
