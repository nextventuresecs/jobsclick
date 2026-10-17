'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ClientRole } from '@indian-job-portal/validation';
import { isClientRole, isUserRole, toClientRole } from '@indian-job-portal/validation';
import type { VerifiedSession } from '../lib/auth-session';

export interface AuthUser {
  readonly id: string;
  readonly phone: string;
  readonly email: string | null;
  readonly emailVerified?: boolean;
  readonly role: string;
  readonly status: 'invited' | 'active' | 'disabled';
}

export interface ToastMessage {
  readonly id: string;
  readonly type: 'success' | 'info' | 'warning' | 'error';
  readonly title: string;
  readonly message?: string;
}

interface AppContextType {
  readonly currentUserRole: ClientRole | null;
  readonly user: AuthUser | null;
  readonly accessToken: string | null;
  readonly isAuthenticated: boolean;
  readonly isAuthModalOpen: boolean;
  readonly authModalDefaultRole: ClientRole;
  readonly isRoleSwitcherOpen: boolean;
  readonly toasts: readonly ToastMessage[];
  readonly openAuthModal: (defaultRole?: ClientRole) => void;
  readonly closeAuthModal: () => void;
  readonly openRoleSwitcher: () => void;
  readonly closeRoleSwitcher: () => void;
  readonly loginAs: (role: ClientRole, session?: { accessToken?: string; user?: AuthUser }) => void;
  readonly setAuthSession: (session: { accessToken: string; user: AuthUser }) => void;
  readonly logout: (signOutAll?: boolean) => Promise<void>;
  readonly addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  readonly removeToast: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const ROLE_STORAGE_KEY = 'jobsclick_user_role';
const TOKEN_STORAGE_KEY = 'jobsclick_access_token';
const USER_STORAGE_KEY = 'jobsclick_user_data';

export function AppProvider({
  children,
  initialSession,
}: {
  readonly children: React.ReactNode;
  readonly initialSession?: VerifiedSession | null;
}) {
  const [currentUserRole, setCurrentUserRole] = useState<ClientRole | null>(
    initialSession?.clientRole ?? null
  );
  const [user, setUser] = useState<AuthUser | null>(
    initialSession?.user ?? null
  );
  const [accessToken, setAccessToken] = useState<string | null>(
    initialSession?.accessToken ?? null
  );
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalDefaultRole, setAuthModalDefaultRole] = useState<ClientRole>('jobseeker');
  const [isRoleSwitcherOpen, setIsRoleSwitcherOpen] = useState(false);
  const [toasts, setToasts] = useState<readonly ToastMessage[]>([]);

  // Authenticate session strictly from server session or secure HttpOnly cookie
  // Plaintext localStorage.getItem('jobsclick_user_role') is deprecated & ignored for privilege derivation (AUTH-05)
  useEffect(() => {
    if (initialSession) {
      setCurrentUserRole(initialSession.clientRole);
      setUser(initialSession.user);
      setAccessToken(initialSession.accessToken);
      return;
    }

    let isMounted = true;
    async function syncSessionFromCookie() {
      try {
        const res = await fetch('/api/auth/session');
        if (res.ok) {
          const data = await res.json();
          if (data?.session && isMounted) {
            setUser(data.session.user);
            setAccessToken(data.session.accessToken);
            setCurrentUserRole(data.session.clientRole);
          }
        }
      } catch {
        // Fallback for offline or test environments
      }
    }

    syncSessionFromCookie();

    return () => {
      isMounted = false;
    };
  }, [initialSession]);

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

  const setAuthSession = useCallback(
    ({ accessToken: token, user: authUser }: { accessToken: string; user: AuthUser }) => {
      setAccessToken(token);
      setUser(authUser);

      // Derive client role strictly from verified user payload
      let resolvedRole: ClientRole = 'jobseeker';
      if (isUserRole(authUser.role)) {
        resolvedRole = toClientRole(authUser.role);
      } else if (isClientRole(authUser.role)) {
        resolvedRole = authUser.role;
      }

      setCurrentUserRole(resolvedRole);

      // Persist in secure HttpOnly cookie on web server
      fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token, user: authUser }),
      }).catch(() => {});

      setIsAuthModalOpen(false);
      setIsRoleSwitcherOpen(false);
    },
    []
  );

  const loginAs = useCallback(
    (role: ClientRole, session?: { accessToken?: string; user?: AuthUser }) => {
      if (session?.user && session?.accessToken) {
        setAuthSession({ accessToken: session.accessToken, user: session.user });
        return;
      }

      // Demo/preview role switching (unauthenticated exploration)
      setCurrentUserRole(role);
      setIsAuthModalOpen(false);
      setIsRoleSwitcherOpen(false);
    },
    [setAuthSession]
  );

  const logout = useCallback(
    async (signOutAll = false) => {
      setCurrentUserRole(null);
      setAccessToken(null);
      setUser(null);

      try {
        localStorage.removeItem(ROLE_STORAGE_KEY);
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(USER_STORAGE_KEY);
      } catch {
        // Ignore storage errors
      }

      // Clear server cookie & active backend sessions (AUTH-06)
      try {
        await fetch('/api/auth/session', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signOutAll }),
        });
      } catch {
        // Ignore network errors during signout
      }

      addToast({
        type: 'info',
        title: signOutAll ? 'Signed Out of All Devices' : 'Signed Out',
        message: signOutAll
          ? 'All active sessions across all devices have been terminated.'
          : 'You have been safely signed out.',
      });
    },
    [addToast]
  );

  const value = {
    currentUserRole,
    user,
    accessToken,
    isAuthenticated: currentUserRole !== null || accessToken !== null,
    isAuthModalOpen,
    authModalDefaultRole,
    isRoleSwitcherOpen,
    toasts,
    openAuthModal,
    closeAuthModal,
    openRoleSwitcher,
    closeRoleSwitcher,
    loginAs,
    setAuthSession,
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
