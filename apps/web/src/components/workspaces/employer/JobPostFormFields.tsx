'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { JobPostFormData } from './JobPostForm';
import { employmentTypeValues, experienceLevelValues } from '@indian-job-portal/validation';
import type { IndustryCategory, EmploymentType, ExperienceLevel } from '@indian-job-portal/validation';

export function JobPostFormFields({ formData: d }: { readonly formData: JobPostFormData }) {
  const t = useTranslations('EmployerWorkspace');

  return (
    <>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelJobTitle')} *</label>
        <input
          type="text" value={d.title} onChange={(e) => d.setTitle(e.target.value)}
          placeholder="e.g. CNC Machine Operator & Programmer"
          className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelCategory')} *</label>
          <select
            value={d.category} onChange={(e) => d.setCategory(e.target.value as IndustryCategory)}
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden bg-white"
          >
            <option value="manufacturing">Manufacturing & Trades</option>
            <option value="technology">Technology & Software</option>
            <option value="sales_operations">Sales & Operations</option>
            <option value="logistics_supply">Logistics & Supply Chain</option>
            <option value="creative_services">Creative & Design</option>
            <option value="healthcare_services">Healthcare & Services</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelEmploymentType')} *</label>
          <select
            value={d.employmentType} onChange={(e) => d.setEmploymentType(e.target.value as EmploymentType)}
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden bg-white"
          >
            {employmentTypeValues.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelExperienceLevel')}</label>
          <select
            value={d.experienceLevel} onChange={(e) => d.setExperienceLevel(e.target.value as ExperienceLevel)}
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden bg-white"
          >
            {experienceLevelValues.map((lvl) => (
              <option key={lvl} value={lvl}>{lvl}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelWorkShift')}</label>
          <select
            value={d.workShift} onChange={(e) => d.setWorkShift(e.target.value)}
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden bg-white"
          >
            <option value="Rotational">Rotational Shifts (A/B/C)</option>
            <option value="Day Shift">Day Shift Only (8 AM - 5 PM)</option>
            <option value="Night Shift">Night Shift Only</option>
            <option value="General Shift">General Shift (9 AM - 6 PM)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelQualification')}</label>
          <select
            value={d.qualification} onChange={(e) => d.setQualification(e.target.value)}
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden bg-white"
          >
            <option value="ITI / Trade Certificate">ITI / Trade Certificate</option>
            <option value="Diploma / Polytechnic">Diploma / Polytechnic</option>
            <option value="Graduate / Degree">Graduate / B.E. / B.Tech</option>
            <option value="10th / 12th Pass">10th / 12th Pass</option>
            <option value="Any Qualification">Any / No Barrier</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelPlantLocation')}</label>
          <input
            type="text" value={d.plantLocation} onChange={(e) => d.setPlantLocation(e.target.value)}
            placeholder="e.g. Unit 4, Phase II"
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelJobCity')} *</label>
          <input
            type="text" value={d.jobCity} onChange={(e) => d.setJobCity(e.target.value)}
            placeholder="e.g. Pune"
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelJobDistrict')} *</label>
          <input
            type="text" value={d.jobDistrict} onChange={(e) => d.setJobDistrict(e.target.value)}
            placeholder="e.g. Pune"
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelSalaryMin')} *</label>
          <input
            type="number" value={d.salaryMin} onChange={(e) => d.setSalaryMin(Number(e.target.value))}
            className="w-full px-3 py-2.5 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelSalaryMax')} *</label>
          <input
            type="number" value={d.salaryMax} onChange={(e) => d.setSalaryMax(Number(e.target.value))}
            className="w-full px-3 py-2.5 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelOpenings')} *</label>
          <input
            type="number" min={1} value={d.openings} onChange={(e) => d.setOpenings(Number(e.target.value))}
            className="w-full px-3 py-2.5 text-sm font-mono rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelSkills')}</label>
        <input
          type="text" value={d.skillsInput} onChange={(e) => d.setSkillsInput(e.target.value)}
          placeholder="CNC Milling, Blueprint Reading, Fanuc"
          className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
          required
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">{t('labelJobDesc')} *</label>
        <textarea
          rows={4} value={d.description} onChange={(e) => d.setDescription(e.target.value)}
          placeholder="Detail daily responsibilities..."
          className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F97316] focus:outline-hidden"
          required
        />
      </div>
    </>
  );
}
