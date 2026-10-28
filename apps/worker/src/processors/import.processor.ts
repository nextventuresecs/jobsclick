import { Job } from 'bullmq';
import { parse } from 'csv-parse';
import { Readable } from 'node:stream';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@indian-job-portal/database';

export interface BulkImportJobData {
  batchId: string;
  source: string;
  entityType?: 'student' | 'employer';
  csvContent?: string;
  storagePath?: string;
  shouldSimulateFailure?: boolean;
}

export interface BulkImportJobResult {
  batchId: string;
  source: string;
  entityType: 'student' | 'employer';
  totalRows: number;
  processedRows: number;
  validRows: number;
  errorRows: number;
  status: 'completed' | 'failed';
  errorCsvContent?: string;
  createdUserCount: number;
}

export interface ImportErrorRecord {
  row: number;
  phone: string;
  reason: string;
}

/**
 * Normalizes Indian phone numbers from diverse formats (+91, 0-prefix, 91-prefix, dashes, spaces)
 * into a canonical 10-digit Indian mobile number format (^[6-9]\d{9}$).
 */
export function normalizeIndianPhone(input: string): string | null {
  if (!input) return null;
  // Strip whitespace, dashes, dots, parens
  let cleaned = input.replace(/[\s\-().]/g, '');

  if (cleaned.startsWith('+91')) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    // Leading zero STD/mobile prefix (09876543210 -> 9876543210)
    cleaned = cleaned.slice(1);
  } else if (cleaned.startsWith('91') && cleaned.length === 12 && /^[6-9]/.test(cleaned.slice(2))) {
    // 91 prefix without plus (919876543210 -> 9876543210)
    cleaned = cleaned.slice(2);
  }

  // Validate Indian 10-digit mobile number format
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}

/**
 * Extracts only the last 4 digits of Aadhaar (Hard Invariant #8).
 * Ensures full 12-digit Aadhaar numbers are never persisted or logged.
 */
export function extractAadhaarLast4(input?: string): string | undefined {
  if (!input) return undefined;
  const digitsOnly = input.replace(/\D/g, '');
  if (digitsOnly.length >= 4) {
    return digitsOnly.slice(-4);
  }
  return undefined;
}

/**
 * Flexible field extractor that handles common header casing variations.
 */
export function getField(record: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      const val = record[key].trim();
      if (val !== '') return val;
    }
  }
  const entries = Object.entries(record);
  for (const key of keys) {
    const lowerKey = key.toLowerCase();
    for (const [k, v] of entries) {
      if (k.toLowerCase().trim() === lowerKey && v) {
        const val = v.trim();
        if (val !== '') return val;
      }
    }
  }
  return '';
}

interface ChunkItem {
  row: number;
  name: string;
  phone: string;
  source: string;
  role: 'job_seeker';
  status: 'invited';
  seekerType: 'student' | 'individual';
  aadhaar_last4?: string;
  aadhaar_verified: boolean;
}

export class ImportProcessor {
  private supabase: SupabaseClient<Database> | null = null;

