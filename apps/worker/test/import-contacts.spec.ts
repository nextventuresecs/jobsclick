import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import { ImportProcessor, type BulkImportJobData } from '../src/processors/import.processor.js';
import { createMockSupabase } from './fixtures/import-supabase.js';

describe('BULK-02 canonical contact ingestion', () => {
  it('canonicalizes an employer email without altering its invited state or source', async () => {
    const database = createMockSupabase();
    const result = await new ImportProcessor(database).process({
      data: { batchId: 'auth-contact-test', source: 'synthetic-contact-test', entityType: 'employer', csvContent: 'company_name,phone,ownership_type,company_size,email\nSynthetic Ltd,9000000090,LLP,Small, Contact@Example.INVALID \n' },
      attemptsMade: 0, updateProgress: vi.fn(),
    } as unknown as Job<BulkImportJobData>);
    expect(result.validRows).toBe(1);
    expect(database._businessProfiles[0]?.['email']).toBe('contact@example.invalid');
    expect(database._users[0]).toMatchObject({ status: 'invited', source: 'synthetic-contact-test' });
  });

  it('reports an invalid provided email instead of silently dropping it', async () => {
    const database = createMockSupabase();
    const result = await new ImportProcessor(database).process({
      data: { batchId: 'auth-invalid-contact-test', source: 'synthetic-contact-test', entityType: 'employer', csvContent: 'company_name,phone,ownership_type,company_size,email\nSynthetic Ltd,9000000091,LLP,Small,invalid-email\n' },
      attemptsMade: 0, updateProgress: vi.fn(),
    } as unknown as Job<BulkImportJobData>);
    expect(result.errorRows).toBe(1);
    expect(database._users).toHaveLength(0);
  });
});
