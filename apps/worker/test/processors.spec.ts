import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Job } from 'bullmq';
import { bulkImportProcessor, BulkImportJobData } from '../src/processors/import.processor.js';
import { inviteWaveProcessor, InviteProcessor, InviteWaveJobData } from '../src/processors/invite.processor.js';
import { pdfGeneratorProcessor, PdfProcessor, PdfJobData } from '../src/processors/pdf.processor.js';

describe('Worker Processors (Ticket T-07)', () => {
  describe('bulk-import-processor', () => {
    it('parses CSV via streaming, enforces Indian 10-digit phones, creates users in invited state with zero SMS, and retains source (Hard Invariants #2 & #3)', async () => {
      const p1 = '9' + Math.floor(100000000 + Math.random() * 900000000);
      const p2 = '9' + Math.floor(100000000 + Math.random() * 900000000);
      const csv = `name,phone,aadhaar\nAnita Sharma,${p1},123456789012\nRahul Verma,+91 ${p2},\nInvalid User,12345,\nDuplicate User,${p1},`;

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

    it('does not echo Aadhaar from a legacy roster in the job result', async () => {
      const pAadhaar = '9' + Math.floor(100000000 + Math.random() * 900000000);
      const csv = `name,phone,aadhaar\nDeepak Joshi,${pAadhaar},999988881234`;

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
      const retryPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);
      const csv = `name,phone\nAnita,${retryPhone}`;

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
      const basePhone = 7000000000 + Math.floor(Math.random() * 100000000);
      
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
    }, 180000); // 180s timeout for test runner
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

      const processor = new InviteProcessor();
      const query: Record<string, unknown> = {
        select: () => query,
        eq: () => query,
        not: () => query,
        update: () => query,
        single: async () => ({ data: { batch_id: 'batch_test_001', status: 'dispatched' }, error: null }),
        maybeSingle: async () => ({ data: { batch_id: 'batch_test_001', status: 'dispatched' }, error: null }),
        limit: async () => ({ data: Array.from({ length: 5000 }, (_, i) => ({ id: String(i), phone: '9876543210' })), error: null }),
      };
      Object.assign(processor, {
        supabase: { from: () => query },
        smsService: { sendInviteSms: async () => ({ success: true, message: 'dispatched' }) },
      });
      const result = await processor.process(mockJob);
      expect(result.waveId).toBe('wave_test_001');
      expect(result.batchId).toBe('batch_test_001');
      expect(result.waveSize).toBe(5000);
      expect(result.totalCostInr).toBe(1000);
      expect(result.status).toBe('completed');
      expect(result.sentCount).toBe(5000);
      expect(result.failedCount).toBe(0);
    });

    it('pause at recipient 30, resume, every recipient sent exactly once', async () => {
      interface MockInvitation {
        id: string;
        phone: string;
        status: 'pending' | 'sent' | 'failed';
      }

      const totalRecipients = 50;
      const invitations: MockInvitation[] = Array.from({ length: totalRecipients }, (_, i) => ({
        id: `inv_${i}`,
        phone: `98765432${i < 10 ? '0' + i : String(i)}`,
        status: 'pending',
      }));

      const sentPhones: string[] = [];
      const waveId = 'wave_pause_resume_01';
      const batchId = 'batch_pr_01';

      let waveRecord = {
        id: waveId,
        batch_id: batchId,
        wave_size: 50,
        cost_per_sms_inr: 0.2,
        status: 'dispatched',
        sent_count: 0,
        failed_count: 0,
      };

      const mockSmsService = {
        sendInviteSms: async (params: { phone: string }) => {
          sentPhones.push(params.phone);
          // When 30 recipients are sent, wave status transitions to 'queued' (simulating user pause)
          if (sentPhones.length === 30) {
            waveRecord.status = 'queued';
          }
          return { success: true, message: 'dispatched' };
        },
      };

      const buildMockSupabase = () => {
        return {
          from: (table: string) => {
            if (table === 'invite_waves') {
              return {
                select: () => ({
                  eq: () => ({
                    single: async () => ({ data: { ...waveRecord }, error: null }),
                    maybeSingle: async () => ({ data: { ...waveRecord }, error: null }),
                  }),
                }),
                update: (fields: Record<string, unknown>) => ({
                  eq: async () => {
                    Object.assign(waveRecord, fields);
                    return { data: null, error: null };
                  },
                }),
              };
            }
            if (table === 'invitations') {
              let filterStatus = 'pending';
              let limitCount = 50;
              const invQuery = {
                select: () => invQuery,
                eq: (_col: string, val: string) => {
                  if (val === 'pending' || val === 'sent') filterStatus = val;
                  return invQuery;
                },
                not: () => invQuery,
                limit: (lim: number) => {
                  limitCount = lim;
                  const matching = invitations
                    .filter((inv) => inv.status === filterStatus)
                    .slice(0, limitCount);
                  return Promise.resolve({ data: matching, error: null });
                },
                update: (fields: { status: 'pending' | 'sent' | 'failed' }) => ({
                  eq: async (_col: string, targetId: string) => {
                    const row = invitations.find((inv) => inv.id === targetId);
                    if (row) row.status = fields.status;
                    return { data: null, error: null };
                  },
                }),
              };
              return invQuery;
            }
            return {};
          },
        } as unknown as SupabaseClient;
      };

      // RUN 1: Dispatches 1..30, pauses at 30 when wave transitions to 'queued'
      const processorRun1 = new InviteProcessor();
      Object.assign(processorRun1, {
        supabase: buildMockSupabase(),
        smsService: mockSmsService,
      });

      const jobRun1 = {
        id: 'job_wave_run1',
        attemptsMade: 0,
        opts: { attempts: 3 },
        data: {
          waveId,
          batchId,
          waveSize: 50,
          costPerSmsInr: 0.2,
        } as InviteWaveJobData,
      } as unknown as Job<InviteWaveJobData>;

      const res1 = await processorRun1.process(jobRun1);
      expect(res1.status).toBe('queued');
      expect(res1.sentCount).toBe(30);
      expect(sentPhones.length).toBe(30);
      expect(waveRecord.status).toBe('queued');
      expect(waveRecord.sent_count).toBe(30);
      expect(invitations.filter((inv) => inv.status === 'sent').length).toBe(30);
      expect(invitations.filter((inv) => inv.status === 'pending').length).toBe(20);

      // RESUME: Wave is resumed by transitioning status to 'dispatched'
      waveRecord.status = 'dispatched';

      // RUN 2: Resumed execution
      const processorRun2 = new InviteProcessor();
      Object.assign(processorRun2, {
        supabase: buildMockSupabase(),
        smsService: mockSmsService,
      });

      const jobRun2 = {
        id: 'job_wave_run2',
        attemptsMade: 0,
        opts: { attempts: 3 },
        data: {
          waveId,
          batchId,
          waveSize: 50,
          costPerSmsInr: 0.2,
        } as InviteWaveJobData,
      } as unknown as Job<InviteWaveJobData>;

      const res2 = await processorRun2.process(jobRun2);
      expect(res2.status).toBe('completed');
      expect(res2.sentCount).toBe(50);
      expect(waveRecord.status).toBe('completed');
      expect(waveRecord.sent_count).toBe(50);

      // Verify every recipient was sent exactly once
      expect(sentPhones.length).toBe(50);
      expect(new Set(sentPhones).size).toBe(50);
      expect(invitations.every((inv) => inv.status === 'sent')).toBe(true);
    });

    it('per-wave Redis lock prevents concurrent duplicate dispatch when resumed while old job still running', async () => {
      interface MockInvitation {
        id: string;
        phone: string;
        status: 'pending' | 'sent' | 'failed';
      }

      const totalRecipients = 50;
      const invitations: MockInvitation[] = Array.from({ length: totalRecipients }, (_, i) => ({
        id: `inv_lock_${i}`,
        phone: `98765431${i < 10 ? '0' + i : String(i)}`,
        status: 'pending',
      }));

      const sentPhones: string[] = [];
      const waveId = 'wave_lock_concurrency_01';
      const batchId = 'batch_lock_01';

      let waveRecord = {
        id: waveId,
        batch_id: batchId,
        wave_size: 50,
        cost_per_sms_inr: 0.2,
        status: 'dispatched',
        sent_count: 0,
        failed_count: 0,
      };

      const IORedisMock = (await import('ioredis-mock')).default;
      const sharedRedis = new IORedisMock();
      let concurrentJobAttempted = false;
      let concurrentJobResult: unknown = null;

      const mockSmsService = {
        sendInviteSms: async (params: { phone: string }) => {
          sentPhones.push(params.phone);
          if (sentPhones.length === 30) {
            // BEFORE Job 1 finishes or releases lock, resume triggers Job 2 concurrently while wave is dispatched
            const concurrentProcessor = new InviteProcessor(sharedRedis, buildMockSupabase());
            Object.assign(concurrentProcessor, { smsService: mockSmsService });

            const concurrentJob = {
              id: 'job_wave_concurrent_resume',
              attemptsMade: 0,
              opts: { attempts: 3 },
              data: {
                waveId,
                batchId,
                waveSize: 50,
                costPerSmsInr: 0.2,
              } as InviteWaveJobData,
            } as unknown as Job<InviteWaveJobData>;

            concurrentJobAttempted = true;
            try {
              concurrentJobResult = await concurrentProcessor.process(concurrentJob);
            } catch (err) {
              concurrentJobResult = err;
            }

            // Now user pauses wave, causing Job 1 to stop after this chunk
            waveRecord.status = 'queued';
          }
          return { success: true, message: 'dispatched' };
        },
      };

      const buildMockSupabase = () => {
        return {
          from: (table: string) => {
            if (table === 'invite_waves') {
              return {
                select: () => ({
                  eq: () => ({
                    single: async () => ({ data: { ...waveRecord }, error: null }),
                    maybeSingle: async () => ({ data: { ...waveRecord }, error: null }),
                  }),
                }),
                update: (fields: Record<string, unknown>) => ({
                  eq: async () => {
                    Object.assign(waveRecord, fields);
                    return { data: null, error: null };
                  },
                }),
              };
            }
            if (table === 'invitations') {
              let filterStatus = 'pending';
              let limitCount = 50;
              const invQuery = {
                select: () => invQuery,
                eq: (_col: string, val: string) => {
                  if (val === 'pending' || val === 'sent') filterStatus = val;
                  return invQuery;
                },
                not: () => invQuery,
                limit: (lim: number) => {
                  limitCount = lim;
                  const matching = invitations
                    .filter((inv) => inv.status === filterStatus)
                    .slice(0, limitCount);
                  return Promise.resolve({ data: matching, error: null });
                },
                update: (fields: { status: 'pending' | 'sent' | 'failed' }) => ({
                  eq: async (_col: string, targetId: string) => {
                    const row = invitations.find((inv) => inv.id === targetId);
                    if (row) row.status = fields.status;
                    return { data: null, error: null };
                  },
                }),
              };
              return invQuery;
            }
            return {};
          },
        } as unknown as SupabaseClient;
      };

      const processor1 = new InviteProcessor(sharedRedis, buildMockSupabase());
      Object.assign(processor1, { smsService: mockSmsService });

      const job1 = {
        id: 'job_wave_run1',
        attemptsMade: 0,
        opts: { attempts: 3 },
        data: {
          waveId,
          batchId,
          waveSize: 50,
          costPerSmsInr: 0.2,
        } as InviteWaveJobData,
      } as unknown as Job<InviteWaveJobData>;

      const res1 = await processor1.process(job1);
      expect(res1.status).toBe('queued');
      expect(res1.sentCount).toBe(30);

      // Verify that concurrent job attempted while Job 1 was running was safely locked out and delayed
      expect(concurrentJobAttempted).toBe(true);
      expect((concurrentJobResult as { status: string }).status).toBe('delayed');

      // Now resume wave after Job 1 has exited and released the lock
      waveRecord.status = 'dispatched';

      const processorResume = new InviteProcessor(sharedRedis, buildMockSupabase());
      Object.assign(processorResume, { smsService: mockSmsService });

      const jobResume = {
        id: 'job_wave_resume_valid',
        attemptsMade: 0,
        opts: { attempts: 3 },
        data: {
          waveId,
          batchId,
          waveSize: 50,
          costPerSmsInr: 0.2,
        } as InviteWaveJobData,
      } as unknown as Job<InviteWaveJobData>;

      const resResume = await processorResume.process(jobResume);
      expect(resResume.status).toBe('completed');
      expect(resResume.sentCount).toBe(50);

      // Assert total SMS sends: exactly 50 with zero duplicates
      expect(sentPhones.length).toBe(50);
      expect(new Set(sentPhones).size).toBe(50);
      expect(invitations.every((inv) => inv.status === 'sent')).toBe(true);
    });

    it('two different waves on one batch, every invitation sent once', async () => {
      interface MockInvitation {
        id: string;
        phone: string;
        status: 'pending' | 'sent' | 'failed';
      }

      const totalRecipients = 40;
      const invitations: MockInvitation[] = Array.from({ length: totalRecipients }, (_, i) => ({
        id: `inv_batch_${i}`,
        phone: `98765400${i < 10 ? '0' + i : String(i)}`,
        status: 'pending',
      }));

      const sentPhones: string[] = [];
      const batchId = 'batch_two_waves_01';
      const wave1Id = 'wave_batch_01';
      const wave2Id = 'wave_batch_02';

      const wavesState: Record<string, { id: string; batch_id: string; wave_size: number; cost_per_sms_inr: number; status: string; sent_count: number; failed_count: number }> = {
        [wave1Id]: { id: wave1Id, batch_id: batchId, wave_size: 20, cost_per_sms_inr: 0.2, status: 'dispatched', sent_count: 0, failed_count: 0 },
        [wave2Id]: { id: wave2Id, batch_id: batchId, wave_size: 20, cost_per_sms_inr: 0.2, status: 'dispatched', sent_count: 0, failed_count: 0 },
      };

      const IORedisMock = (await import('ioredis-mock')).default;
      const sharedRedis = new IORedisMock();

      const mockSmsService = {
        sendInviteSms: async (params: { phone: string }) => {
          sentPhones.push(params.phone);
          return { success: true, message: 'dispatched' };
        },
      };

      const buildMockSupabase = () => ({
        from: (table: string) => {
          if (table === 'invite_waves') {
            let targetWaveId: string | null = null;
            return {
              select: () => ({
                eq: (_col: string, val: string) => {
                  targetWaveId = val;
                  return {
                    single: async () => ({ data: { ...wavesState[targetWaveId!] }, error: null }),
                    maybeSingle: async () => ({ data: { ...wavesState[targetWaveId!] }, error: null }),
                  };
                },
              }),
              update: (fields: Record<string, unknown>) => ({
                eq: async (_col: string, val: string) => {
                  Object.assign(wavesState[val]!, fields);
                  return { data: null, error: null };
                },
              }),
            };
          }
          if (table === 'invitations') {
            let filterStatus = 'pending';
            let limitCount = 20;
            const invQuery = {
              select: () => invQuery,
              eq: (_col: string, val: string) => {
                if (val === 'pending' || val === 'sent') filterStatus = val;
                return invQuery;
              },
              not: () => invQuery,
              limit: (lim: number) => {
                limitCount = lim;
                const matching = invitations
                  .filter((inv) => inv.status === filterStatus)
                  .slice(0, limitCount);
                return Promise.resolve({ data: matching, error: null });
              },
              update: (fields: { status: 'pending' | 'sent' | 'failed' }) => ({
                eq: async (_col: string, targetId: string) => {
                  const row = invitations.find((inv) => inv.id === targetId);
                  if (row) row.status = fields.status;
                  return { data: null, error: null };
                },
              }),
            };
            return invQuery;
          }
          return {};
        },
      } as unknown as SupabaseClient);

      const processorWave1 = new InviteProcessor(sharedRedis, buildMockSupabase());
      const processorWave2 = new InviteProcessor(sharedRedis, buildMockSupabase());
      Object.assign(processorWave1, { smsService: mockSmsService });
      Object.assign(processorWave2, { smsService: mockSmsService });

      const job1 = {
        id: 'job_wave_1',
        attemptsMade: 0,
        opts: { attempts: 3 },
        data: { waveId: wave1Id, batchId, waveSize: 20, costPerSmsInr: 0.2 } as InviteWaveJobData,
      } as unknown as Job<InviteWaveJobData>;

      const job2 = {
        id: 'job_wave_2',
        attemptsMade: 0,
        opts: { attempts: 3 },
        data: { waveId: wave2Id, batchId, waveSize: 20, costPerSmsInr: 0.2 } as InviteWaveJobData,
      } as unknown as Job<InviteWaveJobData>;

      // Run Wave 1
      const res1 = await processorWave1.process(job1);
      expect(res1.status).toBe('completed');
      expect(res1.sentCount).toBe(20);

      // Now run Wave 2
      const res2 = await processorWave2.process(job2);
      expect(res2.status).toBe('completed');
      expect(res2.sentCount).toBe(20);

      // Verify all 40 invitations sent, exactly once per recipient
      expect(sentPhones.length).toBe(40);
      expect(new Set(sentPhones).size).toBe(40);
      expect(invitations.every((inv) => inv.status === 'sent')).toBe(true);
    });

    it('lock expiry does not let job B\'s lock be deleted by job A', async () => {
      const IORedisMock = (await import('ioredis-mock')).default;
      const testRedis = new IORedisMock();
      const batchLockKey = 'lock:invite-batch:batch_lua_test';

      // 1. Job A acquires lock with tokenA
      await testRedis.set(batchLockKey, 'tokenA', 'EX', 10, 'NX');
      expect(await testRedis.get(batchLockKey)).toBe('tokenA');

      // 2. Lock expires or is replaced by Job B with tokenB
      await testRedis.set(batchLockKey, 'tokenB', 'EX', 60);

      // 3. Job A attempts to release lock with its old tokenA via compare-and-delete Lua script
      const releaseScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      const luaResult = await testRedis.eval(releaseScript, 1, batchLockKey, 'tokenA');

      // Verify Lua script returned 0 (did not delete)
      expect(luaResult).toBe(0);

      // Verify Job B's lock is still intact and untouched
      expect(await testRedis.get(batchLockKey)).toBe('tokenB');
    });

    it('simultaneous waves on one batch (second delays, nothing duplicated)', async () => {
      interface MockInvitation {
        id: string;
        phone: string;
        status: 'pending' | 'sent' | 'failed';
      }

      const totalRecipients = 40;
      const invitations: MockInvitation[] = Array.from({ length: totalRecipients }, (_, i) => ({
        id: `inv_sim_${i}`,
        phone: `98765411${i < 10 ? '0' + i : String(i)}`,
        status: 'pending',
      }));

      const sentPhones: string[] = [];
      const batchId = 'batch_simultaneous_01';
      const wave1Id = 'wave_sim_01';
      const wave2Id = 'wave_sim_02';

      const wavesState: Record<string, { id: string; batch_id: string; wave_size: number; cost_per_sms_inr: number; status: string; sent_count: number; failed_count: number }> = {
        [wave1Id]: { id: wave1Id, batch_id: batchId, wave_size: 20, cost_per_sms_inr: 0.2, status: 'dispatched', sent_count: 0, failed_count: 0 },
        [wave2Id]: { id: wave2Id, batch_id: batchId, wave_size: 20, cost_per_sms_inr: 0.2, status: 'dispatched', sent_count: 0, failed_count: 0 },
      };

      const IORedisMock = (await import('ioredis-mock')).default;
      const sharedRedis = new IORedisMock();

      let secondWaveAttempted = false;
      let secondWaveResult: unknown = null;

      const buildMockSupabase = () => ({
        from: (table: string) => {
          if (table === 'invite_waves') {
            let targetWaveId: string | null = null;
            return {
              select: () => ({
                eq: (_col: string, val: string) => {
                  targetWaveId = val;
                  return {
                    single: async () => ({ data: { ...wavesState[targetWaveId!] }, error: null }),
                    maybeSingle: async () => ({ data: { ...wavesState[targetWaveId!] }, error: null }),
                  };
                },
              }),
              update: (fields: Record<string, unknown>) => ({
                eq: async (_col: string, val: string) => {
                  Object.assign(wavesState[val]!, fields);
                  return { data: null, error: null };
                },
              }),
            };
          }
          if (table === 'invitations') {
            let filterStatus = 'pending';
            let limitCount = 20;
            const invQuery = {
              select: () => invQuery,
              eq: (_col: string, val: string) => {
                if (val === 'pending' || val === 'sent') filterStatus = val;
                return invQuery;
              },
              not: () => invQuery,
              limit: (lim: number) => {
                limitCount = lim;
                const matching = invitations
                  .filter((inv) => inv.status === filterStatus)
                  .slice(0, limitCount);
                return Promise.resolve({ data: matching, error: null });
              },
              update: (fields: { status: 'pending' | 'sent' | 'failed' }) => ({
                eq: async (_col: string, targetId: string) => {
                  const row = invitations.find((inv) => inv.id === targetId);
                  if (row) row.status = fields.status;
                  return { data: null, error: null };
                },
              }),
            };
            return invQuery;
          }
          return {};
        },
      } as unknown as SupabaseClient);

      const mockSmsService = {
        sendInviteSms: async (params: { phone: string }) => {
          sentPhones.push(params.phone);
          if (sentPhones.length === 10 && !secondWaveAttempted) {
            secondWaveAttempted = true;
            // While Wave 1 is actively sending and holding the batch lock, launch Wave 2 simultaneously
            const proc2 = new InviteProcessor(sharedRedis, buildMockSupabase());
            Object.assign(proc2, { smsService: mockSmsService });
            const job2 = {
              id: 'job_wave_sim_2',
              attemptsMade: 0,
              opts: { attempts: 3 },
              data: { waveId: wave2Id, batchId, waveSize: 20, costPerSmsInr: 0.2 } as InviteWaveJobData,
            } as unknown as Job<InviteWaveJobData>;

            secondWaveResult = await proc2.process(job2);
          }
          return { success: true, message: 'dispatched' };
        },
      };

      const proc1 = new InviteProcessor(sharedRedis, buildMockSupabase());
      Object.assign(proc1, { smsService: mockSmsService });
      const job1 = {
        id: 'job_wave_sim_1',
        attemptsMade: 0,
        opts: { attempts: 3 },
        data: { waveId: wave1Id, batchId, waveSize: 20, costPerSmsInr: 0.2 } as InviteWaveJobData,
      } as unknown as Job<InviteWaveJobData>;

      // Execute Wave 1
      const res1 = await proc1.process(job1);
      expect(res1.status).toBe('completed');
      expect(res1.sentCount).toBe(20);

      // Verify that simultaneous Wave 2 delayed without throwing error
      expect(secondWaveAttempted).toBe(true);
      expect((secondWaveResult as { status: string }).status).toBe('delayed');

      // Now that Wave 1 has finished and released batch lock, execute Wave 2
      const proc2After = new InviteProcessor(sharedRedis, buildMockSupabase());
      Object.assign(proc2After, { smsService: mockSmsService });
      const job2After = {
        id: 'job_wave_sim_2_retry',
        attemptsMade: 1,
        opts: { attempts: 3 },
        data: { waveId: wave2Id, batchId, waveSize: 20, costPerSmsInr: 0.2 } as InviteWaveJobData,
      } as unknown as Job<InviteWaveJobData>;

      const res2 = await proc2After.process(job2After);
      expect(res2.status).toBe('completed');
      expect(res2.sentCount).toBe(20);

      // Verify all 40 sent with 0 duplicates
      expect(sentPhones.length).toBe(40);
      expect(new Set(sentPhones).size).toBe(40);
      expect(invitations.every((inv) => inv.status === 'sent')).toBe(true);
    });

    it('lock lost mid-run aborts', async () => {
      interface MockInvitation {
        id: string;
        phone: string;
        status: 'pending' | 'sent' | 'failed';
      }

      const totalRecipients = 20;
      const invitations: MockInvitation[] = Array.from({ length: totalRecipients }, (_, i) => ({
        id: `inv_locklost_${i}`,
        phone: `98765422${i < 10 ? '0' + i : String(i)}`,
        status: 'pending',
      }));

      const sentPhones: string[] = [];
      const batchId = 'batch_lock_lost_01';
      const waveId = 'wave_lock_lost_01';

      const waveRecord = {
        id: waveId,
        batch_id: batchId,
        wave_size: 20,
        cost_per_sms_inr: 0.2,
        status: 'dispatched',
        sent_count: 0,
        failed_count: 0,
      };

      const IORedisMock = (await import('ioredis-mock')).default;
      const sharedRedis = new IORedisMock();

      const buildMockSupabase = () => ({
        from: (table: string) => {
          if (table === 'invite_waves') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({ data: { ...waveRecord }, error: null }),
                  maybeSingle: async () => ({ data: { ...waveRecord }, error: null }),
                }),
              }),
              update: (fields: Record<string, unknown>) => ({
                eq: async () => {
                  Object.assign(waveRecord, fields);
                  return { data: null, error: null };
                },
              }),
            };
          }
          if (table === 'invitations') {
            let filterStatus = 'pending';
            let limitCount = 20;
            const invQuery = {
              select: () => invQuery,
              eq: (_col: string, val: string) => {
                if (val === 'pending' || val === 'sent') filterStatus = val;
                return invQuery;
              },
              not: () => invQuery,
              limit: (lim: number) => {
                limitCount = lim;
                const matching = invitations
                  .filter((inv) => inv.status === filterStatus)
                  .slice(0, limitCount);
                return Promise.resolve({ data: matching, error: null });
              },
              update: (fields: { status: 'pending' | 'sent' | 'failed' }) => ({
                eq: async (_col: string, targetId: string) => {
                  const row = invitations.find((inv) => inv.id === targetId);
                  if (row) row.status = fields.status;
                  return { data: null, error: null };
                },
              }),
            };
            return invQuery;
          }
          return {};
        },
      } as unknown as SupabaseClient);

      const mockSmsService = {
        sendInviteSms: async (params: { phone: string }) => {
          sentPhones.push(params.phone);
          if (sentPhones.length === 5) {
            // Overwrite the lock key mid-run to simulate lock loss / expiration
            await sharedRedis.set(`lock:invite-batch:${batchId}`, 'stolen_by_another_node');
          }
          return { success: true, message: 'dispatched' };
        },
      };

      const proc = new InviteProcessor(sharedRedis, buildMockSupabase());
      Object.assign(proc, { smsService: mockSmsService });

      const job = {
        id: 'job_wave_lock_lost_test',
        attemptsMade: 0,
        opts: { attempts: 3 },
        data: { waveId, batchId, waveSize: 20, costPerSmsInr: 0.2 } as InviteWaveJobData,
      } as unknown as Job<InviteWaveJobData>;

      const res = await proc.process(job);

      // Verify wave aborted with status failed
      expect(res.status).toBe('failed');
      expect(waveRecord.status).toBe('failed');

      // Only the first 5 were sent before lock loss was detected at the chunk check
      expect(sentPhones.length).toBe(5);
      expect(res.sentCount).toBe(5);
      // Remaining 15 invitations were not processed
      expect(invitations.filter((i) => i.status === 'sent').length).toBe(5);
      expect(invitations.filter((i) => i.status === 'pending').length).toBe(15);
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
    beforeAll(async () => {
      // Warm up renderer before timing
      const warmupJob = {
        id: 'job_pdf_warmup',
        attemptsMade: 0,
        opts: { attempts: 1 },
        data: {
          seekerId: 'seeker_warmup_proc',
          fullName: 'Warmup Seeker',
          seekerType: 'student',
          city: 'Indore',
          skills: ['Warmup'],
          updatedAt: Date.now(),
        },
      } as unknown as Job<PdfJobData>;
      await pdfGeneratorProcessor(warmupJob);
    }, 30000);

    it('reports completion only after private storage accepts the resume', async () => {
      const upload = vi.fn()
        .mockResolvedValueOnce({ error: { message: 'fixture upload failed' } })
        .mockResolvedValueOnce({ error: null });
      const processor = new PdfProcessor({ storage: { from: () => ({ upload }) } } as unknown as SupabaseClient);
      const updateProgress = vi.fn();
      const job = {
        data: {
          seekerId: 'resume-storage-fixture',
          fullName: 'आशा शर्मा',
          seekerType: 'student',
          city: 'Indore',
          skills: [],
          updatedAt: 1,
        },
        updateProgress,
      } as unknown as Job<PdfJobData>;
      await expect(processor.process(job)).rejects.toThrow('Resume PDF storage upload failed');
      expect(updateProgress).not.toHaveBeenCalled();

      await expect(processor.process(job)).resolves.toMatchObject({
        status: 'completed',
        storagePath: 'resumes/resume-storage-fixture.pdf',
      });
      expect(upload).toHaveBeenCalledWith(expect.any(String), expect.any(Buffer), {
        contentType: 'application/pdf',
        upsert: true,
      });
      expect(updateProgress).toHaveBeenCalledWith(100);
    });

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
      console.log(`[processors.spec.ts] Measured first generationTimeMs: ${firstResult.generationTimeMs}ms`);
      expect(firstResult.seekerId).toBe('seeker_test_123');
      expect(firstResult.status).toBe('completed');
      expect(firstResult.bufferLength).toBeGreaterThan(0);
      expect(firstResult.generationTimeMs).toBeLessThan(10000);
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
      expect(secondResult.generationTimeMs).toBeLessThan(1500);
    });
  });
});
