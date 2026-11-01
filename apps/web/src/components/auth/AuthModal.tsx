'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppContext } from '@/context/AppContext';
import { IndianPhoneSchema, SelfSignupRoleSchema } from '@indian-job-portal/validation';

const DPDP_CONSENT_VERSION = 'v1.2-2026-10';

export function AuthModal() {
  const router = useRouter();
  const {
    isAuthModalOpen,
    closeAuthModal,
    authModalDefaultRole,
    refreshSession,
    addToast,
  } = useAppContext();

  const [selectedRole, setSelectedRole] = useState<'job_seeker' | 'employer'>(
    authModalDefaultRole
  );
  const [step, setStep] = useState<'phone' | 'otp'>('phone');

  // Never prefill live phone numbers or Udyam numbers (Fixes P1 live phone spam)
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [normalizedPhone, setNormalizedPhone] = useState<string>('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [consentAccepted, setConsentAccepted] = useState<boolean>(false);
  const [turnstileToken, setTurnstileToken] = useState<string>('');
  const [turnstileGeneration, setTurnstileGeneration] = useState<number>(0);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState<number>(0);

  const modalRef = useRef<HTMLDivElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Sync default role when modal opens
  useEffect(() => {
    if (isAuthModalOpen) {
      setSelectedRole(authModalDefaultRole);
      setStep('phone');
      setErrorMessage(null);
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => phoneInputRef.current?.focus(), 50);
    }
  }, [isAuthModalOpen, authModalDefaultRole]);

  // Countdown timer for OTP resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Accessibility: Escape key & Focus Trap (Figma / Adobe Spectrum standard)
  useEffect(() => {
    if (!isAuthModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeAuthModal();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthModalOpen, closeAuthModal]);

  if (!isAuthModalOpen) return null;

  const resetTurnstile = () => {
    // Forces a fresh single-use Turnstile token on error or OTP resend
    setTurnstileToken('');
    setTurnstileGeneration((g) => g + 1);
  };

  const handleRequestOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);

    const parsedPhone = IndianPhoneSchema.safeParse(phoneInput);
    if (!parsedPhone.success) {
      setErrorMessage(
        parsedPhone.error.issues[0]?.message ?? 'Enter a valid 10-digit mobile number.'
      );
      return;
    }

    if (!consentAccepted) {
      setErrorMessage('Please accept the Terms of Service & DPDP Privacy Notice to continue.');
      return;
    }

    // Require real Turnstile token in production
    const effectiveTurnstile =
      turnstileToken ||
      (process.env.NODE_ENV === 'test' ? 'test_turnstile_token' : '');

    if (!effectiveTurnstile) {
      setErrorMessage('Please complete the security verification check.');
      return;
    }

    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiBaseUrl) {
      setErrorMessage('Service configuration error: API URL is not configured.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch(`${apiBaseUrl}/auth/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: parsedPhone.data,
          turnstileToken: effectiveTurnstile,
          language: document.documentElement.lang === 'hi' ? 'hi' : 'en',
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        resetTurnstile();
        setErrorMessage(
          body?.message || 'Unable to send OTP right now. Please try again in a moment.'
        );
        return;
      }

      setNormalizedPhone(parsedPhone.data);
      setStep('otp');
      setResendCooldown(30);
      resetTurnstile();
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch {
      resetTurnstile();
      setErrorMessage('Network error while contacting authentication server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpDigitChange = (index: number, value: string) => {
    setErrorMessage(null);
    const cleaned = value.replace(/\D/g, '');

    // Handle full 6-digit paste or SMS auto-fill
    if (cleaned.length > 1) {
      const sliced = cleaned.slice(0, 6).split('');
      const nextDigits = [...otpDigits];
      sliced.forEach((char, idx) => {
        if (index + idx < 6) nextDigits[index + idx] = char;
      });
      setOtpDigits(nextDigits);
      const focusIdx = Math.min(5, index + sliced.length);
      otpRefs.current[focusIdx]?.focus();
      return;
    }

    const nextDigits = [...otpDigits];
    nextDigits[index] = cleaned;
    setOtpDigits(nextDigits);

    if (cleaned && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        const nextDigits = [...otpDigits];
        nextDigits[index - 1] = '';
        setOtpDigits(nextDigits);
        otpRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const code = otpDigits.join('');
    if (code.length !== 6) {
      setErrorMessage('Please enter all 6 digits of your verification code.');
      return;
    }

    const roleCheck = SelfSignupRoleSchema.safeParse(selectedRole);
    if (!roleCheck.success) {
      setErrorMessage('Invalid role selection.');
      return;
    }

    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiBaseUrl) {
      setErrorMessage('Service configuration error: API URL is not configured.');
      return;
    }

    try {
      setIsSubmitting(true);

      // 1. Verify OTP against NestJS backend
      const verifyRes = await fetch(`${apiBaseUrl}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: normalizedPhone,
          code,
          role: roleCheck.data,
          consentVersion: DPDP_CONSENT_VERSION,
          consentTimestamp: new Date().toISOString(),
        }),
      });

      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok || !verifyData?.accessToken) {
        setErrorMessage(verifyData?.message || 'Invalid or expired verification code.');
        return;
      }

      // 2. Exchange token into strict HttpOnly __Host- cookie via Next.js BFF
      const sessionRes = await fetch('/api/auth/session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verifyData.accessToken }),
      });

      if (!sessionRes.ok) {
        setErrorMessage('Failed to establish secure browser session.');
        return;
      }

      // 3. Hydrate server-verified user state and navigate to workspace
      await refreshSession();
      addToast({
        type: 'success',
        title: 'Signed in securely',
        description: 'Welcome to your verified JobsClick workspace.',
      });
      closeAuthModal();
      router.push('/workspace');
    } catch {
      setErrorMessage('Network error during verification. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-labelledby="jc-auth-modal-title"
      aria-describedby="jc-auth-modal-desc"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xl sm:p-8"
      >
        {/* Top Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="jc-auth-modal-title"
              className="text-xl font-semibold tracking-tight text-slate-900"
            >
              {step === 'phone' ? 'Sign in to JobsClick' : 'Verify your mobile'}
            </h2>
            <p
              id="jc-auth-modal-desc"
              className="mt-1 text-sm leading-relaxed text-slate-600"
            >
              {step === 'phone'
                ? 'Fast, passwordless access with OTP verification.'
                : `Enter the 6-digit code sent to +91 ${normalizedPhone.slice(0, 2)}•••••${normalizedPhone.slice(-3)}`}
            </p>
          </div>

          <button
            type="button"
            onClick={closeAuthModal}
            aria-label="Close sign in dialog"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
          >
            ✕
          </button>
        </div>

        {/* Apple-style Segmented Control for Role Selection (Strictly Seeker or Employer) */}
        {step === 'phone' && (
          <div
            role="radiogroup"
            aria-label="Select your account type"
            className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
          >
            <button
              type="button"
              role="radio"
              aria-checked={selectedRole === 'job_seeker'}
              onClick={() => setSelectedRole('job_seeker')}
              className={`rounded-lg py-2.5 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-indigo-600 ${
                selectedRole === 'job_seeker'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Job Seeker
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={selectedRole === 'employer'}
              onClick={() => setSelectedRole('employer')}
              className={`rounded-lg py-2.5 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-indigo-600 ${
                selectedRole === 'employer'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Employer / MSME
            </button>
          </div>
        )}

        {/* Inline Error Alert Banner (High-Contrast WCAG AA) */}
        {errorMessage && (
          <div
            role="alert"
            aria-live="assertive"
            className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
          >
            {errorMessage}
          </div>
        )}

        {/* STEP 1: Phone Input & DPDP Consent */}
        {step === 'phone' ? (
          <form onSubmit={handleRequestOtp} className="mt-6 space-y-5" noValidate>
            <div>
              <label
                htmlFor="jc-phone-input"
                className="block text-sm font-medium text-slate-800"
              >
                Mobile Number
              </label>
              <div className="mt-1.5 flex rounded-xl border border-slate-300 bg-white focus-within:border-indigo-600 focus-within:ring-2 focus-within:ring-indigo-600/20">
                <span className="inline-flex select-none items-center border-r border-slate-200 bg-slate-50 px-3.5 text-sm font-medium text-slate-700 rounded-l-xl">
                  +91
                </span>
                <input
                  ref={phoneInputRef}
                  id="jc-phone-input"
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="Enter 10-digit mobile number"
                  maxLength={10}
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, ''))}
                  required
                  className="w-full rounded-r-xl border-0 bg-transparent px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            </div>

            {/* Mandatory DPDP Act 2023 Consent */}
            <div className="flex items-start gap-3">
              <input
                id="jc-dpdp-consent"
                type="checkbox"
                checked={consentAccepted}
                onChange={(e) => setConsentAccepted(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
              />
              <label
                htmlFor="jc-dpdp-consent"
                className="text-xs leading-relaxed text-slate-700"
              >
                I agree to the{' '}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-indigo-600 underline hover:text-indigo-500"
                >
                  Privacy Notice &amp; DPDP Consent ({DPDP_CONSENT_VERSION})
                </a>{' '}
                and authorize JobsClick to verify my mobile number via OTP.
              </label>
            </div>

            {/* Turnstile Mount Container (Keyed by turnstileGeneration so resends mint a fresh token) */}
            <div key={turnstileGeneration} className="min-h-[4px]">
              <input
                type="hidden"
                name="cf-turnstile-response"
                value={turnstileToken}
                onChange={(e) => setTurnstileToken(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || phoneInput.length !== 10}
              className="flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
            >
              {isSubmitting ? 'Sending verification code…' : 'Get Verification Code'}
            </button>
          </form>
        ) : (
          /* STEP 2: 6-Digit Tactile OTP Input */
          <form onSubmit={handleVerifyOtp} className="mt-6 space-y-6" noValidate>
            <div>
              <label
                htmlFor="jc-otp-digit-0"
                className="block text-sm font-medium text-slate-800"
              >
                6-Digit Verification Code
              </label>
              <div className="mt-2 grid grid-cols-6 gap-2 sm:gap-3">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      otpRefs.current[idx] = el;
                    }}
                    id={`jc-otp-digit-${idx}`}
                    type="text"
                    inputMode="numeric"
                    autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                    aria-label={`Digit ${idx + 1} of 6`}
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    className="h-12 w-full rounded-xl border border-slate-300 bg-slate-50/50 text-center text-lg font-semibold text-slate-900 transition-all focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs font-medium">
              <button
                type="button"
                onClick={() => {
                  setStep('phone');
                  setErrorMessage(null);
                }}
                className="text-slate-600 hover:text-slate-900 focus:outline-none focus:underline"
              >
                ← Change mobile number
              </button>

              <button
                type="button"
                disabled={resendCooldown > 0 || isSubmitting}
                onClick={() => void handleRequestOtp()}
                className="text-indigo-600 hover:text-indigo-500 focus:outline-none focus:underline disabled:cursor-not-allowed disabled:text-slate-400"
              >
                {resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : 'Resend code'}
              </button>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || otpDigits.join('').length !== 6}
              className="flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
            >
              {isSubmitting ? 'Verifying…' : 'Verify & Continue'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}