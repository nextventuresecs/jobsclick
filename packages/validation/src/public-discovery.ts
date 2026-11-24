import { z } from 'zod';
import { institutionCmsSchema, departmentSchema } from './institution-cms';

export const publicDirectoryQuerySchema = z.object({
  query: z.string().trim().max(100).optional(),
  sector: z.string().max(100).optional(),
  type: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

export type PublicDirectoryQuery = z.infer<typeof publicDirectoryQuerySchema>;

export const publicInstitutionCmsSchema = institutionCmsSchema.extend({
  departments: z.array(departmentSchema.omit({ contactEmail: true, contactPhone: true })).default([]),
});

export type PublicInstitutionCms = z.infer<typeof publicInstitutionCmsSchema>;
