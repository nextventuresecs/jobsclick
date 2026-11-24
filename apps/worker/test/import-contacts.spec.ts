import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import { ImportProcessor, type BulkImportJobData } from '../src/processors/import.processor.js';
import { WorkerEmailService } from '../src/email/email.service.js';
import { createMockSupabase } from './fixtures/import-supabase.js';

describe('BULK-02 contact-only CSV ingestion (email or mobile)', () => {
  it('imports student with email only and sends welcome email with login steps', async () => {
    const database = createMockSupabase();
    const mockEmailService = {
      sendBulkOnboardingWelcomeEmail: vi.fn().mockResolvedValue({ success: true }),
    };
    const processor = new ImportProcessor(database, mockEmailService as unknown as WorkerEmailService);

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
      source: 'Indore Engineering College',
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

  it('keeps rejected contacts in the private report and out of results and logs', async () => {
    const database = createMockSupabase();
    const email = 'candidate@example.test';
    const phone = '9876543210';
    const batchId = '00000000-0000-0000-0000-000000000003';
    const emailService = new WorkerEmailService();
    vi.spyOn(emailService, 'sendBulkOnboardingWelcomeEmail')
      .mockRejectedValue(new Error(`Provider rejected ${email} (${phone})`));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const processor = new ImportProcessor(database, emailService);

    try {
      const result = await processor.process({
        data: {
          batchId,
          source: 'Fixture College',
          csvContent: `email,phone\n${email},${phone}\n${email},${phone}\n${email},12345`,
        },
        attemptsMade: 0,
      } as Job<BulkImportJobData>);

      expect(result).toEqual({
        batchId,
        entityType: 'student',
        totalRows: 3,
        processedRows: 3,
        validRows: 1,
        errorRows: 2,
        status: 'completed',
        createdUserCount: 1,
      });
      expect(database._storageFiles.get(`bulk-imports/${batchId}-errors.csv`)).toContain(phone);
      expect(log).toHaveBeenCalled();
      const output = JSON.stringify(log.mock.calls.map((call) => call.map(String)));
      expect(output).not.toContain(email);
      expect(output).not.toContain(phone);
    } finally {
      log.mockRestore();
    }
  });

  it('does not expose raw CSV parser errors to BullMQ', async () => {
    const processor = new ImportProcessor(null);
    const job = {
      data: { batchId: 'fixture-batch', source: 'Fixture College', csvContent: 'email\n"candidate@example.test"x' },
      attemptsMade: 0,
    } as Job<BulkImportJobData>;

    await expect(processor.process(job)).rejects.toThrow(/^BULK_IMPORT_PROCESSING_FAILED$/);
  });
});
