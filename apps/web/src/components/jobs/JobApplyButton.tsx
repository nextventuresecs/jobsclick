'use client';

import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Button } from '@indian-job-portal/ui';
import { CheckCircle2, Send } from 'lucide-react';

export interface JobApplyButtonProps {
  readonly jobId: string;
  readonly jobTitle: string;
  readonly companyName: string;
  readonly companyId: string;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly className?: string;
  readonly label?: string;
}

export function JobApplyButton({
  jobId: _jobId,
  jobTitle,
  companyName,
  companyId: _companyId,
  size = 'lg',
  className = '',
  label = 'Apply Now',
}: JobApplyButtonProps) {
  const { currentUserRole, isAuthenticated, openAuthModal, addToast } = useApp();
  const [hasApplied, setHasApplied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleApply = async () => {
    if (!isAuthenticated) {
      openAuthModal('jobseeker');
      addToast({
        type: 'info',
        title: 'Sign In Required',
        message: 'Please sign in or claim your verified candidate profile to apply directly.',
      });
      return;
    }

    if (currentUserRole !== 'jobseeker') {
      addToast({
        type: 'warning',
        title: 'Candidate Role Required',
        message: `You are currently logged in as an ${currentUserRole}. Please sign in as a Job Seeker to apply.`,
      });
      return;
    }

    setIsSubmitting(true);

    // Simulate API submission
    setTimeout(() => {
      setIsSubmitting(false);
      setHasApplied(true);
      addToast({
        type: 'success',
        title: 'Application Submitted Successfully!',
        message: `Your verified profile for "${jobTitle}" has been sent to ${companyName}. Candidate phone and email remain masked per Hard Invariant #1.`,
      });
    }, 600);
  };

  if (hasApplied) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold text-xs ${className}`}>
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        <span>Application Submitted</span>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="primary"
      size={size}
      disabled={isSubmitting}
      onClick={handleApply}
      className={`font-bold shadow-sm inline-flex items-center gap-2 ${className}`}
    >
      {isSubmitting ? (
        <span>Submitting...</span>
      ) : (
        <>
          <Send className="w-4 h-4" />
          <span>{label}</span>
        </>
      )}
    </Button>
  );
}
