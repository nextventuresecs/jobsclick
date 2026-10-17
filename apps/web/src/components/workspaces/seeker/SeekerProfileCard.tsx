'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@indian-job-portal/ui';
import type { SeekerProfileData } from '../../../data/sampleWorkspaces';
import { User, ShieldCheck, CheckCircle2, GraduationCap, Award, Briefcase, Lock, Edit3 } from 'lucide-react';

interface SeekerProfileCardProps {
  readonly profile: SeekerProfileData;
  readonly onEdit: () => void;
}

export function SeekerProfileCard({ profile, onEdit }: SeekerProfileCardProps) {
  const t = useTranslations('SeekerWorkspace');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">{t('dossierHeading')}</h2>
          <p className="text-xs text-gray-500">{t('dossierSubheading')}</p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5"
        >
          <Edit3 className="w-4 h-4" />
          <span>{t('editProfile')}</span>
        </Button>
      </div>

      {/* 1. Identity & Demographics */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2 flex items-center gap-1.5">
          <User className="w-4 h-4" />
          <span>{t('secPersonalInfo')}</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-gray-500">{t('labelFullName')}</span>
            <p className="font-bold text-gray-900 mt-0.5 text-sm">{profile.name}</p>
          </div>
          <div>
            <span className="text-gray-500">{t('labelCandidateType')}</span>
            <p className="font-bold text-gray-900 mt-0.5 capitalize">
              {profile.seekerType === 'student' ? t('typeStudent') : t('typeIndividual')}
            </p>
          </div>
          <div>
            <span className="text-gray-500">{t('labelGenderDob')}</span>
            <p className="font-bold text-gray-900 mt-0.5">{profile.gender} • {profile.dob}</p>
          </div>
          <div>
            <span className="text-gray-500">{t('labelCurrentRole')}</span>
            <p className="font-bold text-gray-900 mt-0.5">{profile.currentRole || t('roleFresher')}</p>
          </div>
          <div>
            <span className="text-gray-500">{t('labelLocation')}</span>
            <p className="font-bold text-gray-900 mt-0.5">
              {profile.city}, {profile.district}, {profile.state} ({profile.pincode})
            </p>
          </div>
          <div>
            <span className="text-gray-500">{t('labelCampusAffiliation')}</span>
            <p className="font-bold text-gray-900 mt-0.5">
              {profile.enrolledViaInstitution || profile.institution || t('directRegistration')}
            </p>
          </div>
        </div>
      </div>

      {/* 2. DPDP Act & Statutory KYC (Hard Invariant #8) */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2 flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4" />
          <span>{t('secDpdp')}</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-gray-500">{t('labelAadhaarLastFour')}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-mono font-bold text-gray-900">
                {profile.aadhaarLastFour ? `•••• •••• ${profile.aadhaarLastFour}` : t('notProvided')}
              </span>
              {profile.aadhaarVerified && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>{t('verified')}</span>
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">{t('aadhaarNotice')}</p>
          </div>
          <div>
            <span className="text-gray-500">{t('labelApaarId')}</span>
            <p className="font-mono font-bold text-gray-900 mt-0.5">{profile.apaarId || t('optionalNotProvided')}</p>
          </div>
          <div>
            <span className="text-gray-500">{t('labelDpdpConsent')}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="font-bold text-emerald-700">{t('consentActive')}</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">{t('dpdpGuidelines')}</p>
          </div>
        </div>
      </div>

      {/* 3. Education & Trade Qualifications */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2 flex items-center gap-1.5">
          <GraduationCap className="w-4 h-4" />
          <span>{t('secEducation')}</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-gray-500">{t('labelHighestQual')}</span>
            <p className="font-bold text-gray-900 mt-0.5">{profile.qualification}</p>
          </div>
          <div>
            <span className="text-gray-500">{t('labelTrainingInstitute')}</span>
            <p className="font-bold text-gray-900 mt-0.5">{profile.institution}</p>
          </div>
          <div>
            <span className="text-gray-500">{t('labelPassingYear')}</span>
            <p className="font-bold text-gray-900 mt-0.5">
              Batch of {profile.graduationYear} • {profile.experienceYears} {t('yearsExp')}
            </p>
          </div>
        </div>
      </div>

      {/* 4. Skills & Competencies */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2 flex items-center gap-1.5">
          <Award className="w-4 h-4" />
          <span>{t('secSkills')}</span>
        </h3>
        <div className="space-y-3">
          <div>
            <span className="text-xs font-semibold text-gray-500 block mb-1.5">{t('labelTradeSkills')}:</span>
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((s, idx) => (
                <span key={idx} className="px-3 py-1 bg-orange-50 text-orange-800 text-xs font-semibold rounded-lg border border-orange-200">
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div className="pt-2 text-xs">
            <span className="text-gray-500 font-semibold">{t('labelLanguages')}:</span>
            <span className="font-bold text-gray-800 ml-2">{profile.languages.join(', ')}</span>
          </div>
          <div className="pt-2 text-xs">
            <span className="text-gray-500 font-semibold">{t('secBio')}:</span>
            <p className="text-gray-700 mt-1 leading-relaxed bg-gray-50 p-4 rounded-xl border border-gray-200">
              {profile.bio}
            </p>
          </div>
        </div>
      </div>

      {/* 5. Career Preferences & Invariant Protection */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 border-b border-gray-100 pb-2 flex items-center gap-1.5">
          <Briefcase className="w-4 h-4" />
          <span>{t('labelRelocate')}</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-gray-500">{t('preferredLocationsHeading')}</span>
            <p className="font-bold text-gray-900 mt-0.5">{profile.preferredLocations.join(', ')}</p>
          </div>
          <div>
            <span className="text-gray-500">{t('labelRelocate')}</span>
            <p className="font-bold text-gray-900 mt-0.5">{profile.willingToRelocate ? t('yes') : t('no')}</p>
          </div>
          <div>
            <span className="text-gray-500">{t('hardInvariant1Notice')}</span>
            <div className="flex items-center gap-1 mt-0.5 text-emerald-700 font-semibold">
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
              <span>{t('hardInvariant1Notice')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
