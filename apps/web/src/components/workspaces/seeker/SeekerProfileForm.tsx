'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@indian-job-portal/ui';
import { ArrowLeft, ArrowRight, Save, Download } from 'lucide-react';
import type { SeekerFormData } from './seekerFormTypes';
import { SeekerDemographicsFields } from './SeekerDemographicsFields';
import { SeekerKycAndEduFields } from './SeekerKycAndEduFields';
import { SeekerSkillsAndPrefsFields } from './SeekerSkillsAndPrefsFields';

interface SeekerProfileFormProps {
  formData: SeekerFormData;
  updateField: <K extends keyof SeekerFormData>(key: K, value: SeekerFormData[K]) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  onDownloadPdf?: () => void;
  isDownloadingPdf?: boolean;
}

export function SeekerProfileForm({
  formData,
  updateField,
  onSubmit,
  onCancel,
  onDownloadPdf,
  isDownloadingPdf,
}: SeekerProfileFormProps) {
  const t = useTranslations('SeekerWorkspace');
  const [step, setStep] = useState(0);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const focusStep = useRef(false);
  const lastStep = 2;

  useEffect(() => {
    if (focusStep.current) stepHeading.current?.focus();
  }, [step]);

  function goToStep(nextStep: number) {
    focusStep.current = true;
    setStep(nextStep);
  }

  function submitStep(event: React.FormEvent<HTMLFormElement>) {
    if (step === lastStep) {
      onSubmit(event);
      return;
    }
    event.preventDefault();
    goToStep(step + 1);
  }

  return (
    <form onSubmit={submitStep} className="space-y-6 rounded-xl border border-gray-light bg-white p-4 sm:p-8">
      <div className="space-y-2 border-b border-gray-light pb-4">
        <h2 className="text-xl font-bold text-charcoal">{t('formEditHeading')}</h2>
        <p className="text-base text-gray-text">{t('formEditSubheading')}</p>
        <p className="text-base font-semibold">{t('profileStep', { step: step + 1, total: lastStep + 1 })}</p>
      </div>

      <div className="space-y-4">
        <h3 ref={stepHeading} tabIndex={-1} className="rounded text-lg font-bold outline-offset-4">
          {t(step === 0 ? 'profileStepDetails' : step === 1 ? 'profileStepEducation' : 'profileStepPreferences')}
        </h3>
        {step === 0 && <SeekerDemographicsFields formData={formData} updateField={updateField} />}
        {step === 1 && <SeekerKycAndEduFields formData={formData} updateField={updateField} />}
        {step === 2 && <SeekerSkillsAndPrefsFields formData={formData} updateField={updateField} />}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-gray-light pt-4">
        {onDownloadPdf && (
          <Button
            type="button"
            variant="ghost"
            size="md"
            isLoading={isDownloadingPdf}
            onClick={onDownloadPdf}
          >
            <Download aria-hidden="true" className="h-5 w-5" />
            {t('downloadPdf')}
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onCancel}>{t('cancel')}</Button>
        {step > 0 && (
          <Button type="button" variant="outline" onClick={() => goToStep(step - 1)}>
            <ArrowLeft aria-hidden="true" className="h-5 w-5" />{t('profileBack')}
          </Button>
        )}
        <Button type="submit" className="ml-auto">
          {step === lastStep
            ? <><Save aria-hidden="true" className="h-5 w-5" />{t('saveProfile')}</>
            : <>{t('profileNext')}<ArrowRight aria-hidden="true" className="h-5 w-5" /></>}
        </Button>
      </div>
    </form>
  );
}
