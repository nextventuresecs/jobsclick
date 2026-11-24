import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RechargeModal, validateRazorpayKeyId } from '../src/components/wallet/RechargeModal';
import { useRazorpayCheckout } from '../src/components/wallet/useRazorpayCheckout';

// Ensure window object exists in Node test environment
if (typeof (globalThis as Record<string, unknown>).window === 'undefined') {
  (globalThis as Record<string, unknown>).window = globalThis;
}

// Mock next-intl translations
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
}));

describe('RechargeModal & Razorpay Checkout State Machine', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
    delete (window as unknown as Record<string, unknown>).Razorpay;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('RechargeModal Rendering & Invariants', () => {
    it('returns null when isOpen is false', () => {
      const html = renderToStaticMarkup(
        <RechargeModal isOpen={false} onClose={vi.fn()} currentBalance={50} />
      );
      expect(html).toBe('');
    });

    it('renders modal dialog, balance, credit packs, GST toggle, and versioned terms when isOpen is true', () => {
      const html = renderToStaticMarkup(
        <RechargeModal isOpen={true} onClose={vi.fn()} currentBalance={100} />
      );

      // Verify accessibility dialog
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-labelledby="wallet-recharge-title"');

      // Verify packs rendered
      expect(html).toContain('Growth Pack');
      expect(html).toContain('Starter Pack');
      expect(html).toContain('Enterprise Pack');

      // Verify Enterprise SaaS GST toggle and terms
      expect(html).toContain('gstCheckbox');
      expect(html).toContain('termsCheckbox');

      // Verify Supplier legal notice (Ruling O7: SPACECRAFTZZ)
      expect(html).toContain('supplierLegalNotice');

      // Verify no prohibited markers or fake simulation
      expect(html).not.toContain('NEXT_PUBLIC_RAZORPAY_KEY_ID');
      expect(html).not.toContain('Fallback simulation');
      expect(html).not.toContain('DIRECT_WEB_');
    });

    it('validates keyId correctly using validateRazorpayKeyId', () => {
      expect(() => validateRazorpayKeyId()).toThrow(/Valid Razorpay gateway keyId was not returned/);
      expect(() => validateRazorpayKeyId('')).toThrow(/Valid Razorpay gateway keyId was not returned/);
      expect(() => validateRazorpayKeyId('   ')).toThrow(/Valid Razorpay gateway keyId was not returned/);
      expect(() => validateRazorpayKeyId('rzp_test_dummy_key_id')).toThrow(
        /Valid Razorpay gateway keyId was not returned/
      );
      expect(validateRazorpayKeyId('rzp_test_valid_key_123')).toBe('rzp_test_valid_key_123');
    });
  });

  describe('useRazorpayCheckout State Machine Flow', () => {
    it('initializes in idle state and resets cleanly', () => {
      let hookResult: ReturnType<typeof useRazorpayCheckout> | undefined;

      function TestComponent() {
        hookResult = useRazorpayCheckout();
        return null;
      }

      renderToStaticMarkup(<TestComponent />);
      expect(hookResult?.getState()).toBe('idle');
      expect(hookResult?.getError()).toBeNull();
      expect(hookResult?.completedOrder).toBeNull();
    });

    it('handles successful checkout: idle -> creating -> checkout -> verifying -> success', async () => {
      let capturedOptions: Record<string, unknown> | undefined;
      let paymentSuccessHandler:
        | ((resp: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => Promise<void>)
        | undefined;

      // Mock window.Razorpay constructor
      window.Razorpay = vi.fn().mockImplementation((options) => {
        capturedOptions = options;
        paymentSuccessHandler = options.handler;
        return {
          open: vi.fn(),
          on: vi.fn(),
        };
      }) as unknown as typeof window.Razorpay;

      // Mock create-order and verify API responses
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/api/wallet/create-order')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              orderId: 'order_rzp_mock_123',
              keyId: 'rzp_test_live_key_999',
              amount: 212400,
              currency: 'INR',
              description: 'Growth Pack',
            }),
          };
        }
        if (url.includes('/api/wallet/verify')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: 'settled',
              balance: 300,
            }),
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      });

      let hook: ReturnType<typeof useRazorpayCheckout> | undefined;
      function TestComponent() {
        hook = useRazorpayCheckout();
        return null;
      }
      renderToStaticMarkup(<TestComponent />);

      // Launch checkout
      const checkoutPromise = hook!.startCheckout({
        createOrderUrl: '/api/wallet/create-order',
        createOrderPayload: { packId: 'pack_growth', termsVersion: 'v1.0' },
        verifyUrl: '/api/wallet/verify',
      });

      // Wait a microtask for create-order to finish and Razorpay modal to open
      await new Promise((r) => setTimeout(r, 10));

      expect(window.Razorpay).toHaveBeenCalledTimes(1);
      expect(capturedOptions?.order_id).toBe('order_rzp_mock_123');
      expect(capturedOptions?.key).toBe('rzp_test_live_key_999');
      expect(hook!.getState()).toBe('checkout');

      // Trigger payment handler callback
      expect(paymentSuccessHandler).toBeDefined();
      await paymentSuccessHandler!({
        razorpay_order_id: 'order_rzp_mock_123',
        razorpay_payment_id: 'pay_rzp_mock_456',
        razorpay_signature: 'sig_valid_789',
      });

      const outcome = await checkoutPromise;
      expect(outcome.state).toBe('success');
      expect(outcome.completedOrder?.orderId).toBe('order_rzp_mock_123');
      expect(outcome.completedOrder?.paymentId).toBe('pay_rzp_mock_456');
      expect(hook!.getState()).toBe('success');
    });

    it('handles modal dismiss without payment: resets to idle', async () => {
      let onDismissHandler: (() => void) | undefined;

      window.Razorpay = vi.fn().mockImplementation((options) => {
        onDismissHandler = options.modal?.ondismiss;
        return { open: vi.fn(), on: vi.fn() };
      }) as unknown as typeof window.Razorpay;

      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          orderId: 'order_dismiss_123',
          keyId: 'rzp_test_live_key_999',
          amount: 59000,
          currency: 'INR',
        }),
      }));

      let hook: ReturnType<typeof useRazorpayCheckout> | undefined;
      function TestComponent() {
        hook = useRazorpayCheckout();
        return null;
      }
      renderToStaticMarkup(<TestComponent />);

      const checkoutPromise = hook!.startCheckout({
        createOrderUrl: '/api/wallet/create-order',
        createOrderPayload: { packId: 'pack_starter', termsVersion: 'v1.0' },
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(hook!.getState()).toBe('checkout');

      // Simulate user closing the Razorpay modal
      onDismissHandler!();

      const outcome = await checkoutPromise;
      expect(outcome.state).toBe('idle');
      expect(hook!.getState()).toBe('idle');
    });

    it('handles create-order 401 error: transitions to error state', async () => {
      window.Razorpay = vi.fn();

      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ code: 'UNAUTHORIZED' }),
      }));

      let hook: ReturnType<typeof useRazorpayCheckout> | undefined;
      function TestComponent() {
        hook = useRazorpayCheckout();
        return null;
      }
      renderToStaticMarkup(<TestComponent />);

      const outcome = await hook!.startCheckout({
        createOrderUrl: '/api/wallet/create-order',
        createOrderPayload: { packId: 'pack_growth', termsVersion: 'v1.0' },
      });

      expect(outcome.state).toBe('error');
      expect(outcome.error).toBe('UNAUTHORIZED');
      expect(hook!.getState()).toBe('error');
      expect(hook!.getError()).toBe('UNAUTHORIZED');
      expect(window.Razorpay).not.toHaveBeenCalled();
    });

    it('handles create-order 429 rate limit error: transitions to error state', async () => {
      window.Razorpay = vi.fn();

      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 429,
        json: async () => ({ code: 'RATE_LIMITED' }),
      }));

      let hook: ReturnType<typeof useRazorpayCheckout> | undefined;
      function TestComponent() {
        hook = useRazorpayCheckout();
        return null;
      }
      renderToStaticMarkup(<TestComponent />);

      const outcome = await hook!.startCheckout({
        createOrderUrl: '/api/wallet/create-order',
        createOrderPayload: { packId: 'pack_growth', termsVersion: 'v1.0' },
      });

      expect(outcome.state).toBe('error');
      expect(outcome.error).toBe('RATE_LIMITED');
      expect(hook!.getState()).toBe('error');
      expect(hook!.getError()).toBe('RATE_LIMITED');
      expect(window.Razorpay).not.toHaveBeenCalled();
    });

    it('prevents double invocation (double-click creates only one order)', async () => {
      window.Razorpay = vi.fn().mockImplementation((options) => {
        setTimeout(() => options.modal?.ondismiss?.(), 0);
        return {
          open: vi.fn(),
          on: vi.fn(),
        };
      }) as unknown as typeof window.Razorpay;

      let createOrderCalls = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        createOrderCalls++;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            orderId: 'order_single_123',
            keyId: 'rzp_test_key_123',
            amount: 59000,
          }),
        };
      });

      let hook: ReturnType<typeof useRazorpayCheckout> | undefined;
      function TestComponent() {
        hook = useRazorpayCheckout();
        return null;
      }
      renderToStaticMarkup(<TestComponent />);

      // Fire two startCheckout calls concurrently
      const promise1 = hook!.startCheckout({
        createOrderPayload: { packId: 'pack_starter' },
      });
      const promise2 = hook!.startCheckout({
        createOrderPayload: { packId: 'pack_starter' },
      });

      await Promise.all([promise1, promise2]);

      expect(createOrderCalls).toBe(1);
    });
  });
});
