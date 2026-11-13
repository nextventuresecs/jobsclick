import { Job } from 'bullmq';
import { parse } from 'csv-parse';
import { Readable } from 'node:stream';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@indian-job-portal/database';
import { normalizeIndianPhone, udyamNumberSchema } from '@indian-job-portal/validation';

export { normalizeIndianPhone };

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
  role: 'job_seeker' | 'employer';
  status: 'invited';
  seekerType?: 'student' | 'individual';
  aadhaar_last4?: string;
  aadhaar_verified: boolean;
  companyName?: string;
  ownershipType?: string;
  companySize?: string;
  sector?: string;
  city?: string;
  district?: string;
  state?: string;
  address?: string;
  email?: string;
  udyamNumber?: string;
  gstin?: string;
  pincode?: string;
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

            // 2. Maintain relational integrity: insert business_profiles for employers (PR 4)
            const newBizProfiles = (upsertedUsers as Array<{ id: string; phone: string }>)
              .map((user) => {
                const meta = phoneToMeta.get(user.phone);
                if (!meta || meta.role !== 'employer') return null;

                return {
                  user_id: user.id,
                  company_name: meta.companyName || meta.name,
                  ownership_type: meta.ownershipType || 'Private Limited',
                  company_size: meta.companySize || 'Small',
                  sector: meta.sector || null,
                  city: meta.city || null,
                  district: meta.district || null,
                  state: meta.state || null,
                  address: meta.address || null,
                  phone: user.phone,
                  email: meta.email || null,
                  source: meta.source,
                  udyam_number: meta.udyamNumber || null,
                  is_msme: Boolean(meta.udyamNumber) || true,
                  created_at: nowIso,
                  updated_at: nowIso,
                };
              })
              .filter(Boolean) as Array<{
                user_id: string;
                company_name: string;
                ownership_type: string;
                company_size: string;
                sector: string | null;
                city: string | null;
                district: string | null;
                state: string | null;
                address: string | null;
                phone: string;
                email: string | null;
                source: string;
                udyam_number: string | null;
                is_msme: boolean;
                created_at: string;
                updated_at: string;
              }>;

            if (newBizProfiles.length > 0) {
              const userIds = newBizProfiles.map((p) => p.user_id);
              const { data: existingBiz } = await this.supabase
                .from('business_profiles')
                .select('user_id')
                .in('user_id', userIds);

              const existingUserIds = new Set(
                (existingBiz || []).map((p: { user_id: string }) => p.user_id),
              );

              const bizToInsert = newBizProfiles.filter((p) => !existingUserIds.has(p.user_id));

              if (bizToInsert.length > 0) {
                const { error: bizError } = await this.supabase
                  .from('business_profiles')
                  .insert(bizToInsert);
                if (bizError) {
                  throw new Error(`Database error creating business profiles: ${bizError.message}`);
                }
              }
            }

            // 3. Record invitations scoped to batchId (PR 4)
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batchId);
            if (isUuid) {
              const invitationsToInsert = deduplicatedChunk.map((u) => ({
                batch_id: batchId,
                phone: u.phone,
                status: 'pending',
                created_at: nowIso,
              }));
              try {
                await this.supabase.from('invitations').insert(invitationsToInsert);
              } catch {
                // best-effort recording
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

      if (entityType === 'employer') {
        const rawCompanyName = getField(record, 'company_name', 'Company Name', 'companyName', 'name', 'enterprise_name', 'Enterprise Name', 'company');
        const rawPhone = getField(record, 'phone', 'mobile', 'mobile_number', 'Mobile Number', 'Phone', 'Mobile', 'contact', 'Contact');

        // 1. Company Name validation (PRD BULK-02: never default to 'Unnamed Company')
        if (!rawCompanyName) {
          errors.push({
            row: rowNumber,
            phone: rawPhone,
            reason: 'Missing company name',
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

        // 4. Ownership type validation (never silent default)
        const rawOwnership = getField(record, 'ownership_type', 'Ownership Type', 'ownershipType', 'legal_status', 'ownership');
        if (!rawOwnership) {
          errors.push({
            row: rowNumber,
            phone,
            reason: 'Missing ownership type',
          });
          continue;
        }

        // 5. Company size validation (never silent default)
        const rawSize = getField(record, 'company_size', 'Company Size', 'companySize', 'enterprise_size', 'size');
        if (!rawSize) {
          errors.push({
            row: rowNumber,
            phone,
            reason: 'Missing company size',
          });
          continue;
        }

        // 6. Udyam registration number validation if provided
        const rawUdyam = getField(record, 'udyam_number', 'Udyam Number', 'udyamNumber', 'udyam_registration', 'udyam');
        if (rawUdyam) {
          const udyamCheck = udyamNumberSchema.safeParse(rawUdyam);
          if (!udyamCheck.success) {
            errors.push({
              row: rowNumber,
              phone,
              reason: 'Invalid Udyam registration number format (expected UDYAM-XX-00-0000000)',
            });
            continue;
          }
        }

        // 7. GSTIN validation if provided
        const rawGstin = getField(record, 'gstin', 'GSTIN', 'gst_number', 'GST');
        if (rawGstin) {
          if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(rawGstin)) {
            errors.push({
              row: rowNumber,
              phone,
              reason: 'Invalid GSTIN format (expected 15-character alphanumeric)',
            });
            continue;
          }
        }

        // 8. Pincode validation if provided
        const rawPincode = getField(record, 'pincode', 'Pincode', 'pin_code', 'PIN', 'postal_code');
        if (rawPincode) {
          if (!/^\d{6}$/.test(rawPincode)) {
            errors.push({
              row: rowNumber,
              phone,
              reason: 'Invalid 6-digit Indian PIN code',
            });
            continue;
          }
        }

        seenPhones.add(phone);

        currentChunk.push({
          row: rowNumber,
          name: rawCompanyName,
          companyName: rawCompanyName,
          phone,
          source,
          role: 'employer',
          status: 'invited',
          ownershipType: rawOwnership,
          companySize: rawSize,
          sector: getField(record, 'sector', 'Sector', 'industry', 'Industry') || undefined,
          city: getField(record, 'city', 'City') || undefined,
          district: getField(record, 'district', 'District') || undefined,
          state: getField(record, 'state', 'State') || undefined,
          address: getField(record, 'address', 'Address') || undefined,
          email: getField(record, 'email', 'Email', 'email_address') || undefined,
          udyamNumber: rawUdyam || undefined,
          gstin: rawGstin || undefined,
          pincode: rawPincode || undefined,
          aadhaar_verified: false,
        });
      } else {
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
      }

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
