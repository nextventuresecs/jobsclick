import { z } from 'zod';

export const indianMobileNumberSchema = z
  .string()
  .transform((val) => val.replace(/\s+/g, ''))
  .transform((val) => (val.startsWith('+91') ? val.slice(3) : val))
  .refine((val) => /^[6-9]\d{9}$/.test(val), {
    message: 'Must be a valid 10-digit Indian mobile number',
  });

export const userRoleSchema = z.enum(['employer', 'intermediary', 'job_seeker', 'admin', 'msme_admin']);

export const sendOtpSchema = z.object({
  phone: indianMobileNumberSchema,
  turnstileToken: z.string().optional(),
});

export const verifyOtpSchema = z.object({
  phone: indianMobileNumberSchema,
  code: z.string().length(6, 'OTP must be exactly 6 digits'),
  role: userRoleSchema.default('job_seeker'),
});

export const addEmailSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type AddEmailInput = z.infer<typeof addEmailSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
