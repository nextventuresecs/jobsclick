'use client';

import { useState } from 'react';
import type { IndustryCategory, EmploymentType, ExperienceLevel } from '@indian-job-portal/validation';
import type { CompanyItem } from '../../../data/sampleCompanies';

export function useJobPostFormState(company: CompanyItem) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<IndustryCategory>('manufacturing');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('Full-time');
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>('1-2 Years');
  const [workShift, setWorkShift] = useState<string>('Rotational');
  const [qualification, setQualification] = useState<string>('ITI / Trade Certificate');
  const [plantLocation, setPlantLocation] = useState(company.address);
  const [jobCity, setJobCity] = useState(company.city);
  const [jobDistrict, setJobDistrict] = useState(company.district);
  const [salaryMin, setSalaryMin] = useState(18000);
  const [salaryMax, setSalaryMax] = useState(28000);
  const [openings, setOpenings] = useState(2);
  const [skillsInput, setSkillsInput] = useState('CNC Milling, Blueprint Reading');
  const [description, setDescription] = useState('');
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [successNotice, setSuccessNotice] = useState('');

  const resetForm = () => {
    setTitle('');
    setDescription('');
  };

  return {
    title, setTitle,
    category, setCategory,
    employmentType, setEmploymentType,
    experienceLevel, setExperienceLevel,
    workShift, setWorkShift,
    qualification, setQualification,
    plantLocation, setPlantLocation,
    jobCity, setJobCity,
    jobDistrict, setJobDistrict,
    salaryMin, setSalaryMin,
    salaryMax, setSalaryMax,
    openings, setOpenings,
    skillsInput, setSkillsInput,
    description, setDescription,
    formErrors, setFormErrors,
    successNotice, setSuccessNotice,
    resetForm,
  };
}
