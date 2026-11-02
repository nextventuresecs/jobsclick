import { z } from 'zod';

/**
 * Normalizes Indian phone numbers to a canonical 10-digit string (e.g., "9876543210").
 * Strips +91, 91, 0 prefixes and whitespace so Redis rate-limit keys and DB uniqueness never split.
 */
export const IndianPhoneSchema = z
  .string()
  .trim()
  .transform((val) => {
    const digits = val.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) {
      return digits.slice(2);
    }
    if (digits.length === 11 && digits.startsWith('0')) {
      return digits.slice(1);
    }
    return digits;
  })
  .refine((digits) => /^[6-9]\d{9}$/.test(digits), {
    message: 'Invalid mobile number. Must be a valid 10-digit number starting with 6-9.',
  });

export const indianMobileNumberSchema = IndianPhoneSchema;

/**
 * Self-signup is strictly limited to seekers and employers.
 * Elevated roles (platform_admin, msme_admin, institution_admin, intermediary)
 * can ONLY be provisioned server-side by an existing platform_admin.
 */
export const SelfSignupRoleSchema = z.enum(['job_seeker', 'employer']);

export const AllUserRolesSchema = z.enum([
  'job_seeker',
  'employer',
  'institution_admin',
  'intermediary',
  'msme_admin',
  'platform_admin',
  'admin',
]);

export const userRoleSchema = z.enum(['employer', 'intermediary', 'job_seeker', 'admin', 'msme_admin']);

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

export const BACKEND_TO_CLIENT_ROLE_MAP: Record<string, ClientRole> = {
  job_seeker: 'jobseeker',
  employer: 'employer',
  intermediary: 'institution',
  msme_admin: 'msme_dept',
  admin: 'platform_admin',
  platform_admin: 'platform_admin',
  institution_admin: 'institution',
} as const;

export function toBackendRole(clientRole: ClientRole): UserRole {
  return CLIENT_TO_BACKEND_ROLE_MAP[clientRole] || 'job_seeker';
}

export function toClientRole(backendRole: string): ClientRole {
  return BACKEND_TO_CLIENT_ROLE_MAP[backendRole] || 'jobseeker';
}

export function isClientRole(val: unknown): val is ClientRole {
  return typeof val === 'string' && clientRoleSchema.safeParse(val).success;
}

export function isUserRole(val: unknown): val is UserRole {
  return typeof val === 'string' && (AllUserRolesSchema.safeParse(val).success || val === 'admin');
}

export const udyamNumberSchema = z
  .string()
  .transform((val) => val.trim().toUpperCase())
  .refine((val) => /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/.test(val), {
    message: 'Must be a valid Udyam Registration Number (e.g. UDYAM-MH-26-0019482)',
  });

export const msmeAuthSchema = z.object({
  udyamNumber: udyamNumberSchema,
  phone: IndianPhoneSchema.optional(),
});

export const SendOtpSchema = z.object({
  phone: IndianPhoneSchema,
  turnstileToken: z.string().min(1, 'Cloudflare Turnstile token is required').optional(),
  language: z.enum(['en', 'hi']).default('en'),
});

export const sendOtpSchema = SendOtpSchema;

export const VerifyOtpSchema = z.object({
  phone: IndianPhoneSchema,
  code: z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
  role: z.union([SelfSignupRoleSchema, clientRoleSchema, userRoleSchema]).default('job_seeker'),
});

export const verifyOtpSchema = VerifyOtpSchema;

export const AddEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email('Valid email address is required'),
});

export const addEmailSchema = AddEmailSchema;

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export type SendOtpInput = z.infer<typeof SendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;
export type AddEmailInput = z.infer<typeof AddEmailSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type MsmeAuthInput = z.infer<typeof msmeAuthSchema>;
export type UserRole = z.infer<typeof AllUserRolesSchema>;
