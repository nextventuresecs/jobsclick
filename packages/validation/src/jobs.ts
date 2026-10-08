import { z } from 'zod';

export const jobCategorySchema = z.enum(['blue', 'white', 'grey', 'open']);
export type JobCategory = z.infer<typeof jobCategorySchema>;
