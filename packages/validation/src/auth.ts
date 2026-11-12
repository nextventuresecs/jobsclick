import { z } from 'zod';

/**
 * Normalizes Indian phone numbers to a canonical 10-digit string (e.g., "9876543210").
 * Strips +91, 91, 0091, 0 prefixes and whitespace so Redis rate-limit keys and DB uniqueness never split.
 */
export const IndianPhoneSchema = z
  .string()
  .trim()
  .transform((val) => {
    const digits = val.replace(/\D/g, '');
    // 0091 prefix: international exit 00 + country code 91 (e.g. "0091 9876543210" -> 14 digits)
    if (digits.length === 14 && digits.startsWith('0091')) {
      return digits.slice(4);
    }
    // +91 followed by domestic trunk prefix 0 (e.g. "+91 09876543210" -> 13 digits starting with 910)
    if (digits.length === 13 && digits.startsWith('910')) {
      return digits.slice(3);
    }
    // Standard 91 country code prefix (e.g. "919123456789" -> 12 digits starting with 91)
    if (digits.length === 12 && digits.startsWith('91')) {
      return digits.slice(2);
    }
    // Single domestic trunk prefix 0 (e.g. "09876543210" -> 11 digits starting with 0)
    if (digits.length === 11 && digits.startsWith('0')) {
      return digits.slice(1);
    }
    return digits;
  })
  .refine((digits) => /^[6-9]\d{9}$/.test(digits), {
    message: 'Invalid mobile number. Must be a valid 10-digit number starting with 6-9.',
  });

/**
 * Self-signup is strictly limited to job seekers and employers (Audit P0-5).
 * Elevated roles (admin, msme_admin, intermediary) can ONLY be provisioned
 * server-side by an existing platform_admin or database migration.
 */
export const SelfSignupRoleSchema = z.enum(['job_seeker', 'employer']);
export type SelfSignupRole = z.infer<typeof SelfSignupRoleSchema>;
export const SELF_SIGNUP_ROLES: readonly SelfSignupRole[] = SelfSignupRoleSchema.options;

/**
 * Canonical backend UserRole derived directly from the PostgreSQL user_role enum:
 * CREATE TYPE user_role AS ENUM ('employer', 'intermediary', 'job_seeker', 'admin', 'msme_admin');
 */
export const UserRoleSchema = z.enum([
  'employer',
  'intermediary',
  'job_seeker',
  'admin',
  'msme_admin',
]);
export type UserRole = z.infer<typeof UserRoleSchema>;
export const USER_ROLES: readonly UserRole[] = UserRoleSchema.options;

/**
 * Client-facing roles (used in web frontend routes and UI contexts).
 * Maps to backend UserRole via CLIENT_TO_BACKEND_ROLE_MAP.
 */
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

export function toBackendRole(clientRole: ClientRole | string): UserRole {
  if (clientRole in CLIENT_TO_BACKEND_ROLE_MAP) {
    return CLIENT_TO_BACKEND_ROLE_MAP[clientRole as ClientRole];
  }
  if (
    clientRole === 'job_seeker' ||
    clientRole === 'employer' ||
    clientRole === 'intermediary' ||
    clientRole === 'admin' ||
    clientRole === 'msme_admin'
  ) {
    return clientRole as UserRole;
  }
  return 'job_seeker';
}

export function toClientRole(backendRole: string): ClientRole {
  if (backendRole in BACKEND_TO_CLIENT_ROLE_MAP) {
    return BACKEND_TO_CLIENT_ROLE_MAP[backendRole as UserRole];
  }
  if (backendRole === 'institution_admin') return 'institution';
  if (backendRole === 'platform_admin') return 'platform_admin';
  return 'jobseeker';
}

export function isClientRole(val: unknown): val is ClientRole {
  return typeof val === 'string' && clientRoleSchema.safeParse(val).success;
}

export function isUserRole(val: unknown): val is UserRole {
  return typeof val === 'string' && UserRoleSchema.safeParse(val).success;
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

export const VerifyOtpSchema = z
  .object({
    phone: IndianPhoneSchema,
    code: z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
    role: SelfSignupRoleSchema.default('job_seeker'),
    consentVersion: z
      .string()
      .max(32, 'consentVersion must not exceed 32 characters')
      .optional(),
  })
  .strict();

export const AddEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, 'Email must not exceed 254 characters')
    .email('Valid email address is required'),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export type SendOtpInput = z.infer<typeof SendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;
export type AddEmailInput = z.infer<typeof AddEmailSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type MsmeAuthInput = z.infer<typeof msmeAuthSchema>;

// Backward-compatibility aliases for web consumers prior to Phase 7b
export const indianMobileNumberSchema = IndianPhoneSchema;
export const sendOtpSchema = SendOtpSchema;
export const verifyOtpSchema = VerifyOtpSchema;
export const addEmailSchema = AddEmailSchema;
