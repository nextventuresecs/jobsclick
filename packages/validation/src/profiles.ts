import { z } from 'zod';
import { jobCategorySchema } from './jobs';

export const seekerTypeSchema = z.enum(['student', 'individual']);

export const jobSeekerProfileSchema = z
  .object({
    fullName: z.string().min(2, 'Full name is required'),
    photoUrl: z.string().url().optional().or(z.literal('')),
    seekerType: seekerTypeSchema.default('individual'),
    apaarId: z.string().optional(),
    aadhaarLastFour: z
      .string()
      .regex(/^\d{4}$/, 'Must be exactly the last 4 digits of Aadhaar')
      .optional(),
    dpdpConsentGiven: z.boolean().default(false),
    skills: z.array(z.string()).default([]),
    preferredCategories: z.array(jobCategorySchema).default(['white']),
    city: z.string().min(2, 'City is required'),
  })
  .refine(
    (data) => {
      if ((data.aadhaarLastFour || data.apaarId) && !data.dpdpConsentGiven) {
        return false;
      }
      return true;
    },
    {
      message: 'DPDP consent must be accepted before submitting Aadhaar or APAAR ID',
      path: ['dpdpConsentGiven'],
    },
  );

export const businessProfileSchema = z.object({
  companyName: z.string().min(2, 'Company name is required'),
  ownershipType: z.enum([
    'Proprietorship',
    'Private Limited',
    'LLP',
    'Public Limited',
    'Registered',
    'Unregistered',
  ]),
  companySize: z.enum(['Micro', 'Small', 'Medium']),
  sector: z.string().min(2, 'Sector is required'),
  address: z.string().min(5, 'Address is required'),
  city: z.string().min(2, 'City is required'),
  district: z.string().min(2, 'District is required'),
  logoUrl: z.string().url().optional().or(z.literal('')),
});

export const institutionProfileSchema = z.object({
  institutionName: z.string().min(2, 'Institution name is required'),
  affiliation: z.string().min(2, 'Affiliation is required'),
  address: z.string().min(5, 'Address is required'),
  contactPerson: z.string().min(2, 'Contact person is required'),
});

export type JobSeekerProfileInput = z.infer<typeof jobSeekerProfileSchema>;
export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;
export type InstitutionProfileInput = z.infer<typeof institutionProfileSchema>;
