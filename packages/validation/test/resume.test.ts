import { describe, it, expect } from 'vitest';
import { generateResumeSchema } from '../src/resume.js';

describe('Resume Builder Schemas - Issue #30', () => {
  it('validates generateResumeSchema payload', () => {
    const valid = generateResumeSchema.parse({
      template: 'modern',
      seekerId: 'seeker_100',
      customSummary: 'Experienced Tally accountant with 3 years experience',
    });

    expect(valid.template).toBe('modern');
    expect(valid.seekerId).toBe('seeker_100');
  });
});
