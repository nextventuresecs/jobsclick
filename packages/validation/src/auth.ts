import { z } from 'zod';

export const indianMobileNumberSchema = z
  .string()
  .transform((val) => val.replace(/\s+/g, ''))
  .transform((val) => (val.startsWith('+91') ? val.slice(3) : val))
  .refine((val) => /^[6-9]\d{9}$/.test(val), {
    message: 'Must be a valid 10-digit Indian mobile number',
  });

export const userRoleSchema = z.enum(['employer', 'intermediary', 'job_seeker', 'admin', 'msme_admin']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const clientRoleSchema = z.enum([
  'jobseeker',
  'employer',
  'institution',
  'msme_dept',
  'platform_admin',
]);
export type ClientRole = z.infer<typeof clientRoleSchema>;

export const CLIENT_TO_BACKEND_ROLE_MAP: Record<ClientRole, UserRole> = {
  jobseeker: 'job_seeker',
  employer: 'employer',
  institution: 'intermediary',
  msme_dept: 'msme_admin',
  platform_admin: 'admin',
} as const;

export const BACKEND_TO_CLIENT_ROLE_MAP: Record<UserRole, ClientRole> = {
  job_seeker: 'jobseeker',
  employer: 'employer',
  intermediary: 'institution',
  msme_admin: 'msme_dept',
  admin: 'platform_admin',
} as const;

export function toBackendRole(clientRole: ClientRole): UserRole {
  return CLIENT_TO_BACKEND_ROLE_MAP[clientRole];
}

export function toClientRole(backendRole: UserRole): ClientRole {
  return BACKEND_TO_CLIENT_ROLE_MAP[backendRole];
}

export function isClientRole(val: unknown): val is ClientRole {
  return typeof val === 'string' && clientRoleSchema.safeParse(val).success;
}

export function isUserRole(val: unknown): val is UserRole {
  return typeof val === 'string' && userRoleSchema.safeParse(val).success;
}

export const udyamNumberSchema = z
  .string()
  .transform((val) => val.trim().toUpperCase())
  .refine((val) => /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/.test(val), {
    message: 'Must be a valid Udyam Registration Number (e.g. UDYAM-MH-26-0019482)',
  });

export const msmeAuthSchema = z.object({
  udyamNumber: udyamNumberSchema,
  phone: indianMobileNumberSchema.optional(),
});

export const sendOtpSchema = z.object({
  phone: indianMobileNumberSchema,
  turnstileToken: z.string().optional(),
  language: z.enum(['en', 'hi']).optional(),
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
export type MsmeAuthInput = z.infer<typeof msmeAuthSchema>;

