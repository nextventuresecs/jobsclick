import { Job } from 'bullmq';
import { parse } from 'csv-parse';
import { Readable } from 'node:stream';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@indian-job-portal/database';
import { normalizeIndianPhone, normalizeEmail } from '@indian-job-portal/validation';
import { WorkerEmailService } from '../email/email.service.js';

export { normalizeIndianPhone, normalizeEmail };

export interface BulkImportJobData {
  batchId: string;
  source: string;
  entityType?: 'student' | 'employer';
  csvContent?: string;
  storagePath?: string;
  shouldSimulateFailure?: boolean;
  institutionId?: string | null;
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
  phone?: string | null;
  email?: string | null;
  source: string;
  role: 'job_seeker' | 'employer';
  status: 'invited';
  seekerType?: 'student' | 'individual';
  companyName?: string;
  ownershipType?: string;
  companySize?: string;
  aadhaar_last4?: string;
  aadhaar_verified: boolean;
}

export class ImportProcessor {
  private supabase: SupabaseClient<Database> | null = null;
  private emailService: WorkerEmailService;

  constructor(
    supabaseClient?: SupabaseClient<Database> | null,
    emailService?: WorkerEmailService,
  ) {
    this.emailService = emailService ?? new WorkerEmailService();

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
      institutionId: jobInstitutionId,
    } = job.data;

    // Resolve institution_id server-side (from job data or batch record)
    let resolvedInstitutionId: string | null = jobInstitutionId ?? null;
    if (!resolvedInstitutionId && this.supabase) {
      try {
        const { data: b } = await this.supabase
          .from('bulk_import_batches')
          .select('institution_id')
          .eq('id', batchId)
          .maybeSingle();
        if (b && (b as { institution_id?: string | null }).institution_id) {
          resolvedInstitutionId = (b as { institution_id?: string | null }).institution_id || null;
        }
      } catch {
        // best-effort
      }
    }

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
    const seenEmails = new Set<string>();
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
        const chunkPhones = chunkToProcess.map((u) => u.phone).filter(Boolean) as string[];
        const chunkEmails = chunkToProcess.map((u) => u.email).filter(Boolean) as string[];

        const existingPhones = new Set<string>();
        const existingEmails = new Set<string>();

        if (chunkPhones.length > 0) {
          const { data: existingPhoneUsers } = await this.supabase
            .from('users')
            .select('id, phone')
            .in('phone', chunkPhones);
          (existingPhoneUsers || []).forEach((u: { phone?: string | null }) => {
            if (u.phone) existingPhones.add(u.phone);
          });
        }

        if (chunkEmails.length > 0) {
          const { data: existingEmailUsers } = await this.supabase
            .from('users')
            .select('id, email')
            .in('email', chunkEmails);
          (existingEmailUsers || []).forEach((u: { email?: string | null }) => {
            if (u.email) existingEmails.add(u.email);
          });
        }

        deduplicatedChunk = [];
        for (const item of chunkToProcess) {
          if (item.phone && existingPhones.has(item.phone)) {
            errors.push({
              row: item.row,
              phone: item.phone,
              reason: 'Mobile number already exists in database',
            });
          } else if (item.email && existingEmails.has(item.email)) {
            errors.push({
              row: item.row,
              phone: item.phone || item.email,
              reason: 'Email already exists in database',
            });
          } else {
            deduplicatedChunk.push(item);
          }
        }

