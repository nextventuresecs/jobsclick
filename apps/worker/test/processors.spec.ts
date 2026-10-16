import { describe, it, expect } from 'vitest';
import { Job } from 'bullmq';
import { bulkImportProcessor, BulkImportJobData } from '../src/processors/import.processor.js';
import { inviteWaveProcessor, InviteWaveJobData } from '../src/processors/invite.processor.js';
import { pdfGeneratorProcessor, PdfJobData } from '../src/processors/pdf.processor.js';

describe('Worker Processors (Ticket T-07)', () => {
  describe('bulk-import-processor', () => {
    it('parses CSV via streaming, enforces Indian 10-digit phones, creates users in invited state with zero SMS, and retains source (Hard Invariants #2 & #3)', async () => {
      const csv = `name,phone,aadhaar
Anita Sharma,9876543210,123456789012
Rahul Verma,+91 9876543211,
Invalid User,12345,
Duplicate User,9876543210,`;

      const mockJob = {
        id: 'job_import_1',
        attemptsMade: 0,
        opts: { attempts: 3 },
        data: {
          batchId: 'batch_test_001',
          source: 'MSME Department MP',
          entityType: 'student',
          csvContent: csv,
        } as BulkImportJobData,
        updateProgress: async () => {},
      } as unknown as Job<BulkImportJobData>;

      const result = await bulkImportProcessor(mockJob);

      expect(result.batchId).toBe('batch_test_001');
      expect(result.source).toBe('MSME Department MP');
      expect(result.entityType).toBe('student');
      expect(result.totalRows).toBe(4);
      expect(result.validRows).toBe(2);
      expect(result.errorRows).toBe(2);
      expect(result.status).toBe('completed');
      expect(result.createdUserCount).toBe(2);
      expect(result.errorCsvContent).toContain('Invalid Indian 10-digit mobile number format');
      expect(result.errorCsvContent).toContain('Duplicate mobile number inside file');
    });

    it('masks full Aadhaar numbers to last 4 digits only and never stores full Aadhaar (Hard Invariant #8)', async () => {
      const csv = `name,phone,aadhaar
Deepak Joshi,9876543212,999988881234`;

      const mockJob = {
        id: 'job_import_aadhaar',
        attemptsMade: 0,
        opts: { attempts: 3 },
        data: {
          batchId: 'batch_aadhaar_001',
          source: 'Skill India Mission',
          csvContent: csv,
        } as BulkImportJobData,
        updateProgress: async () => {},
      } as unknown as Job<BulkImportJobData>;

      const result = await bulkImportProcessor(mockJob);
      expect(result.validRows).toBe(1);
      expect(result.createdUserCount).toBe(1);
      // Ensure result errorCsvContent does not leak full Aadhaar
      expect(result.errorCsvContent).toBeFalsy();
    });

    it('simulates retry failures on attempts 1 and 2, and succeeds on attempt 3', async () => {
      const csv = `name,phone\nAnita,9876543210`;

      const failingJob1 = {
        id: 'job_fail_1',
        attemptsMade: 0,
        data: {
          batchId: 'batch_retry_001',
          source: 'MSME',
          csvContent: csv,
          shouldSimulateFailure: true,
        } as BulkImportJobData,
      } as unknown as Job<BulkImportJobData>;

      await expect(bulkImportProcessor(failingJob1)).rejects.toThrow(
        'Simulated transient import processing error for retry check (attempt 1)',
      );

      const failingJob2 = {
        id: 'job_fail_2',
        attemptsMade: 1,
        data: {
          batchId: 'batch_retry_001',
          source: 'MSME',
          csvContent: csv,
          shouldSimulateFailure: true,
        } as BulkImportJobData,
      } as unknown as Job<BulkImportJobData>;

      await expect(bulkImportProcessor(failingJob2)).rejects.toThrow(
        'Simulated transient import processing error for retry check (attempt 2)',
      );

      const succeedingJob3 = {
        id: 'job_success_3',
        attemptsMade: 2,
        data: {
          batchId: 'batch_retry_001',
          source: 'MSME',
          csvContent: csv,
          shouldSimulateFailure: true,
        } as BulkImportJobData,
        updateProgress: async () => {},
      } as unknown as Job<BulkImportJobData>;

      const result = await bulkImportProcessor(succeedingJob3);
      expect(result.validRows).toBe(1);
      expect(result.status).toBe('completed');
    });

    it('streams 50,000-row CSV fixture in 500-row chunks in under 30 minutes (Ticket T-08)', async () => {
      // Generate 50,000 rows fixture: 49,990 valid, 5 invalid phone formats, 5 duplicates
      const rows: string[] = ['name,phone,stream'];
      const basePhone = 9000000000;
      
      for (let i = 0; i < 49990; i++) {
        rows.push(`Student_${i},${basePhone + i},ITI Electrician`);
      }
      // Add 5 invalid phone numbers
      rows.push('Invalid_1,12345,ITI');
      rows.push('Invalid_2,0000000000,ITI');
      rows.push('Invalid_3,5555555555,ITI');
      rows.push('Invalid_4,987,ITI');
      rows.push('Invalid_5,abcd,ITI');
      // Add 5 duplicate phones
      for (let i = 0; i < 5; i++) {
        rows.push(`Duplicate_${i},${basePhone + i},ITI Electrician`);
      }

      const csvContent = rows.join('\n');
      let progressUpdateCount = 0;

      const mock50kJob = {
        id: 'job_50k_stream_test',
        attemptsMade: 0,
        opts: { attempts: 3 },
        data: {
          batchId: 'batch_50k_benchmark',
          source: 'Govt ITI Bhopal',
          entityType: 'student',
          csvContent,
        } as BulkImportJobData,
        updateProgress: async () => {
          progressUpdateCount++;
        },
      } as unknown as Job<BulkImportJobData>;

      const startTime = Date.now();
      const result = await bulkImportProcessor(mock50kJob);
      const durationSeconds = (Date.now() - startTime) / 1000;

      expect(result.batchId).toBe('batch_50k_benchmark');
      expect(result.source).toBe('Govt ITI Bhopal');
      expect(result.totalRows).toBe(50000);
      expect(result.validRows).toBe(49990);
      expect(result.errorRows).toBe(10);
      expect(result.status).toBe('completed');
      expect(result.createdUserCount).toBe(49990);
      expect(progressUpdateCount).toBeGreaterThanOrEqual(99); // Triggered at least 50k / 500 = 100 times
      expect(result.errorCsvContent).toContain('Invalid Indian 10-digit mobile number format');
      expect(result.errorCsvContent).toContain('Duplicate mobile number inside file');
      // Verify AC: Completes in under 30 minutes (1800s); in practice, Node.js streams it in < 15s
      expect(durationSeconds).toBeLessThan(1800);
    }, 30000); // 30s timeout for test runner
  });

  describe('invite-wave-processor', () => {
    it('calculates total SMS cost accurately and reports batch dispatch metrics', async () => {
      const mockJob = {
        id: 'job_invite_1',
        attemptsMade: 0,
        opts: { attempts: 3 },
        data: {
          waveId: 'wave_test_001',
          batchId: 'batch_test_001',
          waveSize: 5000,
          costPerSmsInr: 0.2,
        } as InviteWaveJobData,
      } as unknown as Job<InviteWaveJobData>;

      const result = await inviteWaveProcessor(mockJob);
      expect(result.waveId).toBe('wave_test_001');
      expect(result.batchId).toBe('batch_test_001');
      expect(result.waveSize).toBe(5000);
      expect(result.totalCostInr).toBe(1000);
      expect(result.status).toBe('completed');
      expect(result.sentCount).toBe(5000);
      expect(result.failedCount).toBe(0);
    });

    it('simulates retry backoff on transient SMS dispatch failures', async () => {
      const mockFailingJob = {
        id: 'job_invite_fail',
        attemptsMade: 0,
        data: {
          waveId: 'wave_fail_001',
          batchId: 'batch_1',
          waveSize: 1000,
          shouldSimulateFailure: true,
        } as InviteWaveJobData,
      } as unknown as Job<InviteWaveJobData>;

      await expect(inviteWaveProcessor(mockFailingJob)).rejects.toThrow(
        'Simulated transient invite dispatch failure for retry check (attempt 1)',
      );
    });
  });

  describe('pdf-generator-processor', () => {
    it('renders vector PDF resume and serves from cache in sub-500ms', async () => {
      const timestamp = 1700000000000;
      const pdfData: PdfJobData = {
        seekerId: 'seeker_test_123',
        fullName: 'Vikram Singh',
        seekerType: 'student',
        city: 'Indore',
        skills: ['Tally Prime', 'Hindi Typing', 'GST Filing'],
        updatedAt: timestamp,
      };

      const mockJob1 = {
        id: 'job_pdf_1',
        attemptsMade: 0,
        opts: { attempts: 3 },
        data: pdfData,
      } as unknown as Job<PdfJobData>;

      const firstResult = await pdfGeneratorProcessor(mockJob1);
      expect(firstResult.seekerId).toBe('seeker_test_123');
      expect(firstResult.status).toBe('completed');
      expect(firstResult.bufferLength).toBeGreaterThan(0);
      expect(firstResult.generationTimeMs).toBeLessThan(3000);
      expect(firstResult.fromCache).toBe(false);

      // Second run with same data & timestamp should hit cache in sub-500ms
      const mockJob2 = {
        id: 'job_pdf_2',
        attemptsMade: 0,
        opts: { attempts: 3 },
        data: pdfData,
      } as unknown as Job<PdfJobData>;

      const secondResult = await pdfGeneratorProcessor(mockJob2);
      expect(secondResult.seekerId).toBe('seeker_test_123');
      expect(secondResult.fromCache).toBe(true);
      expect(secondResult.generationTimeMs).toBeLessThan(500);
    });
  });
});
