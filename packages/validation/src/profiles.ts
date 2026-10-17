import { z } from 'zod';
import { jobCategorySchema } from './jobs';

export const seekerTypeSchema = z.enum(['student', 'individual']);

export const jobSeekerProfileSchema = z
  .object({
    fullName: z.string().min(2, 'Full name is required'),
    photoUrl: z.string().url().optional().or(z.literal('')),
    seekerType: seekerTypeSchema.default('individual'),
    gender: z.enum(['Male', 'Female', 'Other']).optional(),
    dob: z.string().optional(),
    apaarId: z.string().optional(),
    aadhaarLastFour: z
      .string()
      .regex(/^\d{4}$/, 'Must be exactly the last 4 digits of Aadhaar')
      .optional(),
    dpdpConsentGiven: z.boolean().default(false),
    skills: z.array(z.string()).default([]),
    preferredCategories: z.array(jobCategorySchema).default(['manufacturing']),
    city: z.string().min(2, 'City is required'),
    district: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().regex(/^\d{6}$/, 'Must be a 6-digit Indian PIN code').optional().or(z.literal('')),
    qualification: z.string().optional(),
    institution: z.string().optional(),
    graduationYear: z.string().optional(),
    experienceYears: z.coerce.number().min(0).optional(),
    currentRole: z.string().optional(),
    languages: z.array(z.string()).optional(),
    preferredLocations: z.array(z.string()).optional(),
    willingToRelocate: z.boolean().optional(),
    bio: z.string().max(2000).optional(),
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
  companySize: z.enum(['Micro', 'Small', 'Medium']).default('Small'),
  sector: z.string().min(2, 'Sector is required'),
  address: z.string().min(5, 'Address is required'),
  city: z.string().min(2, 'City is required'),
  district: z.string().min(2, 'District is required'),
  state: z.string().optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  // Fields from Check sheet of msme_business_onboarding_template.xlsx
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  website: z.string().optional(),
  yearOfRegistration: z.string().optional(),
  commencementYear: z.string().optional(),
  founderOrDirector: z.string().optional(),
  directorPhotoUrl: z.string().optional(),
  designation: z.string().optional(),
  knowMyBusiness: z.string().optional(),
  productsBrief: z.string().optional(),
  servicesBrief: z.string().optional(),
  socialMedia: z
    .object({
      instagram: z.string().optional(),
      facebook: z.string().optional(),
      youtube: z.string().optional(),
      other: z.string().optional(),
    })
    .optional(),
  isMsme: z.boolean().optional(),
  udyamNumber: z.string().optional(),
  isDpiitStartup: z.boolean().optional(),
  dpiitNumber: z.string().optional(),
});

export const institutionTypeSchema = z.enum([
  'iti',
  'polytechnic',
  'engineering',
  'vocational_training',
  'degree_college',
  'other',
]);

export const institutionProfileSchema = z.object({
  institutionName: z.string().min(2, 'Institution name is required'),
  institutionType: institutionTypeSchema.default('iti'),
  affiliation: z.string().min(2, 'Affiliation is required'),
  affiliationCode: z.string().optional(),
  establishmentYear: z.coerce.number().int().min(1900).max(2099).optional(),
  principalName: z.string().optional(),
  contactPerson: z.string().min(2, 'Contact person is required'),
  contactDesignation: z.string().optional(),
  contactEmail: z.string().email('Invalid email address').optional().or(z.literal('')),
  contactPhone: z.string().optional(),
  website: z.string().url('Invalid website URL').optional().or(z.literal('')),
  address: z.string().min(5, 'Address is required'),
  city: z.string().optional(),
  district: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().regex(/^\d{6}$/, 'Must be a 6-digit Indian PIN code').optional().or(z.literal('')),
  tradesOffered: z.array(z.string()).optional(),
  annualCapacity: z.coerce.number().int().nonnegative().optional(),
  placementBrochureUrl: z.string().url().optional().or(z.literal('')),
  about: z.string().max(2000).optional(),
});

export type InstitutionType = z.infer<typeof institutionTypeSchema>;
export type JobSeekerProfileInput = z.infer<typeof jobSeekerProfileSchema>;
export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;
export type InstitutionProfileInput = z.infer<typeof institutionProfileSchema>;