        // Batch insert valid users in 'invited' state with ZERO SMS (Hard Invariants #2 & #3)
        if (deduplicatedChunk.length > 0) {
          const nowIso = new Date().toISOString();
          const usersToInsert = deduplicatedChunk.map((u) => ({
            phone: u.phone ?? null,
            email: u.email ?? null,
            role: u.role,
            status: u.status,
            source: u.source,
            created_at: nowIso,
            updated_at: nowIso,
          }));

          const { data: upsertedUsers, error: upsertError } = await this.supabase
            .from('users')
            .upsert(usersToInsert as unknown as Database['public']['Tables']['users']['Insert'][])
            .select('id, phone, email');

          if (upsertError) {
            throw new Error(`Database error upserting users: ${upsertError.message}`);
          }

          if (upsertedUsers && upsertedUsers.length > 0) {
            // Map created user to metadata
            const usersList = upsertedUsers as Array<{ id: string; phone?: string | null; email?: string | null }>;

            // 1. Insert job_seeker_profiles
            const newSeekerProfiles = usersList
              .map((user, idx) => {
                const meta = deduplicatedChunk[idx] || deduplicatedChunk.find(
                  (c) => (c.phone && c.phone === user.phone) || (c.email && c.email === user.email),
                );
                if (!meta || meta.role !== 'job_seeker') return null;

                return {
                  user_id: user.id,
                  full_name: meta.name || 'Invited Student',
                  seeker_type: meta.seekerType || 'student',
                  aadhaar_last_four: meta.aadhaar_last4 ?? null,
                  aadhaar_verified: false,
                  source: meta.source,
                  skills: [],
                  institution_id: resolvedInstitutionId,
                  created_at: nowIso,
                  updated_at: nowIso,
                };
              })
              .filter(Boolean) as Array<Record<string, unknown>>;

            if (newSeekerProfiles.length > 0) {
              try {
                const { data: insertedProfiles } = await this.supabase
                  .from('job_seeker_profiles')
                  .insert(newSeekerProfiles as unknown as Database['public']['Tables']['job_seeker_profiles']['Insert'][])
                  .select('id');

                // If institution is resolved and profiles were inserted, claim available sponsorship seats
                if (resolvedInstitutionId && insertedProfiles && insertedProfiles.length > 0) {
                  const chunkProfileIds = (insertedProfiles as Array<{ id: string }>).map((p) => p.id);
                  try {
                    await (this.supabase.rpc as unknown as (
                      fn: string,
                      args: Record<string, unknown>,
                    ) => Promise<{ data: unknown; error: unknown }>)(
                      'rpc_claim_sponsorship_seats',
                      {
                        p_inst: resolvedInstitutionId,
                        p_profile_ids: chunkProfileIds,
                      },
                    );
                  } catch (claimErr) {
                    console.warn(`[ImportProcessor] Failed to claim sponsorship seats for chunk:`, claimErr);
                  }
                }
              } catch {
                // best-effort
              }
            }

            // 2. Insert business_profiles
            const newBizProfiles = usersList
              .map((user, idx) => {
                const meta = deduplicatedChunk[idx] || deduplicatedChunk.find(
                  (c) => (c.phone && c.phone === user.phone) || (c.email && c.email === user.email),
                );
                if (!meta || meta.role !== 'employer') return null;

                return {
                  user_id: user.id,
                  company_name: meta.companyName || meta.name || 'Invited Employer',
                  ownership_type: meta.ownershipType || 'Private Limited',
                  company_size: meta.companySize || 'Small',
                  source: meta.source,
                  is_msme: true,
                  created_at: nowIso,
                  updated_at: nowIso,
                };
              })
              .filter(Boolean) as Array<Record<string, unknown>>;

            if (newBizProfiles.length > 0) {
              try {
                await this.supabase
                  .from('business_profiles')
                  .insert(newBizProfiles as unknown as Database['public']['Tables']['business_profiles']['Insert'][]);
              } catch {
                // best-effort
              }
            }

            // 3. Record invitations scoped to batchId
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batchId);
            if (isUuid) {
              const invitationsToInsert = deduplicatedChunk.map((u) => ({
                batch_id: batchId,
                phone: u.phone ?? null,
                email: u.email ?? null,
                status: 'pending',
                created_at: nowIso,
              }));
              try {
                await this.supabase.from('invitations').insert(invitationsToInsert);
              } catch {
                // best-effort
              }
            }

            // 4. Send Welcome Onboarding Email to all email recipients
            for (const item of deduplicatedChunk) {
              if (item.email) {
                try {
                  await this.emailService.sendBulkOnboardingWelcomeEmail({
                    email: item.email,
                    role: item.role,
                    source: item.source,
                    name: item.name,
                  });
                } catch (emailErr) {
                  console.error(`[ImportProcessor] Failed to send welcome email to ${item.email}:`, emailErr);
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

      const rawPhone = getField(record, 'phone', 'mobile', 'mobile_number', 'Mobile Number', 'Phone', 'Mobile', 'contact', 'Contact');
      const rawEmail = getField(record, 'email', 'Email', 'email_address', 'mail');
      const rawName = getField(record, 'name', 'full_name', 'Student Name', 'student_name', 'candidate_name', 'Name', 'FullName');
      const rawCompanyName = getField(record, 'company_name', 'Company Name', 'companyName', 'enterprise_name', 'Enterprise Name', 'company');
      const rawAadhaar = getField(record, 'aadhaar', 'aadhaar_number', 'aadhaar_no', 'Aadhaar', 'Aadhaar Number', 'uid', 'UID');

      // Contact Validation: Either email or phone is required
      const phone = rawPhone ? normalizeIndianPhone(rawPhone) : null;
      const email = rawEmail ? normalizeEmail(rawEmail) : null;

      // If raw phone was provided but is invalid
      if (rawPhone && !phone) {
        errors.push({
          row: rowNumber,
          phone: rawPhone,
          reason: 'Invalid Indian 10-digit mobile number format',
        });
        continue;
      }

      // If raw email was provided but is invalid
      if (rawEmail && !email) {
        errors.push({
          row: rowNumber,
          phone: rawPhone || rawEmail,
          reason: 'Invalid email address format',
        });
        continue;
      }

      // If neither phone nor email was provided
      if (!phone && !email) {
        errors.push({
          row: rowNumber,
          phone: rawPhone || '',
          reason: 'At least one contact identifier (email or phone) is required',
        });
        continue;
      }

      // Name Validation: If name column is present in headers, candidate name is required
      const hasNameHeader = Object.keys(record).some((k) =>
        ['name', 'full_name', 'student name', 'student_name', 'candidate_name', 'fullname'].includes(
          k.toLowerCase().trim(),
        ),
      );
      if (hasNameHeader && !rawName) {
        errors.push({
          row: rowNumber,
          phone: phone || rawPhone || '',
          reason: 'Missing candidate full name',
        });
        continue;
      }

      // Duplicate checking inside the batch
      if (phone && seenPhones.has(phone)) {
        errors.push({
          row: rowNumber,
          phone,
          reason: 'Duplicate mobile number inside file',
        });
        continue;
      }

      if (email && seenEmails.has(email)) {
        errors.push({
          row: rowNumber,
          phone: phone || email,
          reason: 'Duplicate email inside file',
        });
        continue;
      }

      if (phone) seenPhones.add(phone);
      if (email) seenEmails.add(email);

      // Aadhaar handling (Hard Invariant #8: Never store full Aadhaar number)
      const aadhaarLast4 = extractAadhaarLast4(rawAadhaar);
      const isEmployer = entityType === 'employer';

      currentChunk.push({
        row: rowNumber,
        name: rawName || rawCompanyName || (isEmployer ? 'Invited Employer' : 'Invited Student'),
        companyName: rawCompanyName || rawName || 'Invited Employer',
        phone,
        email,
        source,
        role: isEmployer ? 'employer' : 'job_seeker',
        status: 'invited',
        seekerType: entityType === 'student' ? 'student' : 'individual',
        ownershipType: getField(record, 'ownership_type', 'ownershipType', 'legal_status') || 'Private Limited',
        companySize: getField(record, 'company_size', 'companySize', 'size') || 'Small',
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
              `${e.row},"${(e.phone || '').replace(/"/g, '""')}","${e.reason.replace(/"/g, '""')}"`,
          )
          .join('\n');
      errorPath = `bulk-imports/${batchId}-errors.csv`;
      if (this.supabase) {
        try {
          await this.supabase.storage.from('private').upload(errorPath, errorCsvContent, {
            contentType: 'text/csv',
            upsert: true,
          });
        } catch {
          // best-effort
        }
      }
    }

    // Update batch record status in database if available
    if (this.supabase) {
      try {
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
      } catch {
        // best-effort
      }
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
