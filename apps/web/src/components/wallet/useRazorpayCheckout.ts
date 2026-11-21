'use client';

import { useState, useCallback, useRef } from 'react';
import { invalidateWalletBalance } from './useWalletBalance';

export type CheckoutState =
  | 'idle'
  | 'creating'
  | 'checkout'
  | 'verifying'
  | 'crediting'
  | 'success'
  | 'pending_long'
  | 'error';

export interface RazorpayPrefill {
  name?: string;
  email?: string;
  contact?: string;
}

export interface StartCheckoutOptions {
  createOrderUrl?: string;
  createOrderPayload: Record<string, unknown>;
  verifyUrl?: string;
  prefill?: RazorpayPrefill;
  initialBalance?: number;
  onSuccess?: (details: { orderId: string; paymentId: string }) => void;
  customPollStatus?: () => Promise<boolean>;
}

export interface CompletedOrderDetails {
  orderId: string;
  paymentId: string;
}

export interface CheckoutOutcome {
  state: CheckoutState;
  error: string | null;
  completedOrder: CompletedOrderDetails | null;
}

export interface UseRazorpayCheckoutResult {
  state: CheckoutState;
  error: string | null;
  completedOrder: CompletedOrderDetails | null;
  getState: () => CheckoutState;
  getError: () => string | null;
  startCheckout: (options: StartCheckoutOptions) => Promise<CheckoutOutcome>;
  reset: () => void;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (response: { error?: { code?: string; description?: string } }) => void) => void;
}

interface RazorpayConstructor {
  new (options: Record<string, unknown>): RazorpayInstance;
}

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

export function validateRazorpayKeyId(keyId?: string): string {
  if (!keyId || typeof keyId !== 'string' || keyId.trim() === '' || keyId === 'rzp_test_dummy_key_id') {
    throw new Error('Valid Razorpay gateway keyId was not returned from order creation');
  }
  return keyId;
}

/**
 * Dynamically loads Razorpay checkout SDK script only when checkout is opened.
 */
