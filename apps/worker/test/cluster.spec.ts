import { randomInt, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@indian-job-portal/database';
import { QueueEvents, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startWorkerCluster, type WorkerInstanceRegistry } from '../src/main.js';
import { WorkerSmsService } from '../src/sms/sms.service.js';

function loopbackUrl(name: 'REDIS_URL' | 'SUPABASE_URL', protocol: 'redis:' | 'http:') {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} to a disposable local test service`);
  const url = new URL(value);
  if (url.protocol !== protocol || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error(`${name} must point to a disposable loopback test service`);
  }
  return value;
}

async function waitForCompletion<Data, Result>(job: Job<Data, Result>, registry: WorkerInstanceRegistry) {
  const events = new QueueEvents(job.queueName, { connection: registry.connection });
  try {
    return await job.waitUntilFinished(events, 8_000);
  } finally {
    await events.close();
  }
}

function testSupabase() {
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!serviceKey) throw new Error('A disposable Supabase service role is required');
  return createClient<Database>(loopbackUrl('SUPABASE_URL', 'http:'), serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function withImportBatch(names: string[], run: (fixture: {
  batchId: string;
  source: string;
  csvContent: string;
}) => Promise<void>) {
  const supabase = testSupabase();
  const batchId = randomUUID();
  const source = `worker-cluster-${batchId}`;
  const firstSuffix = randomInt(100_000_000, 999_999_998);
  const csvContent = ['name,phone', ...names.map((name, index) => `${name},9${firstSuffix + index}`)].join('\n');

  try {
    await supabase.from('bulk_import_batches').insert({
      id: batchId, source, total_rows: names.length, status: 'dispatched',
    }).throwOnError();
    await run({ batchId, source, csvContent });
  } finally {
    await supabase.from('invitations').delete().eq('batch_id', batchId).throwOnError();
    await supabase.from('users').delete().eq('source', source).throwOnError();
    await supabase.from('bulk_import_batches').delete().eq('id', batchId).throwOnError();
  }
}

describe.skipIf(process.env['RUN_LIVE_REDIS'] !== 'true')('Worker Cluster & BullMQ Queue Integration (Ticket T-07)', () => {
  let registry: WorkerInstanceRegistry | undefined;

  beforeEach(async () => {
    const redisUrl = loopbackUrl('REDIS_URL', 'redis:');
    loopbackUrl('SUPABASE_URL', 'http:');
    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    registry = startWorkerCluster({ NODE_ENV: 'test', REDIS_URL: redisUrl, USE_MOCK_REDIS: 'false' }, connection);
    await registry.waitUntilReady();
  });

  afterEach(async () => {
    await registry?.close();
    registry = undefined;
    vi.restoreAllMocks();
  });

  it('processes a queued bulk import and reports the valid rows', async () => {
    const reg = registry!;
    await withImportBatch(['Anita', 'Rahul'], async (fixture) => {
      const job = await reg.importQueue.add('import-test', fixture);
      await expect(waitForCompletion(job, reg)).resolves.toMatchObject({ validRows: 2 });
    });
  });

  it('records two failed attempts before recovering on attempt three', async () => {
    const reg = registry!;
    const jobId = randomUUID();
    const failedAttempts: number[] = [];
    reg.importWorker.on('failed', (job) => {
      if (job?.id === jobId) failedAttempts.push(job.attemptsMade);
    });

    await withImportBatch(['Ravi'], async (fixture) => {
      const job = await reg.importQueue.add('fail-test-recover', {
        ...fixture,
        shouldSimulateFailure: true,
      }, {
        jobId,
        attempts: 3,
        backoff: { type: 'fixed', delay: 100 },
      });

      await expect(waitForCompletion(job, reg)).resolves.toMatchObject({ validRows: 1 });
      const completed = await reg.importQueue.getJob(jobId);
      expect(completed?.attemptsMade).toBe(3);
      expect(failedAttempts).toEqual([1, 2]);
    });
  });

  it('generates a resume PDF from a queued job', async () => {
    const reg = registry!;
    const job = await reg.pdfQueue.add('pdf-cluster-test', {
      seekerId: randomUUID(),
      fullName: 'Amit Kumar',
      seekerType: 'student',
      city: 'Bhopal',
      skills: ['Tally', 'Hindi Typing'],
    });

    const result = await waitForCompletion(job, reg);
    expect(result.status).toBe('completed');
    expect(result.bufferLength).toBeGreaterThan(0);
  });

  it('dispatches only the invitations for the wave’s batch and records their status', async () => {
    const reg = registry!;
    const supabase = testSupabase();
    const batchId = randomUUID();
    const otherBatchId = randomUUID();
    const waveId = randomUUID();
    const phones = ['9876543210', '9876543211'];
    const otherPhone = '9876543212';
    const waveSize = phones.length;
    const costPerSmsInr = 0.2;
    const sendSms = vi.spyOn(WorkerSmsService.prototype, 'sendInviteSms')
      .mockResolvedValue({ success: true, message: 'Fixture accepted' });

    try {
      await supabase.from('bulk_import_batches').insert([
        { id: batchId, source: 'worker-cluster-test', total_rows: waveSize, status: 'completed' },
        { id: otherBatchId, source: 'worker-cluster-test', total_rows: 1, status: 'completed' },
      ]).throwOnError();
      await supabase.from('invitations').insert([
        ...phones.map((phone) => ({ batch_id: batchId, phone, status: 'pending' })),
        { batch_id: otherBatchId, phone: otherPhone, status: 'pending' },
      ]).throwOnError();
      await supabase.from('invite_waves').insert({
        id: waveId,
        batch_id: batchId,
        status: 'dispatched',
        wave_size: waveSize,
        cost_per_sms_inr: costPerSmsInr,
        total_cost_inr: 0.4,
      }).throwOnError();

      const job = await reg.inviteQueue.add('invite-cluster-test', {
        waveId, batchId, waveSize, costPerSmsInr,
      }, { attempts: 1 });

      await expect(waitForCompletion(job, reg)).resolves.toMatchObject({
        waveId, batchId, status: 'completed', sentCount: waveSize, failedCount: 0, totalCostInr: 0.4,
      });
      expect(sendSms.mock.calls.map(([options]) => options.phone).sort()).toEqual(phones);

      const { data: wave } = await supabase.from('invite_waves')
        .select('status, sent_count, failed_count, total_cost_inr')
        .eq('id', waveId).single().throwOnError();
      expect(wave).toEqual({ status: 'completed', sent_count: waveSize, failed_count: 0, total_cost_inr: 0.4 });

      const { data: invitations } = await supabase.from('invitations').select('phone, status')
        .in('batch_id', [batchId, otherBatchId]).order('phone').throwOnError();
      expect(invitations).toEqual([
        ...phones.map((phone) => ({ phone, status: 'sent' })),
        { phone: otherPhone, status: 'pending' },
      ]);
    } finally {
      await supabase.from('invitations').delete().in('batch_id', [batchId, otherBatchId]).throwOnError();
      await supabase.from('bulk_import_batches').delete().in('id', [batchId, otherBatchId]).throwOnError();
    }
  });
});
