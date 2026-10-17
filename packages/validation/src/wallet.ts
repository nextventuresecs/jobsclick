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

// Pre-defined credit packs with 18% GST calculation
export interface CreditPackDefinition {
  id: string;
  name: string;
  nameHi: string;
  credits: number;
  priceInr: number; // Base price before GST
  gstRate: number; // 0.18
  gstAmountInr: number;
  totalAmountInr: number;
  popular?: boolean;
}

export const CREDIT_PACKS: Record<string, CreditPackDefinition> = {
  pack_starter: {
    id: 'pack_starter',
    name: 'Starter Pack',
    nameHi: 'स्टार्टर पैक',
    credits: 50,
    priceInr: 500,
    gstRate: 0.18,
    gstAmountInr: 90,
    totalAmountInr: 590,
  },
  pack_growth: {
    id: 'pack_growth',
    name: 'Growth Pack',
    nameHi: 'ग्रोथ पैक',
    credits: 200,
    priceInr: 1800,
    gstRate: 0.18,
    gstAmountInr: 324,
    totalAmountInr: 2124,
    popular: true,
  },
  pack_enterprise: {
    id: 'pack_enterprise',
    name: 'Enterprise Pack',
    nameHi: 'एंटरप्राइज पैक',
    credits: 500,
    priceInr: 4000,
    gstRate: 0.18,
    gstAmountInr: 720,
    totalAmountInr: 4720,
  },
};

export const createPaymentOrderSchema = z.object({
  packId: z.string().min(1, 'Credit pack ID is required'),
  billingName: z.string().optional(),
  billingEmail: z.string().email('Invalid email address').optional(),
  billingPhone: z.string().optional(),
  billingAddress: z.string().optional(),
  billingGstin: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN format')
    .optional()
    .or(z.literal('')),
});

export const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1, 'Razorpay order ID is required'),
  razorpayPaymentId: z.string().min(1, 'Razorpay payment ID is required'),
  razorpaySignature: z.string().min(1, 'Razorpay signature is required'),
});

export const razorpayWebhookEventSchema = z.object({
  event: z.string(),
  entity: z.string().optional(),
  contains: z.array(z.string()).optional(),
  payload: z.record(z.any()),
  created_at: z.number().optional(),
});

export const invoiceResponseSchema = z.object({
  invoiceNumber: z.string(),
  paymentId: z.string(),
  orderId: z.string(),
  date: z.string(),
  hsnCode: z.string(),
  packId: z.string().optional(),
  packName: z.string(),
  credits: z.number().int(),
  baseAmountInr: z.number(),
  gstRate: z.number(),
  cgstInr: z.number(),
  sgstInr: z.number(),
  igstInr: z.number(),
  totalAmountInr: z.number(),
  customerName: z.string(),
  customerGstin: z.string().nullable(),
  status: z.string(),
});

export type GrantCreditInput = z.infer<typeof grantCreditSchema>;
export type DeductCreditInput = z.infer<typeof deductCreditSchema>;
export type UnlockContactInput = z.infer<typeof unlockContactSchema>;
export type FeatureJobInput = z.infer<typeof featureJobSchema>;
export type ConfigureCostInput = z.infer<typeof configureCostSchema>;
export type CreditBalanceResponse = z.infer<typeof creditBalanceResponseSchema>;
export type CreditLedgerEntry = z.infer<typeof creditLedgerEntrySchema>;
export type CreatePaymentOrderInput = z.infer<typeof createPaymentOrderSchema>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
export type RazorpayWebhookEvent = z.infer<typeof razorpayWebhookEventSchema>;
export type InvoiceResponse = z.infer<typeof invoiceResponseSchema>;

// WAL-05 & Section 10.1: Institution pricing tiers
export const SPONSORSHIP_TIERS = {
  Small: {
    tier: 'Small' as const,
    name: 'Small Campus Tier',
    nameHi: 'छोटा परिसर स्तर',
    maxStudents: 2000,
    ratePerStudentInr: 150,
  },
  Medium: {
    tier: 'Medium' as const,
    name: 'Medium Campus Tier',
    nameHi: 'मध्यम परिसर स्तर',
    minStudents: 2001,
    maxStudents: 10000,
    ratePerStudentInr: 100,
  },
  Large: {
    tier: 'Large' as const,
    name: 'Large Campus Tier',
    nameHi: 'बड़ा परिसर स्तर',
    minStudents: 10001,
    ratePerStudentInr: 70,
  },
} as const;

export const sponsorshipTierSchema = z.enum(['Small', 'Medium', 'Large']);

export const sponsorshipQuoteSchema = z.object({
  institutionId: z.string(),
  institutionName: z.string(),
  studentCount: z.number().int().nonnegative(),
  tier: sponsorshipTierSchema,
  ratePerStudentInr: z.number().positive(),
  baseAnnualFeeInr: z.number().nonnegative(),
  gstRate: z.number(),
  gstAmountInr: z.number().nonnegative(),
  totalAnnualFeeInr: z.number().nonnegative(),
  isSponsorshipActive: z.boolean(),
  sponsorshipExpiresAt: z.string().nullable(),
  activeSponsoredCount: z.number().int().nonnegative(),
});

export const activateSponsorshipSchema = z.object({
  paymentReference: z.string().optional(),
  studentCountOverride: z.number().int().positive().optional(),
  idempotencyKey: z.string().optional(),
  force: z.boolean().optional(),
});

export type SponsorshipTier = z.infer<typeof sponsorshipTierSchema>;
export type SponsorshipQuote = z.infer<typeof sponsorshipQuoteSchema>;
export type ActivateSponsorshipInput = z.infer<typeof activateSponsorshipSchema>;

