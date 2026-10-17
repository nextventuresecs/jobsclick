import { z } from 'zod';

export const grantCreditSchema = z.object({
  userId: z.string().min(1, 'Target user ID is required'),
  amount: z.number().int().positive('Amount must be a positive integer'),
  reason: z.string().min(1, 'Reason for granting credits is required'),
});

export const deductCreditSchema = z.object({
  amount: z.number().int().positive('Amount must be a positive integer'),
  reason: z.string().min(1, 'Reason for credit deduction is required'),
});

export const unlockContactSchema = z.object({
  seekerId: z.string().min(1, 'Seeker profile ID is required'),
  cost: z.number().int().positive('Cost must be positive').optional(),
});

export const featureJobSchema = z.object({
  jobId: z.string().min(1, 'Job ID is required'),
  cost: z.number().int().positive('Cost must be positive').optional(),
});

export const configureCostSchema = z.object({
  action: z.string().min(1, 'Action key is required'),
  cost: z.number().int().nonnegative('Cost must be zero or positive integer'),
});

export const creditBalanceResponseSchema = z.object({
  balance: z.number().int(),
  creditsAdded: z.number().int(),
  creditsUsed: z.number().int(),
});

export const creditLedgerEntrySchema = z.object({
  id: z.string(),
  user_id: z.string(),
  amount: z.number().int(),
  reason: z.string(),
  actor_id: z.string().nullable().optional(),
  created_at: z.string(),
});

export type GrantCreditInput = z.infer<typeof grantCreditSchema>;
export type DeductCreditInput = z.infer<typeof deductCreditSchema>;
export type UnlockContactInput = z.infer<typeof unlockContactSchema>;
export type FeatureJobInput = z.infer<typeof featureJobSchema>;
export type ConfigureCostInput = z.infer<typeof configureCostSchema>;
export type CreditBalanceResponse = z.infer<typeof creditBalanceResponseSchema>;
export type CreditLedgerEntry = z.infer<typeof creditLedgerEntrySchema>;
