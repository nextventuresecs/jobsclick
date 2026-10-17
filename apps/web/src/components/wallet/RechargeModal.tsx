'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CREDIT_PACKS,
  type CreditPackDefinition,
} from '@indian-job-portal/validation';
import {
  CheckCircle,
  CreditCard,
  ShieldCheck,
  Download,
  X,
  AlertCircle,
  Sparkles,
  Receipt,
} from 'lucide-react';

interface RechargeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newBalance: number) => void;
  currentBalance?: number;
  user?: {
    id: string;
    phone?: string;
    email?: string | null;
    fullName?: string;
    companyName?: string;
  };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void;
}

interface RazorpayConstructor {
  new (options: Record<string, unknown>): RazorpayInstance;
}

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

export const RechargeModal: React.FC<RechargeModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentBalance = 0,
  user,
}) => {
  const t = useTranslations('wallet');

  const [selectedPackId, setSelectedPackId] = useState<string>('pack_growth');
  const [billingName, setBillingName] = useState(user?.companyName || user?.fullName || '');
  const [billingEmail, setBillingEmail] = useState(user?.email || '');
  const [billingPhone, setBillingPhone] = useState(user?.phone || '');
  const [billingAddress, setBillingAddress] = useState('');
  const [billingGstin, setBillingGstin] = useState('');
  const [showBilling, setShowBilling] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedPayment, setCompletedPayment] = useState<{
    orderId: string;
    paymentId: string;
    creditsAdded: number;
    newBalance: number;
    invoiceNumber: string;
    paymentRecordId: string;
  } | null>(null);

  if (!isOpen) return null;

  const selectedPack: CreditPackDefinition =
    CREDIT_PACKS[selectedPackId] ?? CREDIT_PACKS['pack_growth']!;

  // Load Razorpay Checkout SDK dynamically
  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window !== 'undefined' && window.Razorpay) {
        return resolve(true);
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleCheckout = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // 1. Load Razorpay SDK
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        setError(t('paymentFailed'));
        setIsLoading(false);
        return;
      }

      // 2. Create order on backend API
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const orderRes = await fetch(`${apiUrl}/wallet/recharge/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          packId: selectedPack.id,
          billingName: billingName || undefined,
          billingEmail: billingEmail || undefined,
          billingPhone: billingPhone || undefined,
          billingAddress: billingAddress || undefined,
          billingGstin: billingGstin.trim().toUpperCase() || undefined,
        }),
      });

      if (!orderRes.ok) {
        const errData = await orderRes.json().catch(() => ({}));
        throw new Error(errData.message || t('paymentFailed'));
      }

      const orderData = await orderRes.json();

      // 3. Launch Razorpay modal
      const keyId =
        orderData.keyId ||
        process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ||
        'rzp_test_dummy_key_id';

      const options = {
        key: keyId,
        amount: orderData.amount, // in paise
        currency: 'INR',
        name: 'Indian Job Portal',
        description: `${selectedPack.name} (${selectedPack.credits} Credits)`,
        order_id: orderData.orderId,
        prefill: {
          name: billingName || user?.companyName || user?.fullName || 'Employer',
          email: billingEmail || user?.email || '',
          contact: billingPhone || user?.phone || '',
        },
        theme: {
          color: '#0284c7', // Primary Sky-600
        },
        modal: {
          ondismiss: () => {
            setIsLoading(false);
          },
        },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            // 4. Verify payment with backend
            const verifyRes = await fetch(`${apiUrl}/wallet/recharge/verify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });

            if (!verifyRes.ok) {
              const err = await verifyRes.json().catch(() => ({}));
              throw new Error(err.message || t('paymentFailed'));
            }

            const verifiedData = await verifyRes.json();
            const calculatedNewBalance = currentBalance + selectedPack.credits;

            setCompletedPayment({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              creditsAdded: selectedPack.credits,
              newBalance: calculatedNewBalance,
              invoiceNumber: verifiedData.invoice?.invoiceNumber || '',
              paymentRecordId: verifiedData.payment?.id || response.razorpay_payment_id,
            });

            if (onSuccess) {
              onSuccess(calculatedNewBalance);
            }
          } catch (err: unknown) {
            setError(err instanceof Error ? err.message : t('paymentFailed'));
          } finally {
            setIsLoading(false);
          }
        },
      };

      if (!window.Razorpay) {
        throw new Error('Razorpay SDK failed to load. Please check your network connection.');
      }

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (resp: { error?: { description?: string } }) => {
        setError(resp.error?.description || t('paymentFailed'));
        setIsLoading(false);
      });
      rzp.open();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('paymentFailed'));
      setIsLoading(false);
    }
  };

  const handleDownloadInvoice = () => {
    if (!completedPayment) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    window.open(
      `${apiUrl}/wallet/invoice/${completedPayment.paymentRecordId}/html`,
      '_blank',
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              {t('title')}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {t('subtitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-xl border border-red-200 dark:border-red-900 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success State */}
          {completedPayment ? (
            <div className="text-center py-8 space-y-6">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto ring-8 ring-emerald-50 dark:ring-emerald-900/30">
                <CheckCircle className="w-10 h-10" />
              </div>

              <div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {t('paymentSuccess')}
                </h3>
                <p className="text-slate-600 dark:text-slate-300 mt-2">
                  {t('creditsAdded', { count: completedPayment.creditsAdded })}
                </p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 inline-block text-left text-sm space-y-1">
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Order ID: </span>
                  <span className="font-mono font-medium text-slate-700 dark:text-slate-200">
                    {completedPayment.orderId}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Payment ID: </span>
                  <span className="font-mono font-medium text-slate-700 dark:text-slate-200">
                    {completedPayment.paymentId}
                  </span>
                </div>
                {completedPayment.invoiceNumber && (
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Invoice #: </span>
                    <span className="font-mono font-semibold text-sky-600 dark:text-sky-400">
                      {completedPayment.invoiceNumber}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Updated Balance: </span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {completedPayment.newBalance} Credits
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  onClick={handleDownloadInvoice}
                  className="w-full sm:w-auto px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  {t('downloadInvoice')}
                </button>
                <button
                  onClick={onClose}
                  className="w-full sm:w-auto px-6 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium rounded-xl transition"
                >
                  {t('close')}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Current Balance Banner */}
              <div className="flex items-center justify-between p-4 bg-sky-50 dark:bg-sky-950/40 rounded-xl border border-sky-100 dark:border-sky-900">
                <span className="text-sm font-medium text-sky-900 dark:text-sky-200">
                  {t('currentBalance')}
                </span>
                <span className="text-lg font-bold text-sky-700 dark:text-sky-300">
                  {currentBalance} {t('credits')}
                </span>
              </div>

              {/* Credit Packs Selection */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">
                  {t('selectPack')}
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {Object.values(CREDIT_PACKS).map((pack) => {
                    const isSelected = selectedPackId === pack.id;
                    const pricePerCredit = Math.round(pack.priceInr / pack.credits);

                    return (
                      <div
                        key={pack.id}
                        onClick={() => setSelectedPackId(pack.id)}
                        className={`relative p-4 rounded-xl cursor-pointer border-2 transition-all flex flex-col justify-between ${
                          isSelected
                            ? 'border-sky-600 dark:border-sky-400 bg-sky-50/40 dark:bg-sky-950/30 shadow-md ring-2 ring-sky-600/10'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800'
                        }`}
                      >
                        {pack.popular && (
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[11px] font-bold rounded-full uppercase tracking-wider flex items-center gap-1 shadow-sm">
                            <Sparkles className="w-3 h-3" />
                            {t('popular')}
                          </div>
                        )}

                        <div>
                          <div className="font-bold text-slate-900 dark:text-white text-base">
                            {pack.name}
                          </div>
                          <div className="text-2xl font-extrabold text-sky-700 dark:text-sky-300 mt-1">
                            {pack.credits}
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1">
                              {t('credits')}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            ₹{pricePerCredit} / credit
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60">
                          <div className="text-base font-bold text-slate-900 dark:text-white">
                            ₹{pack.totalAmountInr}
                          </div>
                          <div className="text-[11px] text-slate-400 dark:text-slate-500">
                            (incl. 18% GST)
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Collapsible Billing Details */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowBilling(!showBilling)}
                  className="w-full flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-750 transition"
                >
                  <span className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-sky-600" />
                    {t('billingDetails')}
                  </span>
                  <span className="text-xs text-sky-600 dark:text-sky-400 font-semibold">
                    {showBilling ? '▲ Hide' : '▼ Add GSTIN / Billing Address'}
                  </span>
                </button>

                {showBilling && (
                  <div className="p-4 space-y-3 bg-white dark:bg-slate-850">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          {t('billingName')}
                        </label>
                        <input
                          type="text"
                          value={billingName}
                          onChange={(e) => setBillingName(e.target.value)}
                          placeholder="e.g. Acme Enterprises Pvt Ltd"
                          className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          {t('billingGstin')}
                        </label>
                        <input
                          type="text"
                          value={billingGstin}
                          onChange={(e) => setBillingGstin(e.target.value.toUpperCase())}
                          placeholder="e.g. 23AAAAA0000A1Z5"
                          maxLength={15}
                          className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white uppercase font-mono"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          {t('billingEmail')}
                        </label>
                        <input
                          type="email"
                          value={billingEmail}
                          onChange={(e) => setBillingEmail(e.target.value)}
                          placeholder="accounts@example.com"
                          className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          {t('billingPhone')}
                        </label>
                        <input
                          type="tel"
                          value={billingPhone}
                          onChange={(e) => setBillingPhone(e.target.value)}
                          placeholder="+919876543210"
                          className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        {t('billingAddress')}
                      </label>
                      <input
                        type="text"
                        value={billingAddress}
                        onChange={(e) => setBillingAddress(e.target.value)}
                        placeholder="Registered business address"
                        className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Price Breakdown */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 text-sm space-y-2">
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>{t('subtotal')} ({selectedPack.name})</span>
                  <span>₹{selectedPack.priceInr.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>
                    {t('gst')} <span className="text-xs text-slate-400">(SAC: 998311)</span>
                  </span>
                  <span>₹{selectedPack.gstAmountInr.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-700 text-base">
                  <span>{t('total')}</span>
                  <span>₹{selectedPack.totalAmountInr.toFixed(2)}</span>
                </div>
              </div>

              {/* Action Button */}
              <div className="space-y-3 pt-2">
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={isLoading}
                  className="w-full py-3.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-bold rounded-xl transition shadow-md flex items-center justify-center gap-2 text-base cursor-pointer"
                >
                  <CreditCard className="w-5 h-5" />
                  {isLoading ? t('processing') : `${t('proceedToPay')} (₹${selectedPack.totalAmountInr})`}
                </button>

                <div className="flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{t('securePayment')}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RechargeModal;
