import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import { ImportProcessor, type BulkImportJobData } from '../src/processors/import.processor.js';
import { createMockSupabase } from './fixtures/import-supabase.js';

describe('BULK-02 contact-only CSV ingestion (email or mobile)', () => {
  it('imports student with email only and sends welcome email with login steps', async () => {
    const database = createMockSupabase();
    const mockEmailService = {
      sendBulkOnboardingWelcomeEmail: vi.fn().mockResolvedValue({ success: true }),
    };
    const processor = new ImportProcessor(database, mockEmailService as any);

    const result = await processor.process({
      data: {
        batchId: '00000000-0000-0000-0000-000000000001',
        source: 'Indore Engineering College',
        entityType: 'student',
        csvContent: 'email,phone\nstudent1@test.in,\nstudent2@test.in,9876543210\n,9876543211',
      },
      attemptsMade: 0,
      updateProgress: vi.fn(),
    } as unknown as Job<BulkImportJobData>);

    expect(result.validRows).toBe(3);
    expect(result.errorRows).toBe(0);
    expect(database._users).toHaveLength(3);
    expect(database._users[0]).toMatchObject({
      email: 'student1@test.in',
      phone: null,
      role: 'job_seeker',
      status: 'invited',
    });
    expect(mockEmailService.sendBulkOnboardingWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'student1@test.in',
        role: 'job_seeker',
        source: 'Indore Engineering College',
      }),
    );
  });

  it('rejects rows where both email and mobile are missing or invalid', async () => {
    const database = createMockSupabase();
    const processor = new ImportProcessor(database);

    const result = await processor.process({
      data: {
        batchId: '00000000-0000-0000-0000-000000000002',
        source: 'DIC Bhopal',
        entityType: 'employer',
        csvContent: 'email,phone\n,\ninvalid-email,12345\nvalid@company.com,9876543212',
      },
      attemptsMade: 0,
      updateProgress: vi.fn(),
    } as unknown as Job<BulkImportJobData>);

    expect(result.validRows).toBe(1);
    expect(result.errorRows).toBe(2);
  });
});
