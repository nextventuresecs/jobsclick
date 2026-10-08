import { describe, it, expect } from 'vitest';
import { createJobSchema, jobFilterSchema, updateApplicationStatusSchema } from '../src/jobs.js';

describe('Job Validation Schemas - Issues #13, #14, #15', () => {
  it('validates createJobSchema input', () => {
    const valid = createJobSchema.parse({
      title: 'Tally Accountant MSME',
      description: 'Need full-time Tally accountant for MSME business in Ujjain.',
      category: 'white',
      minPay: 15000,
      maxPay: 25000,
      city: 'Ujjain',
      district: 'Ujjain',
      openings: 2,
      skills: ['Tally', 'GST'],
    });

    expect(valid.title).toBe('Tally Accountant MSME');
    expect(valid.category).toBe('white');
  });

  it('validates jobFilterSchema parameters', () => {
    const filter = jobFilterSchema.parse({
      keyword: 'Accountant',
      city: 'Indore',
      category: 'white',
      minPay: '10000',
    });

    expect(filter.keyword).toBe('Accountant');
    expect(filter.minPay).toBe(10000);
  });

  it('validates updateApplicationStatusSchema', () => {
    const valid = updateApplicationStatusSchema.parse({ status: 'shortlisted' });
    expect(valid.status).toBe('shortlisted');
  });
});
