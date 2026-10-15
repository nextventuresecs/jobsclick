'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import type { ClientRole } from '@indian-job-portal/validation';
import { udyamNumberSchema, indianMobileNumberSchema } from '@indian-job-portal/validation';
import { JobsClickLogo, Button } from '@indian-job-portal/ui';
import {
  X,
  Building2,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

type AuthTab = 'mobile_otp' | 'email' | 'google' | 'msme';

const ROLE_INFO_MAP: Record<ClientRole, { label: string; desc: string }> = {
  jobseeker: {
    label: 'Job Seeker',
    desc: 'Verified candidate with protected PII',
  },
  employer: {
    label: 'MSME Employer',
    desc: 'Udyam verified business recruiter',
  },
  institution: {
    label: 'Placement Cell',
    desc: 'Vocational & technical college bulk coordinator',
  },
  msme_dept: {
    label: 'MSME Dept',
    desc: 'District Industries Centre (DIC) administrator',
  },
  platform_admin: {
    label: 'Central Ops',
    desc: 'Platform governance & audit operations',
  },
};

export function AuthModal() {
  const {
    isAuthModalOpen,
    closeAuthModal,
    authModalDefaultRole,
    loginAs,
    addToast,
  } = useApp();

  const [activeTab, setActiveTab] = useState<AuthTab>('mobile_otp');
  const [selectedRole, setSelectedRole] = useState<ClientRole>('jobseeker');

  // Mobile OTP state
  const [phone, setPhone] = useState('9876543210');
  const [otpStep, setOtpStep] = useState<'input' | 'verify'>('input');
  const [otp, setOtp] = useState(['1', '2', '3', '4', '5', '6']);
  const [timer, setTimer] = useState(30);

  // Email state
  const [email, setEmail] = useState('candidate@msme.gov.in');
  const [password, setPassword] = useState('••••••••••');

  // MSME Udyam state
  const [udyamNumber, setUdyamNumber] = useState('UDYAM-MH-26-0019482');

  // Common form state
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Sync default role when opening
  useEffect(() => {
    if (authModalDefaultRole) {
      setSelectedRole(authModalDefaultRole);
      if (authModalDefaultRole === 'employer' || authModalDefaultRole === 'msme_dept') {
        setActiveTab('msme');
      } else {
        setActiveTab('mobile_otp');
      }
    }
  }, [authModalDefaultRole, isAuthModalOpen]);

  // Countdown timer for OTP
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

  // 1. Mobile OTP Send
  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const parsedPhone = indianMobileNumberSchema.safeParse(phone);
    if (!parsedPhone.success) {
      setErrorMessage('Please enter a valid 10-digit Indian mobile number (starting with 6-9).');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setOtpStep('verify');
      setTimer(30);
      addToast({
        type: 'info',
        title: 'OTP Dispatched via MSG91',
        message: `Verification code sent to +91 ${parsedPhone.data}. Demo OTP is 123456.`,
      });
    }, 600);
  };

  // 2. Mobile OTP Verify
  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length !== 6) {
      setErrorMessage('Please enter the full 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      loginAs(selectedRole);
      addToast({
        type: 'success',
        title: 'Phone Verified & Signed In',
        message: `Welcome! Active as ${ROLE_INFO_MAP[selectedRole].label}.`,
      });
    }, 500);
  };

  // 3. Email Sign-In
  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      loginAs(selectedRole);
      addToast({
        type: 'success',
        title: 'Signed in successfully',
        message: `Signed in as ${ROLE_INFO_MAP[selectedRole].label} (${email}).`,
      });
    }, 500);
  };

  // 4. Google Sign-In
  const handleGoogleSubmit = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      loginAs(selectedRole);
      addToast({
        type: 'success',
        title: 'Google Authentication Successful',
        message: `Logged in as ${ROLE_INFO_MAP[selectedRole].label}.`,
      });
    }, 600);
  };

  // 5. MSME Udyam Submit
  const handleUdyamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const parsedUdyam = udyamNumberSchema.safeParse(udyamNumber);
    if (!parsedUdyam.success) {
      setErrorMessage('Invalid Udyam number. Example format: UDYAM-MH-26-0019482');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      loginAs('employer');
      addToast({
        type: 'success',
        title: 'MSME Verified via National Udyam Portal',
        message: `Enterprise authenticated: ${parsedUdyam.data}.`,
      });
    }, 700);
  };

  const handleOtpDigitChange = (index: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const nextOtp = [...otp];
    nextOtp[index] = val.slice(-1);
    setOtp(nextOtp);

    if (val && index < 5) {
      const nextInput = document.getElementById(`modal-otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50/70">
          <div className="flex items-center gap-3">
            <JobsClickLogo variant="icon" size="sm" />
            <div>
              <h2 className="font-bold text-gray-900 text-base">Sign In to JobsClick</h2>
              <p className="text-xs text-gray-500">
                National MSME Employment Platform · DPDP Act 2023 Compliant
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeAuthModal}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200/50 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Role Selector Bar */}
        <div className="px-5 py-3 bg-[#FFF7ED] border-b border-orange-100">
          <p className="text-[11px] font-semibold text-orange-950 uppercase tracking-wider mb-2">
            Select Your Role
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(ROLE_INFO_MAP) as ClientRole[]).map((r) => {
              const active = selectedRole === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setSelectedRole(r)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
                    active
                      ? 'bg-[#F97316] text-white border-[#EA580C] shadow-xs'
                      : 'bg-white text-gray-700 border-orange-200 hover:bg-orange-50'
                  }`}
                >
                  {ROLE_INFO_MAP[r].label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Method Tabs */}
        <div className="grid grid-cols-4 p-1.5 bg-gray-100 border-b border-gray-200 text-xs font-semibold text-gray-600">
          <button
            type="button"
            onClick={() => {
              setActiveTab('mobile_otp');
              setErrorMessage('');
            }}
            className={`py-2 px-1 text-center rounded-lg transition-all ${
              activeTab === 'mobile_otp'
                ? 'bg-white text-gray-900 shadow-xs font-bold'
                : 'hover:text-gray-900'
            }`}
          >
            Mobile OTP
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('msme');
              setErrorMessage('');
            }}
            className={`py-2 px-1 text-center rounded-lg transition-all ${
              activeTab === 'msme'
                ? 'bg-white text-gray-900 shadow-xs font-bold'
                : 'hover:text-gray-900'
            }`}
          >
            MSME Udyam
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('email');
              setErrorMessage('');
            }}
            className={`py-2 px-1 text-center rounded-lg transition-all ${
              activeTab === 'email'
                ? 'bg-white text-gray-900 shadow-xs font-bold'
                : 'hover:text-gray-900'
            }`}
          >
            Email
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('google');
              setErrorMessage('');
            }}
            className={`py-2 px-1 text-center rounded-lg transition-all ${
              activeTab === 'google'
                ? 'bg-white text-gray-900 shadow-xs font-bold'
                : 'hover:text-gray-900'
            }`}
          >
            Google
          </button>
        </div>

        {/* Body Form */}
        <div className="p-6">
          {errorMessage && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <span className="font-semibold">Error:</span> {errorMessage}
            </div>
          )}

          {/* TAB 1: MOBILE OTP */}
          {activeTab === 'mobile_otp' && (
            <div>
              {otpStep === 'input' ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      10-Digit Mobile Number
                    </label>
                    <div className="relative flex rounded-xl border border-gray-300 shadow-2xs overflow-hidden focus-within:ring-2 focus-within:ring-[#F97316] focus-within:border-transparent">
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
                    <p className="text-[11px] text-gray-500 mt-1.5 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Protected under Indian Digital Personal Data Protection Act 2023.</span>
                    </p>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full justify-center"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Sending SMS OTP...' : 'Get Verification OTP'}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="text-center">
                    <p className="text-xs text-gray-600">
                      Enter 6-digit OTP sent to{' '}
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
                        onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                        className="w-11 h-12 text-center text-lg font-bold font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:border-transparent focus:outline-hidden"
                      />
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <button
                      type="button"
                      onClick={() => setOtpStep('input')}
                      className="text-[#F97316] hover:underline"
                    >
                      Change Phone Number
                    </button>
                    <span>
                      {timer > 0 ? (
                        `Resend OTP in ${timer}s`
                      ) : (
                        <button
                          type="button"
                          onClick={() => setTimer(30)}
                          className="text-[#F97316] hover:underline font-semibold"
                        >
                          Resend Code
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
                    {isLoading ? 'Verifying OTP...' : 'Verify & Continue'}
                  </Button>
                </form>
              )}
            </div>
          )}

          {/* TAB 2: MSME UDYAM */}
          {activeTab === 'msme' && (
            <form onSubmit={handleUdyamSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Udyam Registration Number
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={udyamNumber}
                    onChange={(e) => setUdyamNumber(e.target.value.toUpperCase())}
                    placeholder="UDYAM-MH-26-0019482"
                    className="w-full px-3 py-2.5 text-sm font-mono uppercase rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:border-transparent focus:outline-hidden"
                    required
                  />
                  <Building2 className="w-4 h-4 text-gray-400 absolute right-3 top-3" />
                </div>
                <p className="text-[11px] text-gray-500 mt-1.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Instant verification via Government MSME National Portal.</span>
                </p>
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full justify-center"
                disabled={isLoading}
              >
                {isLoading ? 'Verifying Enterprise...' : 'Authenticate MSME Enterprise'}
              </Button>
            </form>
          )}

          {/* TAB 3: EMAIL */}
          {activeTab === 'email' && (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Official Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.in"
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:border-transparent focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:border-transparent focus:outline-hidden"
                  required
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full justify-center"
                disabled={isLoading}
              >
                {isLoading ? 'Signing In...' : 'Sign In with Password'}
              </Button>
            </form>
          )}

          {/* TAB 4: GOOGLE */}
          {activeTab === 'google' && (
            <div className="space-y-4 text-center py-2">
              <p className="text-xs text-gray-600">
                Continue with your verified Google account for fast, single-click access.
              </p>
              <button
                type="button"
                onClick={handleGoogleSubmit}
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-xl border border-gray-300 shadow-2xs hover:bg-gray-50 flex items-center justify-center gap-3 text-sm font-semibold text-gray-700 transition-colors"
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
                <span>{isLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer info banner */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Hard Invariant #1: Candidate phone & email never shared with employers.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
