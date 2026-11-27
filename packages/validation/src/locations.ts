import { z } from 'zod';

export const stateCodeSchema = z.coerce.number().int().positive();
export const districtIdSchema = z.string().uuid();
export const indianPincodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d{5}$/, 'Must be a valid 6-digit Indian PIN code');

export const locationDistrictsQuerySchema = z.object({
  state: stateCodeSchema,
});

export const locationPincodeParamSchema = z.object({
  pin: indianPincodeSchema,
});

export const locationStateSchema = z.object({
  lgdCode: z.number().int().positive(),
  nameEn: z.string(),
  nameHi: z.string().nullable(),
  isUt: z.boolean(),
});

export const locationDistrictSchema = z.object({
  id: z.string().uuid(),
  lgdCode: z.number().int().positive().nullable(),
  stateCode: z.number().int().positive(),
  nameEn: z.string(),
  nameHi: z.string().nullable(),
  isActive: z.boolean(),
  source: z.enum(['lgd', 'manual-gazette']),
});

export const locationPincodeResponseSchema = z.object({
  pincode: indianPincodeSchema,
  stateCode: z.number().int().positive().nullable(),
  districtId: z.string().uuid().nullable(),
  ambiguous: z.boolean(),
  candidateDistrictIds: z.array(z.string().uuid()),
  state: locationStateSchema.nullable(),
  district: locationDistrictSchema.nullable(),
  candidates: z.array(locationDistrictSchema),
});

export type LocationState = z.infer<typeof locationStateSchema>;
export type LocationDistrict = z.infer<typeof locationDistrictSchema>;
export type LocationPincodeResponse = z.infer<typeof locationPincodeResponseSchema>;
