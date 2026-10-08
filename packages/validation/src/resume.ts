import { z } from 'zod';

export const resumeTemplateSchema = z.enum(['classic', 'modern', 'minimalist']);

export const generateResumeSchema = z.object({
  template: resumeTemplateSchema.default('classic'),
  seekerId: z.string().min(1, 'Seeker ID is required'),
  customSummary: z.string().optional(),
});

export type ResumeTemplate = z.infer<typeof resumeTemplateSchema>;
export type GenerateResumeInput = z.infer<typeof generateResumeSchema>;
