'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '@/context/AppContext';
import { IndianPhoneSchema } from '@indian-job-portal/validation';

export function LinkPhoneModal() {
  const { user, refreshSession, addToast } = useAppContext();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [normalizedPhone, setNormalizedPhone] = useState<string>('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState<number>(0);

  const phoneInputRef = useRef<HTMLInputElement>(null);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Auto-focus when modal displays
  useEffect(() => {
    if (user?.requiresPhoneLink) {
      if (step === 'phone') {
        setTimeout(() => phoneInputRef.current?.focus(), 50);
      } else {
        setTimeout(() => otpRefs.current[0]?.focus(), 50);
      }
    }
  }, [user?.requiresPhoneLink, step]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // If user does not require phone linking, do not display
  if (!user?.requiresPhoneLink) return null;

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);

    const parsedPhone = IndianPhoneSchema.safeParse(phoneInput);
    if (!parsedPhone.success) {
      setErrorMessage(parsedPhone.error.issues[0]?.message ?? 'Enter a valid 10-digit mobile number.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/auth/link-phone/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: parsedPhone.data,
          turnstileToken: 'client_turnstile_pass',
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMessage(body?.message || 'Unable to send OTP. Please check the number and try again.');
        return;
      }

      setNormalizedPhone(parsedPhone.data);
      setStep('otp');
      setResendCooldown(30);
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch {
      setErrorMessage('Network error while requesting verification code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpDigitChange = (index: number, value: string) => {
    setErrorMessage(null);
    const cleaned = value.replace(/\D/g, '');

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
      setErrorMessage('Please enter all 6 digits of the OTP code.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/auth/link-phone/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: normalizedPhone,
          code,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMessage(data?.message || 'Invalid or expired OTP code.');
        return;
      }

      await refreshSession();
      addToast({
        type: 'success',
        title: 'Mobile number linked successfully',
        description: 'Your account is fully verified.',
      });
    } catch {
      setErrorMessage('Network error during verification. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="jc-link-phone-title"
      aria-describedby="jc-link-phone-desc"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
            Mandatory Step
          </span>
          <h2
            id="jc-link-phone-title"
            className="mt-3 text-xl font-semibold tracking-tight text-slate-900"
          >
            {step === 'phone' ? 'Link your Mobile Number' : 'Enter Verification Code'}
          </h2>
          <p
            id="jc-link-phone-desc"
            className="mt-1 text-sm leading-relaxed text-slate-600"
          >
            {step === 'phone'
              ? 'To protect all job seekers and employers on JobsClick, every account must have a verified Indian mobile number before accessing workspace features.'
              : `Enter the 6-digit code sent to +91 ${normalizedPhone.slice(0, 2)}•••••${normalizedPhone.slice(-3)}`}
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
          >
            {errorMessage}
          </div>
        )}

        {step === 'phone' ? (
          <form onSubmit={handleSendOtp} className="mt-5 space-y-4" noValidate>
            <div>
              <label
                htmlFor="jc-link-phone-input"
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
                  id="jc-link-phone-input"
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

            <button
              type="submit"
              disabled={isSubmitting || phoneInput.length !== 10}
              className="flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
            >
              {isSubmitting ? 'Sending verification code…' : 'Send Verification OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="mt-5 space-y-5" noValidate>
            <div>
              <label
                htmlFor="jc-link-otp-digit-0"
                className="block text-sm font-medium text-slate-800"
              >
                6-Digit Verification Code
              </label>
              <div className="mt-2 grid grid-cols-6 gap-2">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      otpRefs.current[idx] = el;
                    }}
                    id={`jc-link-otp-digit-${idx}`}
                    type="text"
                    inputMode="numeric"
                    autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                    aria-label={`Digit ${idx + 1} of 6`}
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    className="h-12 w-full rounded-xl border border-slate-300 bg-slate-50 text-center text-lg font-semibold text-slate-900 transition-all focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
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
                onClick={() => void handleSendOtp()}
                className="text-indigo-600 hover:text-indigo-500 focus:outline-none focus:underline disabled:cursor-not-allowed disabled:text-slate-400"
              >
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
              </button>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || otpDigits.join('').length !== 6}
              className="flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
            >
              {isSubmitting ? 'Verifying…' : 'Verify & Link Mobile'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
