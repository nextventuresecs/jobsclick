'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CREDIT_PACKS,
  type CreditPackDefinition,
  isValidGstin,
} from '@indian-job-portal/validation';
import {
  CreditCard,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  X,
  Sparkles,
  Receipt,
  Download,
  Loader2,
} from 'lucide-react';
import { useRazorpayCheckout, validateRazorpayKeyId } from './useRazorpayCheckout';
import { invalidateWalletBalance } from './useWalletBalance';

export { validateRazorpayKeyId };

export interface RechargeModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSuccess?: (newBalance: number) => void;
  readonly currentBalance?: number;
  readonly user?: {
    readonly id: string;
    readonly phone?: string;
    readonly email?: string | null;
    readonly fullName?: string;
    readonly companyName?: string;
  };
}

// Indian GST State Codes (2-digit)
export const INDIAN_GST_STATES: readonly { code: string; name: string }[] = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '19', name: 'West Bengal' },
  { code: '24', name: 'Gujarat' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
];

export const RechargeModal: React.FC<RechargeModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentBalance = 0,
  user,
}) => {
  const t = useTranslations('wallet');

  const [selectedPackId, setSelectedPackId] = useState<string>('pack_growth');
  const [hasGstin, setHasGstin] = useState<boolean>(false);
  const [billingGstin, setBillingGstin] = useState<string>('');
  const [billingName, setBillingName] = useState<string>(
    user?.companyName || user?.fullName || ''
  );
  const [billingEmail, setBillingEmail] = useState<string>(user?.email || '');
  const [billingPhone, setBillingPhone] = useState<string>(user?.phone || '');
  const [billingStateCode, setBillingStateCode] = useState<string>('27'); // Default to Maharashtra (SPACECRAFTZZ home state)
  const [billingAddress, setBillingAddress] = useState<string>('');
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false);
  const [formValidationMsg, setFormValidationMsg] = useState<string | null>(null);

  const { state, error, completedOrder, startCheckout, reset } = useRazorpayCheckout();

  if (!isOpen) return null;

  const selectedPack: CreditPackDefinition =
    CREDIT_PACKS[selectedPackId] ?? CREDIT_PACKS['pack_growth']!;

  const handleGstinChange = (raw: string) => {
    const formatted = raw.toUpperCase().trim();
    setBillingGstin(formatted);

    // Auto-detect State Code from first two digits of GSTIN
    if (formatted.length >= 2) {
      const code = formatted.slice(0, 2);
      if (INDIAN_GST_STATES.some((s) => s.code === code)) {
        setBillingStateCode(code);
      }
    }
  };

  const handleProceed = async () => {
    setFormValidationMsg(null);

    if (!termsAccepted) {
      setFormValidationMsg(t('termsRequired'));
      return;
    }

    if (hasGstin && billingGstin.trim()) {
      if (!isValidGstin(billingGstin.trim())) {
        setFormValidationMsg(t('invalidGstin'));
        return;
      }
    }

    const payload: Record<string, unknown> = {
      packId: selectedPack.id,
      termsVersion: 'v1.0',
      billingStateCode: billingStateCode || undefined,
      billingName: billingName.trim() || undefined,
      billingEmail: billingEmail.trim() || undefined,
      billingPhone: billingPhone.trim() || undefined,
      billingAddress: billingAddress.trim() || undefined,
      billingGstin: hasGstin && billingGstin.trim() ? billingGstin.trim() : undefined,
    };

    await startCheckout({
      createOrderUrl: '/api/wallet/create-order',
      createOrderPayload: payload,
      verifyUrl: '/api/wallet/verify',
      prefill: {
        name: billingName || user?.companyName || user?.fullName,
        email: billingEmail || user?.email || undefined,
        contact: billingPhone || user?.phone,
      },
      initialBalance: currentBalance,
      onSuccess: () => {
        invalidateWalletBalance();
        onSuccess?.(currentBalance + selectedPack.credits);
      },
    });
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleDownloadInvoice = () => {
    if (!completedOrder) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    window.open(`${apiUrl}/wallet/invoice/${completedOrder.paymentId}/html`, '_blank');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-recharge-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          <div>
            <h2
              id="wallet-recharge-title"
              className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2"
            >
              <CreditCard className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              <span>{t('title')}</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              <span>{t('subtitle')}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t('close')}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Error Banner */}
          {(error || formValidationMsg) && (
            <div
              role="alert"
              className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-xl border border-red-200 dark:border-red-900 text-sm"
            >
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{formValidationMsg || error || t('paymentFailed')}</span>
            </div>
          )}

          {/* SUCCESS STATE */}
          {state === 'success' && completedOrder ? (
            <div className="text-center py-8 space-y-6">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto ring-8 ring-emerald-50 dark:ring-emerald-900/30">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {t('paymentSuccess')}
                </h3>
                <p className="text-slate-600 dark:text-slate-300 mt-2 text-sm">
                  {t('creditsAdded', { count: selectedPack.credits })}
                </p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 inline-block text-left text-sm space-y-1.5 min-w-[280px]">
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500 dark:text-slate-400">{t('orderIdLabel')}:</span>
                  <span className="font-mono font-medium text-slate-700 dark:text-slate-200">
                    {completedOrder.orderId}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500 dark:text-slate-400">{t('paymentIdLabel')}:</span>
                  <span className="font-mono font-medium text-slate-700 dark:text-slate-200">
                    {completedOrder.paymentId}
                  </span>
                </div>
                <div className="flex justify-between gap-4 pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500 dark:text-slate-400">{t('updatedBalance')}:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {currentBalance + selectedPack.credits} {t('credits')}
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleDownloadInvoice}
                  className="w-full sm:w-auto px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition shadow-xs text-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>{t('downloadInvoice')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full sm:w-auto px-6 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium rounded-xl transition text-sm"
                >
                  <span>{t('close')}</span>
                </button>
              </div>
            </div>
          ) : state === 'pending_long' && completedOrder ? (
            /* PENDING LONG STATE */
            <div className="text-center py-8 space-y-6">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center mx-auto ring-8 ring-amber-50 dark:ring-amber-900/30">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>

              <div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {t('pendingLongTitle')}
                </h3>
                <p className="text-slate-600 dark:text-slate-300 mt-2 text-sm max-w-md mx-auto">
                  {t('pendingLongDesc', { orderId: completedOrder.orderId })}
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-6 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium rounded-xl transition text-sm"
                >
                  <span>{t('close')}</span>
                </button>
              </div>
            </div>
          ) : (
            /* MAIN SELECTION AND CHECKOUT VIEW */
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

              {/* Credit Packs Grid */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
                  {t('selectPack')}
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {Object.values(CREDIT_PACKS).map((pack) => {
                    const isSelected = selectedPackId === pack.id;
                    const pricePerCredit = Math.round(pack.priceInr / pack.credits);

                    return (
                      <div
                        key={pack.id}
                        role="radio"
                        aria-checked={isSelected}
                        tabIndex={0}
                        onClick={() => setSelectedPackId(pack.id)}
                        onKeyDown={(e) => {
                          if (e.key === ' ' || e.key === 'Enter') {
                            e.preventDefault();
                            setSelectedPackId(pack.id);
                          }
                        }}
                        className={`relative p-4 rounded-xl cursor-pointer border-2 transition-all flex flex-col justify-between ${
                          isSelected
                            ? 'border-sky-600 dark:border-sky-400 bg-sky-50/40 dark:bg-sky-950/30 shadow-md ring-2 ring-sky-600/10'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800'
                        }`}
                      >
                        {pack.popular && (
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold rounded-full uppercase tracking-wider flex items-center gap-1 shadow-xs">
                            <Sparkles className="w-3 h-3" />
                            <span>{t('popular')}</span>
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
                            ₹{pricePerCredit} / {t('credits')}
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60">
                          <div className="text-base font-bold text-slate-900 dark:text-white">
                            ₹{pack.totalAmountInr}
                          </div>
                          <div className="text-[11px] text-slate-400 dark:text-slate-500">
                            {t('gst')}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Ruling O1: Enterprise SaaS Style GST Toggle */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasGstin}
                    onChange={(e) => setHasGstin(e.target.checked)}
                    className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500"
                  />
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-sky-600" />
                    <span>{t('gstCheckbox')}</span>
                  </span>
                </label>

                {hasGstin && (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-3 animate-in fade-in duration-150">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          {t('billingGstin')}
                        </label>
                        <input
                          type="text"
                          value={billingGstin}
                          onChange={(e) => handleGstinChange(e.target.value)}
                          placeholder="27AABCU9603R1ZM"
                          maxLength={15}
                          className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white uppercase font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          {t('billingName')}
                        </label>
                        <input
                          type="text"
                          value={billingName}
                          onChange={(e) => setBillingName(e.target.value)}
                          placeholder="e.g. Acme Industries Pvt Ltd"
                          className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white"
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          {t('billingState')}
                        </label>
                        <select
                          value={billingStateCode}
                          onChange={(e) => setBillingStateCode(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white"
                        >
                          {INDIAN_GST_STATES.map((s) => (
                            <option key={s.code} value={s.code}>
                              {s.code} - {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          {t('billingAddress')}
                        </label>
                        <input
                          type="text"
                          value={billingAddress}
                          onChange={(e) => setBillingAddress(e.target.value)}
                          placeholder="Registered Address"
                          className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Price Breakdown */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 text-sm space-y-2">
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>
                    {t('subtotal')} ({selectedPack.name})
                  </span>
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

              {/* Versioned Terms Acceptance Checkbox */}
              <div className="space-y-3 pt-1">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="w-4 h-4 mt-0.5 text-sky-600 rounded border-slate-300 focus:ring-sky-500"
                  />
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    {t('termsCheckbox')}
                  </span>
                </label>

                {/* Ruling O7: Supplier Entity Notice */}
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  {t('supplierLegalNotice')}
                </p>

                {/* Action CTA Button */}
                <button
                  type="button"
                  onClick={handleProceed}
                  disabled={
                    !termsAccepted ||
                    state === 'creating' ||
                    state === 'checkout' ||
                    state === 'verifying' ||
                    state === 'crediting'
                  }
                  className="w-full py-3.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-bold rounded-xl transition shadow-md flex items-center justify-center gap-2 text-base cursor-pointer disabled:cursor-not-allowed"
                >
                  {state === 'creating' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{t('processing')}</span>
                    </>
                  ) : state === 'verifying' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{t('verifyingPayment')}</span>
                    </>
                  ) : state === 'crediting' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{t('creditingWallet')}</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5" />
                      <span>
                        {t('proceedToPay')} (₹{selectedPack.totalAmountInr})
                      </span>
                    </>
                  )}
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
