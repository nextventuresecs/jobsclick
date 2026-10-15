import { z } from 'zod';

export const industryCategoryValues = [
  'technology',
  'manufacturing',
  'sales_operations',
  'logistics_supply',
  'creative_services',
  'healthcare_services',
] as const;

export const legacyCategoryValues = ['blue', 'white', 'grey', 'open'] as const;

export const allJobCategoryValues = [
  ...industryCategoryValues,
  ...legacyCategoryValues,
] as const;

export const industryCategorySchema = z.enum(industryCategoryValues);
export type IndustryCategory = z.infer<typeof industryCategorySchema>;

export const legacyCategorySchema = z.enum(legacyCategoryValues);
export type LegacyCategory = z.infer<typeof legacyCategorySchema>;

export const jobCategorySchema = z.enum(allJobCategoryValues);
export type JobCategory = z.infer<typeof jobCategorySchema>;

export const isIndustryCategory = (category: string): category is IndustryCategory => {
  return (industryCategoryValues as readonly string[]).includes(category);
};

export const applicationStatusValues = [
  'applied',
  'under_review',
  'shortlisted',
  'interview_scheduled',
  'selected',
  'rejected',
  'hired',
] as const;

export const applicationStatusSchema = z.enum(applicationStatusValues);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

export const employmentTypeValues = [
  'Full-time',
  'Part-time',
  'Contract',
  'Apprenticeship',
  'Shift-based',
] as const;

export const employmentTypeSchema = z.enum(employmentTypeValues);
export type EmploymentType = z.infer<typeof employmentTypeSchema>;

export const experienceLevelValues = [
  'Fresher',
  '1-2 Years',
  '3-5 Years',
  '5+ Years',
] as const;

export const experienceLevelSchema = z.enum(experienceLevelValues);
export type ExperienceLevel = z.infer<typeof experienceLevelSchema>;

export const createJobSchema = z.object({
  title: z.string().min(3, 'Job title must be at least 3 characters'),
  description: z.string().min(10, 'Job description must be at least 10 characters'),
  category: jobCategorySchema.default('white'),
  employmentType: employmentTypeSchema.optional().default('Full-time'),
  experienceLevel: experienceLevelSchema.optional().default('Fresher'),
  minPay: z.number().min(0, 'Minimum pay must be positive'),
  maxPay: z.number().min(0, 'Maximum pay must be positive'),
  city: z.string().min(2, 'City is required'),
  district: z.string().min(2, 'District is required'),
  state: z.string().optional().default('India'),
  openings: z.number().int().min(1).default(1),
  skills: z.array(z.string()).default([]),
  expiryDate: z.string().optional(),
});

export const updateJobSchema = createJobSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const jobFilterSchema = z.object({
  keyword: z.string().optional(),
  city: z.string().optional(),
  category: jobCategorySchema.optional(),
  employmentType: employmentTypeSchema.optional(),
  experienceLevel: experienceLevelSchema.optional(),
  minPay: z.coerce.number().optional(),
  limit: z.coerce.number().int().positive().default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const updateApplicationStatusSchema = z.object({
  status: applicationStatusSchema,
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type JobFilterInput = z.infer<typeof jobFilterSchema>;
export type UpdateApplicationStatusInput = z.infer<typeof updateApplicationStatusSchema>;

