import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@indian-job-portal/database';
import { AppModule } from '../src/app.module.js';
import { BulkService } from '../src/bulk/bulk.service.js';
import { QueueService } from '../src/queue/queue.service.js';
import { importProcessor } from '../../worker/src/processors/import.processor.js';
import { Job } from 'bullmq';

describe('Bulk Batch: DB UUID Generation First & Queue Alignment (Task 2)', () => {
  let app: NestFastifyApplication;
  let bulkService: BulkService;
  let queueService: QueueService;
  let supabase: SupabaseClient<Database>;

  const SUPABASE_LOCAL_URL = 'http://127.0.0.1:54321';
  const SUPABASE_SERVICE_ROLE_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

  beforeAll(async () => {
    supabase = createClient<Database>(SUPABASE_LOCAL_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    bulkService = app.get(BulkService);
    queueService = app.get(QueueService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('fails if the queued batchId differs from the DB-generated row id in bulk_import_batches, and ensures worker updates the exact same row in real local Postgres', async () => {
    let queuedBatchId: string | undefined;

    const publishSpy = vi
      .spyOn(queueService, 'publishBulkImportJob')
      .mockImplementation(async (jobData) => {
        queuedBatchId = jobData.batchId;
        return { id: 'mock_job_1', name: 'bulk-import', data: jobData } as unknown as Job;
      });

    const phone1 = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const phone2 = `98${Math.floor(10000000 + Math.random() * 90000000)}`;

    const sampleCsv = `name,phone
Ramesh Patel,${phone1}
Suresh Kumar,${phone2}`;

    const result = await bulkService.processBulkImport(
      {
        source: 'ITI Bhopal Government',
        entityType: 'student',
      },
      sampleCsv,
    );

    expect(publishSpy).toHaveBeenCalled();
    expect(queuedBatchId).toBeDefined();

    // 1. The ID must be a valid UUID (not composed like batch_1234_567)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(result.id).toMatch(uuidRegex);
    expect(queuedBatchId).toMatch(uuidRegex);

    // 2. The queued batchId MUST match the DB row id exactly
    expect(queuedBatchId).toBe(result.id);

    // 3. Confirm the row exists in real local Postgres
    const { data: rowInDb, error } = await supabase
      .from('bulk_import_batches')
      .select('*')
      .eq('id', result.id)
      .single();

    expect(error).toBeNull();
    expect(rowInDb).toBeDefined();
    expect(rowInDb?.id).toBe(result.id);
    expect(rowInDb?.id).toBe(queuedBatchId);

    // 4. Run the worker on this job data against real local Postgres
    importProcessor.setSupabaseClient(supabase);
    const mockJob = {
      id: 'job-1',
      data: {
        batchId: queuedBatchId!,
        source: 'ITI Bhopal Government',
        entityType: 'student' as const,
        csvContent: sampleCsv,
      },
      attemptsMade: 0,
      updateProgress: vi.fn(),
    } as unknown as Job;

    const workerResult = await importProcessor.process(mockJob);
    expect(workerResult.status).toBe('completed');
    expect(workerResult.batchId).toBe(result.id);

    // 5. Verify the worker updated the EXACT SAME ROW created by the API
    const { data: updatedRow } = await supabase
      .from('bulk_import_batches')
      .select('*')
      .eq('id', result.id)
      .single();

    expect(updatedRow?.status).toBe('completed');
    expect(updatedRow?.valid_rows).toBe(2);
    expect(updatedRow?.processed_rows).toBe(2);

    publishSpy.mockRestore();

    // Clean up created records from test
    await supabase.from('users').delete().in('phone', [phone1, phone2]);
    await supabase.from('bulk_import_batches').delete().eq('id', result.id);
  });
});
