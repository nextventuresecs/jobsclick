import { z } from 'zod';

export const jobCategorySchema = z.enum(['blue', 'white', 'grey', 'open']);
export type JobCategory = z.infer<typeof jobCategorySchema>;

export const applicationStatusSchema = z.enum(['applied', 'shortlisted', 'rejected', 'hired']);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

export const createJobSchema = z.object({
  title: z.string().min(3, 'Job title must be at least 3 characters'),
  description: z.string().min(10, 'Job description must be at least 10 characters'),
  category: jobCategorySchema.default('white'),
  minPay: z.number().min(0, 'Minimum pay must be positive'),
  maxPay: z.number().min(0, 'Maximum pay must be positive'),
  city: z.string().min(2, 'City is required'),
  district: z.string().min(2, 'District is required'),
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