  constructor(supabaseClient?: SupabaseClient<Database> | null) {
    if (supabaseClient !== undefined) {
      this.supabase = supabaseClient;
    } else {
      const supabaseUrl = process.env['SUPABASE_URL'];
      const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
      if (supabaseUrl && supabaseKey && supabaseKey !== 'dummy-service-role-key') {
        this.supabase = createClient<Database>(supabaseUrl, supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
      }
    }
  }

  public setSupabaseClient(client: SupabaseClient<Database> | null): void {
    this.supabase = client;
  }

  async process(
    job: Job<BulkImportJobData>,
    streamOverride?: Readable,
  ): Promise<BulkImportJobResult> {
    const {
      batchId,
      source,
      entityType = 'student',
      csvContent,
      storagePath,
      shouldSimulateFailure,
    } = job.data;

    // Retry test simulation: if job requests simulated failure, fail until attempt 3
    if (shouldSimulateFailure && job.attemptsMade < 2) {
      throw new Error(`Simulated transient import processing error for retry check (attempt ${job.attemptsMade + 1})`);
    }

    // 1. Establish streaming input source (never buffer entire 50k+ row files in memory)
    let inputStream: Readable;

    if (streamOverride) {
      inputStream = streamOverride;
    } else if (storagePath && this.supabase) {
      const { data: fileData, error: downloadError } = await this.supabase.storage
        .from('private')
        .download(storagePath);
      if (downloadError || !fileData) {
        throw new Error(`Failed to download CSV from storage path ${storagePath}: ${downloadError?.message}`);
      }

      // Convert Supabase Storage Blob to Node.js Readable stream
      const streamable = fileData as unknown as { stream?: () => unknown };
      if (typeof streamable.stream === 'function') {
        inputStream = Readable.fromWeb(streamable.stream() as Parameters<typeof Readable.fromWeb>[0]);
      } else if (Buffer.isBuffer(fileData)) {
        inputStream = Readable.from([fileData]);
      } else {
        const arrayBuffer = await fileData.arrayBuffer();
        inputStream = Readable.from([Buffer.from(arrayBuffer)]);
      }
    } else if (csvContent !== undefined && csvContent !== null) {
      inputStream = Readable.from([csvContent]);
    } else {
      throw new Error(`No CSV content, stream, or storage path provided for batch ${batchId}`);
    }

    const errors: ImportErrorRecord[] = [];
    const seenPhones = new Set<string>();
    let rowNumber = 1; // Row 1 is header
    let totalRows = 0;
    let validCount = 0;

    const CHUNK_SIZE = 500;
    let currentChunk: ChunkItem[] = [];

    // Helper to flush current 500-row chunk to database
    const flushChunk = async () => {
      if (currentChunk.length === 0) return;

      const chunkToProcess = [...currentChunk];
      currentChunk = [];

      let deduplicatedChunk = chunkToProcess;

      // Deduplicate against platform database if Supabase DB is connected
      if (this.supabase) {
        const chunkPhones = chunkToProcess.map((u) => u.phone);
        const { data: existingInDb, error: dbError } = await this.supabase
          .from('users')
          .select('id, phone')
          .in('phone', chunkPhones);

        if (!dbError && existingInDb && existingInDb.length > 0) {
          const dbSet = new Set(existingInDb.map((u) => u.phone));
          deduplicatedChunk = [];
          for (const item of chunkToProcess) {
            if (dbSet.has(item.phone)) {
              errors.push({
                row: item.row,
                phone: item.phone,
                reason: 'Mobile number already exists in database',
              });
            } else {
              deduplicatedChunk.push(item);
            }
          }
        }

        // Batch insert valid users in 'invited' state with ZERO SMS (Hard Invariants #2 & #3)
        if (deduplicatedChunk.length > 0) {
          const nowIso = new Date().toISOString();
          const usersToInsert = deduplicatedChunk.map((u) => ({
            phone: u.phone,
            role: u.role,
            status: u.status,
            source: u.source,
            created_at: nowIso,
            updated_at: nowIso,
          }));

          const { data: upsertedUsers, error: upsertError } = await this.supabase
            .from('users')
            .upsert(usersToInsert, { onConflict: 'phone' })
            .select('id, phone');

          if (upsertError) {
            throw new Error(`Database error upserting users: ${upsertError.message}`);
          }

          // Maintain relational integrity: insert job_seeker_profiles for candidates idempotently
          if (upsertedUsers && upsertedUsers.length > 0) {
            const phoneToMeta = new Map(deduplicatedChunk.map((c) => [c.phone, c]));

            const newProfiles = (upsertedUsers as Array<{ id: string; phone: string }>)
              .map((user) => {
                const meta = phoneToMeta.get(user.phone);
                if (!meta || meta.role !== 'job_seeker') return null;

                return {
                  user_id: user.id,
                  full_name: meta.name,
                  seeker_type: meta.seekerType,
                  aadhaar_last_four: meta.aadhaar_last4 ?? null,
                  aadhaar_verified: false,
                  source: meta.source,
                  skills: [],
                  created_at: nowIso,
                  updated_at: nowIso,
                };
              })
              .filter(Boolean) as Array<{
                user_id: string;
                full_name: string;
                seeker_type: string;
                aadhaar_last_four: string | null;
                aadhaar_verified: boolean;
                source: string;
                skills: string[];
                created_at: string;
                updated_at: string;
              }>;

            if (newProfiles.length > 0) {
              const userIds = newProfiles.map((p) => p.user_id);
              const { data: existingProfiles } = await this.supabase
                .from('job_seeker_profiles')
                .select('user_id')
                .in('user_id', userIds);

              const existingUserIds = new Set(
                (existingProfiles || []).map((p: { user_id: string }) => p.user_id),
              );

              const profilesToInsert = newProfiles.filter((p) => !existingUserIds.has(p.user_id));

              if (profilesToInsert.length > 0) {
                const { error: profileError } = await this.supabase
                  .from('job_seeker_profiles')
                  .insert(profilesToInsert);
                if (profileError) {
                  throw new Error(`Database error creating job seeker profiles: ${profileError.message}`);
                }
              }
            }
          }
        }
      }

      validCount += deduplicatedChunk.length;

      // Update BullMQ job progress
      if (typeof job.updateProgress === 'function') {
        await job.updateProgress({
          processed: totalRows,
          valid: validCount,
          errors: errors.length,
        });
      }
    };

    // Streaming CSV Parser with UTF-8 BOM detection and ragged row tolerance
    const parser = inputStream.pipe(
      parse({
        columns: true,
        trim: true,
        skip_empty_lines: true,
        bom: true,
        relax_column_count: true,
      }),
    );

    for await (const rawRecord of parser) {
      rowNumber++;
      totalRows++;

      const record = rawRecord as Record<string, string>;
      const rawName = getField(record, 'name', 'full_name', 'Student Name', 'student_name', 'candidate_name', 'Name', 'FullName');
      const rawPhone = getField(record, 'phone', 'mobile', 'mobile_number', 'Mobile Number', 'Phone', 'Mobile', 'contact', 'Contact');
      const rawAadhaar = getField(record, 'aadhaar', 'aadhaar_number', 'aadhaar_no', 'Aadhaar', 'Aadhaar Number', 'uid', 'UID');

      // 1. Name validation (PRD BULK-02 missing fields check)
      if (!rawName) {
        errors.push({
          row: rowNumber,
          phone: rawPhone,
          reason: 'Missing candidate full name',
        });
        continue;
      }

      // 2. Phone validation: Indian 10-digit mobile number format
      const phone = normalizeIndianPhone(rawPhone);
      if (!phone) {
        errors.push({
          row: rowNumber,
          phone: rawPhone,
          reason: 'Invalid Indian 10-digit mobile number format',
        });
        continue;
      }

      // 3. Duplicate checking inside the batch
      if (seenPhones.has(phone)) {
        errors.push({
          row: rowNumber,
          phone: rawPhone,
          reason: 'Duplicate mobile number inside file',
        });
        continue;
      }

      seenPhones.add(phone);

      // 4. Aadhaar handling (Hard Invariant #8: Never store full Aadhaar number)
      const aadhaarLast4 = extractAadhaarLast4(rawAadhaar);

      // Invariant #2: users created in 'invited' state with zero SMS at import
      // Invariant #3: every bulk import row keeps its source
      currentChunk.push({
        row: rowNumber,
        name: rawName,
        phone,
        source,
        role: 'job_seeker',
        status: 'invited',
        seekerType: entityType === 'student' ? 'student' : 'individual',
        aadhaar_last4: aadhaarLast4,
        aadhaar_verified: false,
      });

      // Flush when chunk size reaches 500 rows (natural backpressure)
      if (currentChunk.length >= CHUNK_SIZE) {
        await flushChunk();
      }
    }

    // Flush any remaining records in final chunk
    await flushChunk();

    // Generate Error CSV Report if any invalid rows were found (BULK-02)
    let errorCsvContent: string | undefined;
    let errorPath: string | undefined;
    if (errors.length > 0) {
      errorCsvContent =
        'row,phone,reason\n' +
        errors
          .map(
            (e) =>
              `${e.row},"${e.phone.replace(/"/g, '""')}","${e.reason.replace(/"/g, '""')}"`,
          )
          .join('\n');
      errorPath = `bulk-imports/${batchId}-errors.csv`;
      if (this.supabase) {
        await this.supabase.storage.from('private').upload(errorPath, errorCsvContent, {
          contentType: 'text/csv',
          upsert: true,
        });
      }
    }

    // Update batch record status in database if available
    if (this.supabase) {
      await this.supabase
        .from('bulk_import_batches')
        .update({
          status: 'completed',
          total_rows: totalRows,
          processed_rows: totalRows,
          valid_rows: validCount,
          error_rows: errors.length,
          error_csv_storage_path: errorPath || null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', batchId);
    }

    if (typeof job.updateProgress === 'function') {
      await job.updateProgress(100);
    }

    return {
      batchId,
      source,
      entityType,
      totalRows,
      processedRows: totalRows,
      validRows: validCount,
      errorRows: errors.length,
      status: 'completed',
      errorCsvContent,
      createdUserCount: validCount,
    };
  }
}

export const importProcessor = new ImportProcessor();
export const bulkImportProcessor = (job: Job<BulkImportJobData>) => importProcessor.process(job);
