'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { UserRole, ClientRole } from '@indian-job-portal/validation';
import { toClientRole } from '@indian-job-portal/validation';
import type { VerifiedSession } from '../lib/auth-session';

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
  readonly accessToken: string | null;
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
  readonly refreshSession: () => Promise<AuthenticatedUser | null>;
  readonly signOut: () => Promise<void>;
  readonly addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  readonly removeToast: (id: string) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({
  children,
  initialUser = null,
  initialSession = null,
}: {
  readonly children: React.ReactNode;
  readonly initialUser?: AuthenticatedUser | null;
  readonly initialSession?: VerifiedSession | null;
}) {
  const resolvedInitialUser: AuthenticatedUser | null =
    initialUser ??
    (initialSession
      ? {
          id: initialSession.sub,
          role: initialSession.role as UserRole,
          status: initialSession.status,
        }
      : null);

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
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { ...toast, id }]);
      setTimeout(() => removeToast(id), 5000);
    },
    [removeToast]
  );

  const refreshSession = useCallback(async (): Promise<AuthenticatedUser | null> => {
    try {
      setIsLoadingSession(true);
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
        setUser(data.user);
        return data.user as AuthenticatedUser;
      }

      setUser(null);
      return null;
    } catch {
      setUser(null);
      return null;
    } finally {
      setIsLoadingSession(false);
    }
  }, []);

  useEffect(() => {
    if (!resolvedInitialUser) {
      void refreshSession();
    }
  }, [resolvedInitialUser, refreshSession]);

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

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/auth/session', {
        method: 'DELETE',
        credentials: 'include',
      });
    } finally {
      setUser(null);
      window.location.assign('/');
    }
  }, []);

  const logout = useCallback(
    async (_signOutAll = false) => {
      return signOut();
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
  const accessToken = null;

  const contextValue = useMemo<AppContextValue>(
    () => ({
      user,
      currentUserRole,
      accessToken,
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
      accessToken,
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