export function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (typeof document === 'undefined') return Promise.resolve(false);

  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
    );
    if (existing) {
      if (window.Razorpay) return resolve(true);
      existing.addEventListener('load', () => resolve(true), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useRazorpayCheckout(): UseRazorpayCheckoutResult {
  const [state, setState] = useState<CheckoutState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [completedOrder, setCompletedOrder] = useState<CompletedOrderDetails | null>(null);

  const stateRef = useRef<CheckoutState>('idle');
  const errorRef = useRef<string | null>(null);
  const completedOrderRef = useRef<CompletedOrderDetails | null>(null);
  const isExecutingRef = useRef(false);

  const setInternalState = (newState: CheckoutState) => {
    stateRef.current = newState;
    setState(newState);
  };

  const setInternalError = (newError: string | null) => {
    errorRef.current = newError;
    setError(newError);
  };

  const setInternalCompletedOrder = (order: CompletedOrderDetails | null) => {
    completedOrderRef.current = order;
    setCompletedOrder(order);
  };

  const reset = useCallback(() => {
    setInternalState('idle');
    setInternalError(null);
    setInternalCompletedOrder(null);
    isExecutingRef.current = false;
  }, []);

  const pollSettlement = useCallback(
    async (
      orderId: string,
      paymentId: string,
      initialBalance: number | undefined,
      customPollStatus?: () => Promise<boolean>,
      onSuccess?: (details: { orderId: string; paymentId: string }) => void
    ): Promise<CheckoutOutcome> => {
      setInternalState('crediting');
      const startTime = Date.now();
      const maxDurationMs = 30000; // 30 seconds max polling window
      const intervals = [1000, 2000, 4000, 8000, 15000];
      let intervalIndex = 0;

      while (Date.now() - startTime < maxDurationMs) {
        const sleepMs = intervals[intervalIndex] || 10000;
        await delay(sleepMs);
        intervalIndex++;

        try {
          if (customPollStatus) {
            const isDone = await customPollStatus();
            if (isDone) {
              invalidateWalletBalance();
              const order = { orderId, paymentId };
              setInternalCompletedOrder(order);
              setInternalState('success');
              onSuccess?.(order);
              return { state: 'success', error: null, completedOrder: order };
            }
          } else {
            const res = await fetch('/api/wallet/balance', {
              headers: { Accept: 'application/json' },
              cache: 'no-store',
            });
            if (res.ok) {
              const data = await res.json();
              if (
                typeof data?.balance === 'number' &&
                (initialBalance === undefined || data.balance > initialBalance)
              ) {
                invalidateWalletBalance();
                const order = { orderId, paymentId };
                setInternalCompletedOrder(order);
                setInternalState('success');
                onSuccess?.(order);
                return { state: 'success', error: null, completedOrder: order };
              }
            }
          }
        } catch {
          // Retry next interval
        }
      }

      // If still pending after 30 seconds, transition to pending_long
      const order = { orderId, paymentId };
      setInternalCompletedOrder(order);
      setInternalState('pending_long');
      return { state: 'pending_long', error: null, completedOrder: order };
    },
    []
  );

  const startCheckout = useCallback(
    async (options: StartCheckoutOptions): Promise<CheckoutOutcome> => {
      // Prevent double invocation
      if (isExecutingRef.current) {
        return {
          state: stateRef.current,
          error: errorRef.current,
          completedOrder: completedOrderRef.current,
        };
      }
      isExecutingRef.current = true;

      try {
        setInternalState('creating');
        setInternalError(null);
        setInternalCompletedOrder(null);

        // 1. Ensure Razorpay Checkout SDK is loaded
        const scriptLoaded = await loadRazorpayScript();
        if (!scriptLoaded || !window.Razorpay) {
          throw new Error('RAZORPAY_SDK_LOAD_FAILED');
        }

        // 2. Create order via BFF Route Handler
        const createUrl = options.createOrderUrl || '/api/wallet/create-order';
        const orderRes = await fetch(createUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(options.createOrderPayload),
        });

        if (!orderRes.ok) {
          const errData = await orderRes.json().catch(() => ({}));
          throw new Error(errData.code || 'ORDER_CREATION_FAILED');
        }

        const orderData = await orderRes.json();
        const keyId = validateRazorpayKeyId(orderData.keyId);
        const orderId = orderData.orderId;

        if (!orderId || typeof orderId !== 'string') {
          throw new Error('INVALID_ORDER_ID');
        }

        // 3. Launch Razorpay modal
        setInternalState('checkout');

        return new Promise<CheckoutOutcome>((resolve) => {
          const razorpayOptions = {
            key: keyId,
            amount: orderData.amount, // in paise
            currency: orderData.currency || 'INR',
            name: 'JobsClick',
            description: orderData.description || 'Wallet Recharge',
            order_id: orderId,
            prefill: {
              name: options.prefill?.name || '',
              email: options.prefill?.email || '',
              contact: options.prefill?.contact || '',
            },
            theme: {
              color: '#0284c7',
            },
            modal: {
              ondismiss: () => {
                isExecutingRef.current = false;
                setInternalState('idle');
                resolve({ state: 'idle', error: null, completedOrder: null });
              },
            },
            handler: async (response: {
              razorpay_order_id: string;
              razorpay_payment_id: string;
              razorpay_signature: string;
            }) => {
              try {
                setInternalState('verifying');

                const verifyUrl = options.verifyUrl || '/api/wallet/verify';
                const verifyRes = await fetch(verifyUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                  },
                  body: JSON.stringify({
                    razorpayOrderId: response.razorpay_order_id,
                    razorpayPaymentId: response.razorpay_payment_id,
                    razorpaySignature: response.razorpay_signature,
                  }),
                });

                if (!verifyRes.ok) {
                  const errData = await verifyRes.json().catch(() => ({}));
                  throw new Error(errData.code || 'PAYMENT_VERIFICATION_FAILED');
                }

                const verifyData = await verifyRes.json();

                if (verifyData.status === 'settled') {
                  invalidateWalletBalance();
                  const completed = {
                    orderId: response.razorpay_order_id,
                    paymentId: response.razorpay_payment_id,
                  };
                  setInternalCompletedOrder(completed);
                  setInternalState('success');
                  options.onSuccess?.(completed);
                  resolve({ state: 'success', error: null, completedOrder: completed });
                } else {
                  // Pending status: begin backoff polling
                  const pollResult = await pollSettlement(
                    response.razorpay_order_id,
                    response.razorpay_payment_id,
                    options.initialBalance,
                    options.customPollStatus,
                    options.onSuccess
                  );
                  resolve(pollResult);
                }
              } catch (err) {
                const errMsg =
                  err instanceof Error ? err.message : 'PAYMENT_VERIFICATION_FAILED';
                setInternalState('error');
                setInternalError(errMsg);
                resolve({ state: 'error', error: errMsg, completedOrder: null });
              } finally {
                isExecutingRef.current = false;
              }
            },
          };

          const RazorpayConstructor = window.Razorpay;
          if (!RazorpayConstructor) {
            throw new Error('RAZORPAY_SDK_LOAD_FAILED');
          }
          const rzp = new RazorpayConstructor(razorpayOptions);
          rzp.on('payment.failed', (resp) => {
            isExecutingRef.current = false;
            const errMsg =
              resp.error?.description || resp.error?.code || 'PAYMENT_FAILED';
            setInternalState('error');
            setInternalError(errMsg);
            resolve({ state: 'error', error: errMsg, completedOrder: null });
          });
          rzp.open();
        });
      } catch (err) {
        isExecutingRef.current = false;
        const errMsg = err instanceof Error ? err.message : 'PAYMENT_FAILED';
        setInternalState('error');
        setInternalError(errMsg);
        return { state: 'error', error: errMsg, completedOrder: null };
      }
    },
    [pollSettlement]
  );

  return {
    state,
    error,
    completedOrder,
    getState: () => stateRef.current,
    getError: () => errorRef.current,
    startCheckout,
    reset,
  };
}
