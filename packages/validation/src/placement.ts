import { z } from 'zod';

export const PartnershipStatusEnum = z.enum(['active', 'mou_signed', 'pending']);
export type PartnershipStatus = z.infer<typeof PartnershipStatusEnum>;

export const PlacementStageEnum = z.enum([
  'applied',
  'shortlisted',
  'interview',
  'offered',
  'placed',
  'rejected',
]);
export type PlacementStage = z.infer<typeof PlacementStageEnum>;

export const CorporateTieUpSchema = z.object({
  id: z.string(),
  institutionId: z.string(),
  employerId: z.string(),
  companyName: z.string().min(2, 'Company name is required'),
  sector: z.string().min(2, 'Sector is required'),
  partnershipStatus: PartnershipStatusEnum,
  preferredTrades: z.array(z.string()).min(1, 'At least one preferred trade is required'),
  activeCampusDrives: z.number().int().nonnegative().default(0),
  totalOffersIssued: z.number().int().nonnegative().default(0),
  partneredSince: z.string(),
  contactPerson: z.string().min(2, 'Contact person is required'),
});

export type CorporateTieUp = z.infer<typeof CorporateTieUpSchema>;

export const CreateCorporateTieUpSchema = z.object({
  companyName: z.string().min(2, 'Company name is required'),
  sector: z.string().min(2, 'Sector is required'),
  preferredTrades: z.array(z.string()).min(1, 'At least one preferred trade is required'),
  contactPerson: z.string().min(2, 'Contact person is required'),
});

export type CreateCorporateTieUpInput = z.infer<typeof CreateCorporateTieUpSchema>;

export const PlacementApplicationSchema = z.object({
  id: z.string(),
  institutionId: z.string().optional(),
  employerId: z.string().optional(),
  studentId: z.string(),
  studentName: z.string(),
  rollNumber: z.string(),
  trade: z.string(),
  passingYear: z.string(),
  grade: z.string().optional(),
  jobId: z.string(),
  jobTitle: z.string(),
  companyName: z.string(),
  isPartneredEmployer: z.boolean().default(true),
  stage: PlacementStageEnum,
  interviewDate: z.string().optional(),
  offerPackage: z.string().optional(),
  offerLetterUrl: z.string().url().optional(),
  updatedAt: z.string(),
});

export type PlacementApplication = z.infer<typeof PlacementApplicationSchema>;

export const ShareCandidateBatchSchema = z.object({
  partnerId: z.string().min(1, 'Partner ID is required'),
  driveSubject: z.string().min(3, 'Drive subject is required'),
  studentIds: z.array(z.string()).min(1, 'Select at least one candidate'),
});

export type ShareCandidateBatchInput = z.infer<typeof ShareCandidateBatchSchema>;

export const UpdatePlacementStageSchema = z.object({
  stage: PlacementStageEnum,
  offerPackage: z.string().optional(),
  interviewDate: z.string().optional(),
});

export type UpdatePlacementStageInput = z.infer<typeof UpdatePlacementStageSchema>;
