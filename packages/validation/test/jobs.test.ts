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
    expect(updateApplicationStatusSchema.parse({ status: 'interview_scheduled' }).status).toBe('interview_scheduled');
    expect(updateApplicationStatusSchema.parse({ status: 'selected' }).status).toBe('selected');
  });

  it('validates modern industry categories and type guards (Confirmed Decision #1)', async () => {
    const { isIndustryCategory, industryCategoryValues } = await import('../src/jobs.js');
    
    expect(industryCategoryValues).toContain('technology');
    expect(industryCategoryValues).toContain('manufacturing');
    expect(industryCategoryValues).toContain('sales_operations');
    expect(industryCategoryValues).toContain('logistics_supply');
    expect(industryCategoryValues).toContain('creative_services');
    expect(industryCategoryValues).toContain('healthcare_services');

    expect(isIndustryCategory('technology')).toBe(true);
    expect(isIndustryCategory('manufacturing')).toBe(true);
    expect(isIndustryCategory('white')).toBe(false);
    expect(isIndustryCategory('invalid_category')).toBe(false);

    const job = createJobSchema.parse({
      title: 'Full Stack React Engineer',
      description: 'Building modern web interfaces with Next.js and TypeScript.',
      category: 'technology',
      employmentType: 'Full-time',
      experienceLevel: '1-2 Years',
      minPay: 35000,
      maxPay: 60000,
      city: 'Bengaluru',
      district: 'Bengaluru Urban',
      skills: ['React', 'TypeScript', 'Node.js'],
    });

    expect(job.category).toBe('technology');
    expect(job.employmentType).toBe('Full-time');
    expect(job.experienceLevel).toBe('1-2 Years');
  });
});
