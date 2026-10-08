import { describe, it, expect } from 'vitest';
import { bulkUploadSchema, inviteWaveSchema } from '../src/bulk.js';

describe('Bulk Onboarding Schemas - Epic 4', () => {
  it('validates bulkUploadSchema', () => {
    const valid = bulkUploadSchema.parse({
      source: 'MSME Department MP',
      entityType: 'employer',
    });
    expect(valid.source).toBe('MSME Department MP');
    expect(valid.entityType).toBe('employer');
  });

  it('validates inviteWaveSchema', () => {
    const valid = inviteWaveSchema.parse({
      batchId: 'batch_100',
      waveSize: 5000,
      costPerSmsInr: 0.25,
    });
    expect(valid.waveSize).toBe(5000);
    expect(valid.costPerSmsInr).toBe(0.25);
  });
});
