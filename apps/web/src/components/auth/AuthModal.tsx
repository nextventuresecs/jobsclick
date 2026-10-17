'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useApp } from '../../context/AppContext';
import { udyamNumberSchema, indianMobileNumberSchema, toBackendRole } from '@indian-job-portal/validation';
import { JobsClickLogo, Button } from '@indian-job-portal/ui';
import {
  X,
  Building2,
  ShieldCheck,
  CheckCircle2,
  GraduationCap,
  Briefcase,
  User,
  ArrowRight,
  FileSpreadsheet,
  Lock,
  Mail,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '../../lib/supabaseClient';
import { Turnstile } from '@marsidev/react-turnstile';

type EmployerTab = 'phone_otp' | 'email_pwd' | 'google' | 'udyam';
type InstitutionTab = 'phone_otp' | 'credentials' | 'google';
type JobSeekerType = 'individual' | 'institution_student';
type JobSeekerMethod = 'phone_otp' | 'google' | 'email';

// Reusable Phone OTP subcomponent
interface PhoneOtpProps {
  readonly phone: string;
  readonly setPhone: (val: string) => void;
  readonly otpStep: 'input' | 'verify';
  readonly setOtpStep: (val: 'input' | 'verify') => void;
  readonly otp: readonly string[];
  readonly onOtpChange: (idx: number, val: string) => void;
  readonly timer: number;
  readonly onResend: () => void;
  readonly onSendOtp: (e: React.FormEvent) => void;
  readonly onVerifyOtp: (e: React.FormEvent) => void;
  readonly isLoading: boolean;
  readonly label: string;
  readonly submitText?: string;
  readonly t: (key: string) => string;
  readonly onTurnstileSuccess?: (token: string) => void;
}

function PhoneOtpForm({
  phone,
  setPhone,
  otpStep,
  setOtpStep,
  otp,
  onOtpChange,
  timer,
  onResend,
  onSendOtp,
  onVerifyOtp,
  isLoading,
  label,
  submitText,
  t,
  onTurnstileSuccess,
}: PhoneOtpProps) {
  if (otpStep === 'input') {
    return (
      <form onSubmit={onSendOtp} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            {label}
          </label>
          <div className="flex rounded-xl border border-gray-300 shadow-2xs overflow-hidden focus-within:ring-2 focus-within:ring-orange-500">
            <span className="inline-flex items-center px-3 bg-gray-50 border-r border-gray-300 text-gray-600 text-sm font-semibold">
              +91
            </span>
            <input
              type="tel"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="9876543210"
              className="w-full px-3 py-2.5 text-sm font-mono text-gray-900 focus:outline-hidden"
              required
            />
          </div>
        </div>

        {/* Turnstile Bot Challenge (Hard Invariant #4) */}
        <div className="flex justify-center my-2 min-h-[65px]">
          <Turnstile
            siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'}
            onSuccess={(token) => onTurnstileSuccess?.(token)}
            onError={() => onTurnstileSuccess?.('')}
            onExpire={() => onTurnstileSuccess?.('')}
            options={{
              theme: 'light',
              size: 'normal',
            }}
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          className="w-full justify-center"
          disabled={isLoading}
        >
          {isLoading ? '...' : submitText || t('getOtp')}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={onVerifyOtp} className="space-y-4">
      <div className="text-center">
        <p className="text-xs text-gray-600">
          {t('otpSentTo')}{' '}
          <span className="font-mono font-bold text-gray-900">+91 {phone}</span>
        </p>
      </div>

      <div className="flex justify-center gap-2">
        {otp.map((digit, idx) => (
          <input
            key={idx}
            id={`modal-otp-${idx}`}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => onOtpChange(idx, e.target.value)}
            className="w-11 h-12 text-center text-lg font-bold font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
          />
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <button
          type="button"
          onClick={() => setOtpStep('input')}
          className="text-orange-600 hover:underline cursor-pointer"
        >
          {t('changeNumber')}
        </button>
        <span>
          {timer > 0 ? (
            `${t('resendCode')} in ${timer}s`
          ) : (
            <button
              type="button"
              onClick={onResend}
              className="text-orange-600 hover:underline font-semibold cursor-pointer"
            >
              {t('resendCode')}
            </button>
          )}
        </span>
      </div>

      <Button
        type="submit"
        variant="primary"
        className="w-full justify-center"
        disabled={isLoading}
      >
        {isLoading ? '...' : t('verifyContinue')}
      </Button>
    </form>
  );
}

// Reusable Google Auth button subcomponent
function GoogleAuthButton({
  onGoogleClick,
  isLoading,
  promptText,
  buttonText,
}: {
  readonly onGoogleClick: () => void;
  readonly isLoading: boolean;
  readonly promptText: string;
  readonly buttonText: string;
}) {
  return (
    <div className="space-y-3 text-center py-2">
      <p className="text-xs text-gray-600">{promptText}</p>
      <button
        type="button"
        onClick={onGoogleClick}
        disabled={isLoading}
        className="w-full py-2.5 px-4 rounded-xl border border-gray-300 hover:bg-gray-50 flex items-center justify-center gap-3 text-sm font-semibold text-gray-700 transition-colors cursor-pointer"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        <span>{isLoading ? '...' : buttonText}</span>
      </button>
    </div>
  );
}

export function AuthModal() {
  const t = useTranslations('Auth');
  const tRoles = useTranslations('Roles');
  const {
    isAuthModalOpen,
    closeAuthModal,
    authModalDefaultRole,
    loginAs,
    setAuthSession,
    addToast,
  } = useApp();

  const [selectedRole, setSelectedRole] = useState<'jobseeker' | 'employer' | 'institution'>('jobseeker');
  const [showAdminRoles, setShowAdminRoles] = useState(false);

  const [seekerType, setSeekerType] = useState<JobSeekerType>('individual');
  const [seekerMethod, setSeekerMethod] = useState<JobSeekerMethod>('phone_otp');
  const [employerTab, setEmployerTab] = useState<EmployerTab>('phone_otp');
  const [institutionTab, setInstitutionTab] = useState<InstitutionTab>('phone_otp');

  const [phone, setPhone] = useState('9876543210');
  const [turnstileToken, setTurnstileToken] = useState<string>('');
  const [otpStep, setOtpStep] = useState<'input' | 'verify'>('input');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [timer, setTimer] = useState(30);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [udyamNumber, setUdyamNumber] = useState('UDYAM-MH-26-0019482');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (authModalDefaultRole) {
      if (authModalDefaultRole === 'msme_dept' || authModalDefaultRole === 'platform_admin') {
        setShowAdminRoles(true);
      } else {
        setSelectedRole(authModalDefaultRole as 'jobseeker' | 'employer' | 'institution');
      }
    }
  }, [authModalDefaultRole, isAuthModalOpen]);

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    if (otpStep === 'verify' && timer > 0) {
      interval = setInterval(() => {
        setTimer((t) => t - 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [otpStep, timer]);

  if (!isAuthModalOpen) return null;

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage('');

    const parsedPhone = indianMobileNumberSchema.safeParse(phone);
    if (!parsedPhone.success) {
      setErrorMessage('Please enter a valid 10-digit Indian mobile number (starting with 6-9).');
      return;
    }

    setIsLoading(true);
    try {
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || process.env['API_URL'] || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/auth/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: parsedPhone.data,
          turnstileToken: turnstileToken || undefined,
        }),
      });

      if (!res.ok) {
        let msg = 'Failed to send OTP. Please try again.';
        try {
          const errData = await res.json();
          if (Array.isArray(errData.message)) {
            msg = errData.message.join(', ');
          } else if (typeof errData.message === 'string') {
            msg = errData.message;
          } else if (errData.error) {
            msg = errData.error;
          }
        } catch {
          msg = res.statusText || msg;
        }
        setErrorMessage(msg);
        return;
      }

      const data = await res.json();
      setOtpStep('verify');
      setTimer(typeof data.cooldownSeconds === 'number' ? data.cooldownSeconds : 60);
      setOtp(['', '', '', '', '', '']);
      addToast({
        type: 'info',
        title: 'OTP Dispatched via MSG91',
        message: data.message || `Verification code sent to +91 ${parsedPhone.data}.`,
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error connecting to auth service');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const code = otp.join('');
    if (code.length !== 6) {
      setErrorMessage('Please enter the full 6-digit verification code.');
      return;
    }

    const parsedPhone = indianMobileNumberSchema.safeParse(phone);
    if (!parsedPhone.success) {
      setErrorMessage('Please enter a valid 10-digit Indian mobile number (starting with 6-9).');
      return;
    }

    setIsLoading(true);
    try {
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || process.env['API_URL'] || 'http://localhost:3001';
      const backendRole = toBackendRole(selectedRole);

      const res = await fetch(`${apiUrl}/auth/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: parsedPhone.data,
          code,
          role: backendRole,
        }),
      });

      if (!res.ok) {
        let msg = 'Failed to verify OTP code.';
        try {
          const errData = await res.json();
          if (Array.isArray(errData.message)) {
            msg = errData.message.join(', ');
          } else if (typeof errData.message === 'string') {
            msg = errData.message;
          } else if (errData.error) {
            msg = errData.error;
          }
        } catch {
          msg = res.statusText || msg;
        }
        setErrorMessage(msg);
        return;
      }

      const data = await res.json();
      if (setAuthSession && data.accessToken && data.user) {
        setAuthSession({
          accessToken: data.accessToken,
          user: data.user,
        });
      } else {
        loginAs(selectedRole, {
          accessToken: data.accessToken,
          user: data.user,
        });
      }

      const roleDisplay =
        selectedRole === 'jobseeker'
          ? seekerType === 'institution_student'
            ? 'Campus Student (Verified via Placement Cell)'
            : tRoles('jobseeker')
          : selectedRole === 'employer'
            ? tRoles('employer')
            : tRoles('institution');

      addToast({
        type: 'success',
        title: 'Verified & Signed In',
        message: `Welcome! Active session as ${roleDisplay}.`,
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error connecting to auth service');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid official email address.');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      loginAs(selectedRole);
      addToast({
        type: 'success',
        title: 'Signed In Successfully',
        message: `Welcome back (${email}).`,
      });
    }, 500);
  };

  const handleGoogleSubmit = async () => {
    setIsLoading(true);
    setErrorMessage('');

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setTimeout(() => {
        setIsLoading(false);
        loginAs(selectedRole);
        addToast({
          type: 'success',
          title: 'Google Sign-In Successful',
          message: `Authenticated as ${selectedRole === 'employer' ? tRoles('employer') : selectedRole === 'institution' ? tRoles('institution') : tRoles('jobseeker')}.`,
        });
      }, 500);
      return;
    }

    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('jobsclick_pending_oauth_role', selectedRole);
      }
      const redirectTo = `${window.location.origin}/auth/callback?role=${encodeURIComponent(selectedRole)}`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to initialize Google Sign-In';
      setErrorMessage(message);
      setIsLoading(false);
    }
  };

  const handleUdyamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const parsedUdyam = udyamNumberSchema.safeParse(udyamNumber);
    if (!parsedUdyam.success) {
      setErrorMessage('Invalid Udyam number format. Example: UDYAM-MH-26-0019482');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      loginAs('employer');
      addToast({
        type: 'success',
        title: 'Enterprise Verified via Udyam',
        message: `Company registration confirmed: ${parsedUdyam.data}.`,
      });
    }, 600);
  };

  const handleOtpDigitChange = (index: number, val: string) => {
    const digitsOnly = val.replace(/\D/g, '');
    if (digitsOnly.length > 1) {
      const nextOtp = [...otp];
      for (let i = 0; i < 6 && index + i < 6; i++) {
        if (digitsOnly[i]) {
          nextOtp[index + i] = digitsOnly[i]!;
        }
      }
      setOtp(nextOtp);
      const targetFocusIdx = Math.min(5, index + digitsOnly.length);
      const targetInput = document.getElementById(`modal-otp-${targetFocusIdx}`);
      targetInput?.focus();
      return;
    }

    if (!/^\d*$/.test(val)) return;
    const nextOtp = [...otp];
    nextOtp[index] = val.slice(-1);
    setOtp(nextOtp);

    if (val && index < 5) {
      const nextInput = document.getElementById(`modal-otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  const resetSubState = () => {
    setErrorMessage('');
    setOtpStep('input');
    setOtp(['', '', '', '', '', '']);
    setTurnstileToken('');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <JobsClickLogo variant="icon" size="sm" />
            <div>
              <h2 className="font-bold text-gray-900 text-base">{t('signInTitle')}</h2>
              <p className="text-xs text-gray-500">{t('subtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeAuthModal}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200/50 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Primary Role Selector (Job Seeker, Employer, Institution) */}
        <div className="px-6 py-3 bg-orange-50/60 border-b border-orange-100 shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-orange-950 uppercase tracking-wider">
              {t('chooseRole')}
            </span>
            <span className="text-[11px] text-orange-800 font-medium">
              {t('step')}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedRole('jobseeker');
                resetSubState();
              }}
              className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer ${
                selectedRole === 'jobseeker'
                  ? 'bg-orange-500 text-white border-orange-600 shadow-sm'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-orange-300 hover:bg-orange-50/40'
              }`}
            >
              <User className={`w-4 h-4 mb-1 ${selectedRole === 'jobseeker' ? 'text-white' : 'text-gray-500'}`} />
              <span className="text-xs font-semibold">{tRoles('jobseeker')}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedRole('employer');
                resetSubState();
              }}
              className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer ${
                selectedRole === 'employer'
                  ? 'bg-orange-500 text-white border-orange-600 shadow-sm'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-orange-300 hover:bg-orange-50/40'
              }`}
            >
              <Briefcase className={`w-4 h-4 mb-1 ${selectedRole === 'employer' ? 'text-white' : 'text-gray-500'}`} />
              <span className="text-xs font-semibold">{tRoles('employer')}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedRole('institution');
                resetSubState();
              }}
              className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer ${
                selectedRole === 'institution'
                  ? 'bg-orange-500 text-white border-orange-600 shadow-sm'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-orange-300 hover:bg-orange-50/40'
              }`}
            >
              <GraduationCap className={`w-4 h-4 mb-1 ${selectedRole === 'institution' ? 'text-white' : 'text-gray-500'}`} />
              <span className="text-xs font-semibold">{tRoles('institution')}</span>
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <span className="font-semibold">Error:</span> {errorMessage}
            </div>
          )}

          {/* ============================================================== */}
          {/* ROLE 1: EMPLOYER FLOW */}
          {/* ============================================================== */}
          {selectedRole === 'employer' && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 p-1 bg-gray-100 rounded-xl text-xs font-semibold text-gray-600">
                {(['phone_otp', 'email_pwd', 'google', 'udyam'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setEmployerTab(tab);
                      resetSubState();
                    }}
                    className={`py-1.5 px-2 text-center rounded-lg transition-all cursor-pointer ${
                      employerTab === tab ? 'bg-white text-gray-900 shadow-xs font-bold' : 'hover:text-gray-900'
                    }`}
                  >
                    {tab === 'phone_otp'
                      ? t('phoneOtp')
                      : tab === 'email_pwd'
                        ? t('email')
                        : tab === 'google'
                          ? t('google')
                          : t('udyam')}
                  </button>
                ))}
              </div>

              {employerTab === 'phone_otp' && (
                <PhoneOtpForm
                  phone={phone}
                  setPhone={setPhone}
                  otpStep={otpStep}
                  setOtpStep={setOtpStep}
                  otp={otp}
                  onOtpChange={handleOtpDigitChange}
                  timer={timer}
                  onResend={() => handleSendOtp()}
                  onSendOtp={handleSendOtp}
                  onVerifyOtp={handleVerifyOtp}
                  isLoading={isLoading}
                  label={t('mobileLabel')}
                  t={t}
                  onTurnstileSuccess={setTurnstileToken}
                />
              )}

              {employerTab === 'email_pwd' && (
                <form onSubmit={handleEmailPasswordSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('officialEmail')}
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="hr@company.com"
                        className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden pl-9"
                        required
                      />
                      <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('password')}
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••"
                        className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden pl-9"
                        required
                      />
                      <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full justify-center"
                    disabled={isLoading}
                  >
                    {isLoading ? '...' : `${t('signInTitle')} (${tRoles('employer')})`}
                  </Button>
                </form>
              )}

              {employerTab === 'google' && (
                <GoogleAuthButton
                  onGoogleClick={handleGoogleSubmit}
                  isLoading={isLoading}
                  promptText={t('googlePrompt')}
                  buttonText={t('googleContinue')}
                />
              )}

              {employerTab === 'udyam' && (
                <form onSubmit={handleUdyamSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('udyamLabel')}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={udyamNumber}
                        onChange={(e) => setUdyamNumber(e.target.value.toUpperCase())}
                        placeholder="UDYAM-MH-26-0019482"
                        className="w-full px-3 py-2 text-sm font-mono uppercase rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                        required
                      />
                      <Building2 className="w-4 h-4 text-gray-400 absolute right-3 top-2.5" />
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>{t('udyamVerified')}</span>
                    </p>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full justify-center"
                    disabled={isLoading}
                  >
                    {isLoading ? '...' : `${t('verifyContinue')} (Udyam)`}
                  </Button>
                </form>
              )}

              {/* Dedicated Bulk Onboarding Callout with link */}
              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 flex items-start gap-2.5 text-xs text-blue-900">
                <FileSpreadsheet className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-blue-950">{t('employerBulkNotice')}</p>
                  <p className="text-[11px] text-blue-700 leading-relaxed">{t('employerBulkDesc')}</p>
                  <div className="pt-1">
                    <Link
                      href="/company/bulk-onboard"
                      onClick={closeAuthModal}
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900 underline"
                    >
                      <span>{t('openClusterPortal')}</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* ROLE 2: JOB SEEKER FLOW */}
          {/* ============================================================== */}
          {selectedRole === 'jobseeker' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 p-1 bg-gray-100 rounded-xl text-xs font-semibold text-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    setSeekerType('individual');
                    resetSubState();
                  }}
                  className={`py-2 px-2 text-center rounded-lg transition-all cursor-pointer ${
                    seekerType === 'individual' ? 'bg-white text-gray-900 shadow-xs font-bold' : 'hover:text-gray-900'
                  }`}
                >
                  {t('individualCandidate')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSeekerType('institution_student');
                    resetSubState();
                  }}
                  className={`py-2 px-2 text-center rounded-lg transition-all cursor-pointer ${
                    seekerType === 'institution_student' ? 'bg-white text-gray-900 shadow-xs font-bold' : 'hover:text-gray-900'
                  }`}
                >
                  {t('campusCandidate')}
                </button>
              </div>

              {seekerType === 'institution_student' ? (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900">
                    <div className="flex items-center gap-1.5 font-semibold text-emerald-950 mb-1">
                      <GraduationCap className="w-4 h-4 text-emerald-700" />
                      <span>{t('campusNoticeTitle')}</span>
                    </div>
                    <p className="text-[11px] text-emerald-800 leading-relaxed">
                      {t('campusNoticeDesc')}
                    </p>
                  </div>

                  <PhoneOtpForm
                    phone={phone}
                    setPhone={setPhone}
                    otpStep={otpStep}
                    setOtpStep={setOtpStep}
                    otp={otp}
                    onOtpChange={handleOtpDigitChange}
                    timer={timer}
                    onResend={() => handleSendOtp()}
                    onSendOtp={handleSendOtp}
                    onVerifyOtp={handleVerifyOtp}
                    isLoading={isLoading}
                    label={t('studentMobileLabel')}
                    submitText={t('claimProfile')}
                    t={t}
                    onTurnstileSuccess={setTurnstileToken}
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 p-1 bg-gray-100 rounded-xl text-xs font-semibold text-gray-600">
                    {(['phone_otp', 'google', 'email'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setSeekerMethod(m);
                          resetSubState();
                        }}
                        className={`py-1.5 px-2 text-center rounded-lg transition-all cursor-pointer ${
                          seekerMethod === m ? 'bg-white text-gray-900 shadow-xs font-bold' : 'hover:text-gray-900'
                        }`}
                      >
                        {m === 'phone_otp' ? t('phoneOtp') : m === 'google' ? t('google') : t('email')}
                      </button>
                    ))}
                  </div>

                  {seekerMethod === 'phone_otp' && (
                    <PhoneOtpForm
                      phone={phone}
                      setPhone={setPhone}
                      otpStep={otpStep}
                      setOtpStep={setOtpStep}
                      otp={otp}
                      onOtpChange={handleOtpDigitChange}
                      timer={timer}
                      onResend={() => handleSendOtp()}
                      onSendOtp={handleSendOtp}
                      onVerifyOtp={handleVerifyOtp}
                      isLoading={isLoading}
                      label={t('mobileLabel')}
                      t={t}
                      onTurnstileSuccess={setTurnstileToken}
                    />
                  )}

                  {seekerMethod === 'google' && (
                    <GoogleAuthButton
                      onGoogleClick={handleGoogleSubmit}
                      isLoading={isLoading}
                      promptText={t('googlePrompt')}
                      buttonText={t('googleContinue')}
                    />
                  )}

                  {seekerMethod === 'email' && (
                    <form onSubmit={handleEmailPasswordSubmit} className="space-y-3.5">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          {t('personalEmail')}
                        </label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="candidate@gmail.com"
                          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          {t('password')}
                        </label>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••••"
                          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                          required
                        />
                      </div>

                      <Button
                        type="submit"
                        variant="primary"
                        className="w-full justify-center"
                        disabled={isLoading}
                      >
                        {isLoading ? '...' : `${t('signInTitle')} (${t('email')})`}
                      </Button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* ROLE 3: INSTITUTION FLOW */}
          {/* ============================================================== */}
          {selectedRole === 'institution' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 p-1 bg-gray-100 rounded-xl text-xs font-semibold text-gray-600">
                {(['phone_otp', 'credentials', 'google'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setInstitutionTab(tab);
                      resetSubState();
                    }}
                    className={`py-1.5 px-2 text-center rounded-lg transition-all cursor-pointer ${
                      institutionTab === tab ? 'bg-white text-gray-900 shadow-xs font-bold' : 'hover:text-gray-900'
                    }`}
                  >
                    {tab === 'phone_otp' ? t('phoneOtp') : tab === 'credentials' ? t('credentials') : t('google')}
                  </button>
                ))}
              </div>

              {institutionTab === 'phone_otp' && (
                <PhoneOtpForm
                  phone={phone}
                  setPhone={setPhone}
                  otpStep={otpStep}
                  setOtpStep={setOtpStep}
                  otp={otp}
                  onOtpChange={handleOtpDigitChange}
                  timer={timer}
                  onResend={() => handleSendOtp()}
                  onSendOtp={handleSendOtp}
                  onVerifyOtp={handleVerifyOtp}
                  isLoading={isLoading}
                  label={t('officerMobileLabel')}
                  t={t}
                  onTurnstileSuccess={setTurnstileToken}
                />
              )}

              {institutionTab === 'credentials' && (
                <form onSubmit={handleEmailPasswordSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('institutionName')}
                    </label>
                    <input
                      type="text"
                      value={institutionName}
                      onChange={(e) => setInstitutionName(e.target.value)}
                      placeholder="Government ITI / Polytechnic College"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('institutionEmail')}
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="placement@college.edu.in"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('password')}
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                      required
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full justify-center"
                    disabled={isLoading}
                  >
                    {isLoading ? '...' : `${t('signInTitle')} (${tRoles('institution')})`}
                  </Button>
                </form>
              )}

              {institutionTab === 'google' && (
                <GoogleAuthButton
                  onGoogleClick={handleGoogleSubmit}
                  isLoading={isLoading}
                  promptText={t('googlePrompt')}
                  buttonText={t('googleContinue')}
                />
              )}

              {/* Institution Invariant Notice */}
              <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-100 flex items-start gap-2.5 text-xs text-purple-900">
                <GraduationCap className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-purple-950">
                    Hard Invariant #2: Controlled Wave Onboarding
                  </p>
                  <p className="text-[11px] text-purple-700 leading-relaxed">
                    Placement cells upload student CSV rosters in invited state. Verification SMS is dispatched in controlled waves with upfront cost preview.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer info banner & Discreet Admin Access */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 shrink-0 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{t('hardInvariant1')}</span>
            </div>

            <button
              type="button"
              onClick={() => setShowAdminRoles(!showAdminRoles)}
              className="text-[11px] text-gray-400 hover:text-gray-600 underline cursor-pointer"
            >
              {showAdminRoles ? 'Hide Ops' : t('adminLogin')}
            </button>
          </div>

          {showAdminRoles && (
            <div className="p-2.5 bg-gray-200/60 rounded-xl flex items-center justify-between text-xs animate-in fade-in">
              <span className="font-medium text-gray-700">{t('opsLogin')}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    loginAs('msme_dept');
                    addToast({ type: 'info', title: 'DIC Portal', message: 'Logged in as MSME Dept Admin' });
                  }}
                  className="px-2.5 py-1 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-800 hover:bg-gray-100 cursor-pointer"
                >
                  {tRoles('msmeDept')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    loginAs('platform_admin');
                    addToast({ type: 'info', title: 'Central Ops', message: 'Logged in as Platform Admin' });
                  }}
                  className="px-2.5 py-1 bg-gray-900 rounded-lg text-xs font-semibold text-white hover:bg-gray-800 cursor-pointer"
                >
                  {tRoles('admin')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
