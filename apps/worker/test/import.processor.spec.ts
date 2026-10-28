import { describe, it, expect, vi } from 'vitest';
import { Job } from 'bullmq';
import { Readable } from 'node:stream';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, UserRow, JobSeekerProfileRow } from '@indian-job-portal/database';
import {
  ImportProcessor,
  normalizeIndianPhone,
  extractAadhaarLast4,
  getField,
  BulkImportJobData,
} from '../src/processors/import.processor.js';

function createMockSupabase() {
  const users: UserRow[] = [];
  const profiles: JobSeekerProfileRow[] = [];
  const batches: Array<Record<string, unknown>> = [];
  const storageFiles = new Map<string, string>();

  let idCounter = 1;

  const client = {
    _users: users,
    _profiles: profiles,
    _batches: batches,
    _storageFiles: storageFiles,

    storage: {
      from: (_bucket: string) => ({
        download: async (path: string) => {
          if (!storageFiles.has(path)) {
            return { data: null, error: new Error(`File not found: ${path}`) };
          }
          const content = storageFiles.get(path)!;
          const blob = new Blob([content], { type: 'text/csv' });
          return { data: blob, error: null };
        },
        upload: async (path: string, content: string) => {
          storageFiles.set(path, content);
          return { data: { path }, error: null };
        },
      }),
    },

    from: (table: string) => {
      if (table === 'users') {
        return {
          select: (_cols?: string) => ({
            in: async (_col: string, values: string[]) => {
              const matched = users.filter((u) => values.includes(u.phone));
              return { data: matched.map((u) => ({ id: u.id, phone: u.phone })), error: null };
            },
          }),
          upsert: (items: Array<Partial<UserRow>>, _opts?: { onConflict?: string }) => ({
            select: async (_cols?: string) => {
              const upserted: UserRow[] = [];
              for (const item of items) {
                const existingIndex = users.findIndex((u) => u.phone === item.phone);
                if (existingIndex >= 0) {
                  users[existingIndex] = {
                    ...users[existingIndex]!,
                    ...item,
                    updated_at: new Date().toISOString(),
                  };
                  upserted.push(users[existingIndex]!);
                } else {
                  const newUser: UserRow = {
                    id: `usr_${idCounter++}`,
                    phone: item.phone!,
                    email: item.email ?? null,
                    role: item.role || 'job_seeker',
                    status: item.status || 'invited',
                    source: item.source || 'bulk_import',
                    created_by: null,
                    updated_by: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  };
                  users.push(newUser);
                  upserted.push(newUser);
                }
              }
              return { data: upserted.map((u) => ({ id: u.id, phone: u.phone })), error: null };
            },
          }),
        };
      }

      if (table === 'job_seeker_profiles') {
        return {
          select: (_cols?: string) => ({
            in: async (_col: string, userIds: string[]) => {
              const matched = profiles.filter((p) => userIds.includes(p.user_id));
              return { data: matched.map((p) => ({ id: p.id, user_id: p.user_id })), error: null };
            },
          }),
          insert: async (items: Array<Partial<JobSeekerProfileRow>>) => {
            for (const item of items) {
              profiles.push({
                id: `prof_${idCounter++}`,
                user_id: item.user_id!,
                full_name: item.full_name || 'Invited Candidate',
                photo_url: null,
                seeker_type: item.seeker_type || 'student',
                apaar_id: null,
                aadhaar_last_four: item.aadhaar_last_four ?? null,
                aadhaar_verified: item.aadhaar_verified ?? false,
                source: item.source || 'bulk_import',
                skills: item.skills || [],
                created_by: null,
                updated_by: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            }
            return { data: items, error: null };
          },
          update: (updates: Partial<JobSeekerProfileRow>) => ({
            eq: async (_col: string, id: string) => {
              const index = profiles.findIndex((p) => p.id === id);
              if (index >= 0) {
                profiles[index] = {
                  ...profiles[index]!,
                  ...updates,
                  updated_at: new Date().toISOString(),
                };
              }
              return { data: profiles[index] || null, error: null };
            },
          }),
        };
      }

      if (table === 'bulk_import_batches') {
        return {
          update: (updates: Record<string, unknown>) => ({
            eq: async (_col: string, id: string) => {
              batches.push({ id, ...updates });
              return { data: { id, ...updates }, error: null };
            },
          }),
        };
      }

      throw new Error(`Unexpected mock table: ${table}`);
    },
  };

  return client as unknown as SupabaseClient<Database> & {
    _users: UserRow[];
    _profiles: JobSeekerProfileRow[];
    _batches: Array<Record<string, unknown>>;
    _storageFiles: Map<string, string>;
  };
}

describe('ImportProcessor - Hardened Bulk Candidate Ingestion', () => {
  describe('Helper Functions: Sanitization & Masking', () => {
    it('normalizes various Indian phone number formats accurately', () => {
      // 10 digits
      expect(normalizeIndianPhone('9876543210')).toBe('9876543210');
      // With +91 and spaces
      expect(normalizeIndianPhone('+91 98765 43210')).toBe('9876543210');
      // With dashes and dots
      expect(normalizeIndianPhone('98765-43210')).toBe('9876543210');
      expect(normalizeIndianPhone('(987) 654-3210')).toBe('9876543210');
      // Leading zero STD/mobile prefix (11 digits starting with 0)
      expect(normalizeIndianPhone('09876543210')).toBe('9876543210');
      // 91 prefix without plus (12 digits starting with 91)
      expect(normalizeIndianPhone('919876543210')).toBe('9876543210');
      // Starting with valid Indian mobile digits 6, 7, 8, 9
      expect(normalizeIndianPhone('6123456789')).toBe('6123456789');
      expect(normalizeIndianPhone('7123456789')).toBe('7123456789');
      expect(normalizeIndianPhone('8123456789')).toBe('8123456789');

      // Invalid cases
      expect(normalizeIndianPhone('12345')).toBeNull();
      expect(normalizeIndianPhone('5876543210')).toBeNull(); // Starts with 5
      expect(normalizeIndianPhone('987654321')).toBeNull(); // 9 digits
      expect(normalizeIndianPhone('987654321000')).toBeNull(); // 12 digits not matching 91 prefix
      expect(normalizeIndianPhone('abcdefghij')).toBeNull();
      expect(normalizeIndianPhone('')).toBeNull();
    });

    it('extracts only the last 4 digits of Aadhaar and never returns full numbers (Hard Invariant #8)', () => {
      expect(extractAadhaarLast4('1234 5678 9012')).toBe('9012');
      expect(extractAadhaarLast4('1234-5678-9012')).toBe('9012');
      expect(extractAadhaarLast4('123456789012')).toBe('9012');
      expect(extractAadhaarLast4('9012')).toBe('9012');
      expect(extractAadhaarLast4('12')).toBeUndefined();
      expect(extractAadhaarLast4('')).toBeUndefined();
      expect(extractAadhaarLast4(undefined)).toBeUndefined();
    });

    it('extracts fields flexibly across case variations and aliases', () => {
      const record1 = { 'Student Name': 'Rohan', mobile: '9876543210', aadhaar_number: '123456789012' };
      expect(getField(record1, 'name', 'full_name', 'Student Name')).toBe('Rohan');
      expect(getField(record1, 'phone', 'mobile')).toBe('9876543210');
      expect(getField(record1, 'aadhaar', 'aadhaar_number')).toBe('123456789012');

      const record2 = { FULL_NAME: 'Pooja', PHONE: '9876543211' };
      expect(getField(record2, 'name', 'full_name')).toBe('Pooja');
      expect(getField(record2, 'phone')).toBe('9876543211');
    });
  });

  describe('Verification Criterion 1: Real-World Dirty CSV Parsing', () => {
    it('handles UTF-8 BOM, spaces, +91, 0-prefix, empty lines, and ragged rows gracefully, enforcing required name', async () => {
      const mockSupabase = createMockSupabase();
      const processor = new ImportProcessor(mockSupabase);

      // CSV with UTF-8 BOM (\uFEFF), ragged rows, empty lines, diverse header formatting
      const dirtyCsv =
        '\uFEFF"Student Name","Mobile","Aadhaar Number"\n' +
        'Anita Sharma, +91 98765 43210 , 1234 5678 9012\n' +
        '\n' + // empty line
        'Rahul Verma,09876543211,999988887777\n' +
        'Ragged Candidate,919876543212,111122223333,Unexpected Extra Column\n' +
        'Invalid Phone Candidate,12345,123456789012\n' +
        ',9876543219,123456789012\n' + // Missing candidate name (PRD BULK-02)
        'Starting 5 Invalid,5876543210,\n' +
        'Karan Johar, 98765-43213 , \n';

      const mockJob = {
        id: 'job_dirty_csv',
        attemptsMade: 0,
        data: {
          batchId: 'batch_dirty_001',
          source: 'Bhopal ITI Drive',
          entityType: 'student',
          csvContent: dirtyCsv,
        } as BulkImportJobData,
        updateProgress: vi.fn(),
      } as unknown as Job<BulkImportJobData>;

      const result = await processor.process(mockJob);

      expect(result.status).toBe('completed');
      expect(result.totalRows).toBe(7); // 7 non-empty data rows
      expect(result.validRows).toBe(4); // Anita, Rahul, Ragged, Karan
      expect(result.errorRows).toBe(3); // Invalid Phone (12345), Missing Name, Starting 5 (5876543210)
      expect(result.createdUserCount).toBe(4);

      // Check users table in mock Supabase
      expect(mockSupabase._users).toHaveLength(4);
      const phones = mockSupabase._users.map((u) => u.phone);
      expect(phones).toEqual(['9876543210', '9876543211', '9876543212', '9876543213']);

      // Ensure error report was generated and uploaded
      expect(mockSupabase._storageFiles.has('bulk-imports/batch_dirty_001-errors.csv')).toBe(true);
      const errorContent = mockSupabase._storageFiles.get('bulk-imports/batch_dirty_001-errors.csv')!;
      expect(errorContent).toContain('12345');
      expect(errorContent).toContain('5876543210');
      expect(errorContent).toContain('Missing candidate full name');
      expect(errorContent).toContain('Invalid Indian 10-digit mobile number format');
    });
  });

  describe('Verification Criterion 2: In-Batch Duplicates and Database Collision Handling', () => {
    it('detects both in-file duplicates and pre-existing DB records without database errors', async () => {
      const mockSupabase = createMockSupabase();
      // Pre-seed database with an existing user
      mockSupabase._users.push({
        id: 'usr_pre_seeded',
        phone: '9876543299',
        email: null,
        role: 'job_seeker',
        status: 'active',
        source: 'direct',
        created_by: null,
        updated_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const processor = new ImportProcessor(mockSupabase);

      const csv =
        'name,phone\n' +
        'Candidate 1,9876543210\n' +
        'Candidate 2 In Batch Duplicate,9876543210\n' + // in-file duplicate
        'Candidate 3 Collides With DB,9876543299\n' + // DB collision
        'Candidate 4 Valid,9876543211\n';

      const mockJob = {
        id: 'job_dup_test',
        attemptsMade: 0,
        data: {
          batchId: 'batch_dup_001',
          source: 'Indore College Drive',
          entityType: 'student',
          csvContent: csv,
        } as BulkImportJobData,
        updateProgress: vi.fn(),
      } as unknown as Job<BulkImportJobData>;

      const result = await processor.process(mockJob);

      expect(result.totalRows).toBe(4);
      expect(result.validRows).toBe(2); // Candidate 1 and Candidate 4
      expect(result.errorRows).toBe(2); // Candidate 2 (in file dup) and Candidate 3 (DB dup)

      // Ensure DB now has pre-seeded + 2 new = 3 users
      expect(mockSupabase._users).toHaveLength(3);

      // Verify error report details
      expect(result.errorCsvContent).toContain('Duplicate mobile number inside file');
      expect(result.errorCsvContent).toContain('Mobile number already exists in database');
    });
  });

  describe('Verification Criterion 3: Relational Creation of Users & Job Seeker Profiles', () => {
    it('atomically creates users with status=invited and links job_seeker_profiles with masked Aadhaar (Hard Invariants #1, #2, #3 & #8)', async () => {
      const mockSupabase = createMockSupabase();
      const processor = new ImportProcessor(mockSupabase);

      const csv =
        'name,phone,aadhaar\n' +
        'Sunita Rao,9876543220,987654321098\n' +
        'Amit Patel,9876543221,\n';

      const mockJob = {
        id: 'job_relational_test',
        attemptsMade: 0,
        data: {
          batchId: 'batch_rel_001',
          source: 'MP Employment Exchange',
          entityType: 'student',
          csvContent: csv,
        } as BulkImportJobData,
        updateProgress: vi.fn(),
      } as unknown as Job<BulkImportJobData>;

      const result = await processor.process(mockJob);

      expect(result.validRows).toBe(2);
      expect(mockSupabase._users).toHaveLength(2);
      expect(mockSupabase._profiles).toHaveLength(2);

      // 1. Verify users table: phone column used, status=invited, role=job_seeker, source retained
      const user1 = mockSupabase._users.find((u) => u.phone === '9876543220')!;
      expect(user1).toBeDefined();
      expect(user1.status).toBe('invited');
      expect(user1.role).toBe('job_seeker');
      expect(user1.source).toBe('MP Employment Exchange');

      // 2. Verify job_seeker_profiles table: linked by user_id
      const profile1 = mockSupabase._profiles.find((p) => p.user_id === user1.id)!;
      expect(profile1).toBeDefined();
      expect(profile1.full_name).toBe('Sunita Rao');
      expect(profile1.seeker_type).toBe('student');
      expect(profile1.aadhaar_last_four).toBe('1098'); // Only last 4 digits!
      expect(profile1.aadhaar_verified).toBe(false);
      expect(profile1.source).toBe('MP Employment Exchange');

      // 3. Verify user without Aadhaar
      const user2 = mockSupabase._users.find((u) => u.phone === '9876543221')!;
      const profile2 = mockSupabase._profiles.find((p) => p.user_id === user2.id)!;
      expect(profile2.full_name).toBe('Amit Patel');
      expect(profile2.aadhaar_last_four).toBeNull();
      expect(profile2.aadhaar_verified).toBe(false);

      // 4. Invariant: Full 12-digit Aadhaar number NEVER exists in either table or error report
      const fullDbDump = JSON.stringify({ users: mockSupabase._users, profiles: mockSupabase._profiles });
      expect(fullDbDump).not.toContain('987654321098');
    });
  });

  describe('Verification Criterion 4: Streaming Architecture & 50k-Row Memory Benchmark', () => {
    it('streams 50,000 rows without heap exhaustion, keeping memory delta strictly bounded', async () => {
      const processor = new ImportProcessor(null); // Pure stream parsing benchmark

      // Generator stream producing 50,000 CSV lines in chunks of 500 lines
      const TOTAL_BENCHMARK_ROWS = 50000;
      let currentRow = 0;
      const basePhone = 9100000000;

      const stream50k = new Readable({
        read() {
          if (currentRow === 0) {
            this.push('name,phone,aadhaar\n');
            currentRow++;
            return;
          }

          let chunk = '';
          for (let i = 0; i < 500 && currentRow <= TOTAL_BENCHMARK_ROWS; i++, currentRow++) {
            // Introduce 5 invalid rows at specific points
            if (currentRow === 1000 || currentRow === 20000 || currentRow === 40000) {
              chunk += `Invalid_${currentRow},12345,123456789012\n`;
            } else if (currentRow === 5000 || currentRow === 30000) {
              // Introduce 2 duplicate rows
              chunk += `Duplicate_${currentRow},${basePhone + 1},123456789012\n`;
            } else {
              chunk += `Candidate_${currentRow},${basePhone + currentRow},123456789012\n`;
            }
          }

          if (chunk.length > 0) {
            this.push(chunk);
          }
          if (currentRow > TOTAL_BENCHMARK_ROWS) {
            this.push(null);
          }
        },
      });

      const initialHeap = process.memoryUsage().heapUsed;

      const mockJob = {
        id: 'job_50k_benchmark',
        attemptsMade: 0,
        data: {
          batchId: 'batch_50k_stream',
          source: 'Statewide ITI Mega Drive',
          entityType: 'student',
        } as BulkImportJobData,
        updateProgress: vi.fn(),
      } as unknown as Job<BulkImportJobData>;

      const startTime = Date.now();
      const result = await processor.process(mockJob, stream50k);
      const durationMs = Date.now() - startTime;

      const finalHeap = process.memoryUsage().heapUsed;
      const heapDeltaMb = (finalHeap - initialHeap) / (1024 * 1024);

      expect(result.status).toBe('completed');
      expect(result.totalRows).toBe(50000);
      expect(result.errorRows).toBe(5); // 3 invalid phones + 2 duplicates
      expect(result.validRows).toBe(49995);

      // Verify that heap growth remains bounded (less than 45 MB delta for 50k rows)
      expect(heapDeltaMb).toBeLessThan(45);
      expect(durationMs).toBeLessThan(10000); // Sub-10 seconds for 50k rows in memory stream
    });

    it('streams directly from Supabase Storage private bucket via Readable.fromWeb without buffering file as text', async () => {
      const mockSupabase = createMockSupabase();
      const sampleCsv = 'name,phone\nStorage User,9876543230\n';
      mockSupabase._storageFiles.set('bulk-imports/storage-file.csv', sampleCsv);

      const processor = new ImportProcessor(mockSupabase);

      const mockJob = {
        id: 'job_storage_stream',
        attemptsMade: 0,
        data: {
          batchId: 'batch_storage_001',
          source: 'Storage Bucket Test',
          entityType: 'student',
          storagePath: 'bulk-imports/storage-file.csv',
        } as BulkImportJobData,
        updateProgress: vi.fn(),
      } as unknown as Job<BulkImportJobData>;

      const result = await processor.process(mockJob);

      expect(result.validRows).toBe(1);
      expect(mockSupabase._users).toHaveLength(1);
      expect(mockSupabase._users[0]!.phone).toBe('9876543230');
    });
  });

  describe('Verification Criterion 5: Idempotent Re-Run Behavior', () => {
    it('executes identical re-runs idempotently without unhandled database constraint exceptions', async () => {
      const mockSupabase = createMockSupabase();
      const processor = new ImportProcessor(mockSupabase);

      const csv =
        'name,phone,aadhaar\n' +
        'Priya Sharma,9876543250,111122223333\n' +
        'Vikas Gupta,9876543251,444455556666\n';

      const makeJob = (batchId: string) =>
        ({
          id: `job_${batchId}`,
          attemptsMade: 0,
          data: {
            batchId,
            source: 'Idempotency Test Source',
            entityType: 'student',
            csvContent: csv,
          } as BulkImportJobData,
          updateProgress: vi.fn(),
        }) as unknown as Job<BulkImportJobData>;

      // Run 1: First Ingestion
      const run1 = await processor.process(makeJob('batch_idemp_run1'));
      expect(run1.status).toBe('completed');
      expect(run1.validRows).toBe(2);
      expect(run1.errorRows).toBe(0);
      expect(mockSupabase._users).toHaveLength(2);
      expect(mockSupabase._profiles).toHaveLength(2);

      // Run 2: Re-ingest the exact same file / batch
      const run2 = await processor.process(makeJob('batch_idemp_run2'));

      // Both users already exist in DB; handled gracefully via duplicate detection
      expect(run2.status).toBe('completed');
      expect(run2.validRows).toBe(0);
      expect(run2.errorRows).toBe(2);
      expect(run2.errorCsvContent).toContain('Mobile number already exists in database');

      // Database user & profile count remains exactly 2 (zero rogue duplicate rows created)
      expect(mockSupabase._users).toHaveLength(2);
      expect(mockSupabase._profiles).toHaveLength(2);
    });
  });
});
