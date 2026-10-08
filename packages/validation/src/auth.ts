import { z } from 'zod';

export const indianMobileNumberSchema = z
  .string()
  .transform((val) => val.replace(/\s+/g, ''))
  .transform((val) => (val.startsWith('+91') ? val.slice(3) : val))
  .refine((val) => /^[6-9]\d{9}$/.test(val), {
    message: 'Must be a valid 10-digit Indian mobile number',
  });
