'use client';

import { useState, useEffect, useCallback } from 'react';

// Global listener set for cross-component cache invalidation (e.g. Header badge & RechargeModal)
const balanceListeners = new Set<() => void>();

/**
 * Triggers a refetch of all mounted useWalletBalance hooks across the application.
 */
export function invalidateWalletBalance(): void {
  balanceListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignore listener error
    }
  });
}

export interface UseWalletBalanceResult {
  readonly balance: number | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly refetch: () => Promise<void>;
  readonly mutate: (newBalance?: number) => void;
}

/**
 * Shared hook to read and observe the current user's dynamically calculated wallet balance.
 * Strictly derives balance from server-side credit ledger via BFF /api/wallet/balance (Hard Invariant #7).
 */
export function useWalletBalance(): UseWalletBalanceResult {
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch('/api/wallet/balance', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (!res.ok) {
        if (res.status === 401) {
          setBalance(null);
          return;
        }
        const data = await res.json().catch(() => ({}));
        throw new Error(data.code || 'FAILED_TO_FETCH_BALANCE');
      }

      const data = await res.json();
      setBalance(typeof data.balance === 'number' ? data.balance : 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'FAILED_TO_FETCH_BALANCE');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
    balanceListeners.add(fetchBalance);
    return () => {
      balanceListeners.delete(fetchBalance);
    };
  }, [fetchBalance]);

  const mutate = useCallback(
    (newBalance?: number) => {
      if (typeof newBalance === 'number') {
        setBalance(newBalance);
      } else {
        fetchBalance();
      }
    },
    [fetchBalance]
  );

  return {
    balance,
    isLoading,
    error,
    refetch: fetchBalance,
    mutate,
  };
}
