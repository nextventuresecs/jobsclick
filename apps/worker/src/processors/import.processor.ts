import { Job } from 'bullmq';
import { parse } from 'csv-parse';
import { Readable } from 'node:stream';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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

export class ImportProcessor {
  private supabase: SupabaseClient | null = null;

  constructor() {
    const supabaseUrl = process.env['SUPABASE_URL'];
    const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (supabaseUrl && supabaseKey && supabaseKey !== 'dummy-service-role-key') {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    }
  }

  async process(job: Job<BulkImportJobData>): Promise<BulkImportJobResult> {
    const { batchId, source, entityType = 'student', csvContent, storagePath, shouldSimulateFailure } = job.data;

    // Retry test simulation: if job requests simulated failure, fail until attempt 3
    if (shouldSimulateFailure && job.attemptsMade < 2) {
      throw new Error(`Simulated transient import processing error for retry check (attempt ${job.attemptsMade + 1})`);
    }

    let rawCsvText = csvContent;
    if (!rawCsvText && storagePath && this.supabase) {
      const { data: fileData, error: downloadError } = await this.supabase.storage
        .from('private')
        .download(storagePath);
      if (downloadError || !fileData) {
        throw new Error(`Failed to download CSV from storage path ${storagePath}: ${downloadError?.message}`);
      }
      rawCsvText = await fileData.text();
    }

    if (!rawCsvText) {
      throw new Error(`No CSV content or storage path provided for batch ${batchId}`);
    }

    const errors: ImportErrorRecord[] = [];
    const seenPhones = new Set<string>();
    const validUsersToCreate: Array<{
      name: string;
      phone: string;
      source: string;
      role: string;
      status: 'invited';
      aadhaar_last4?: string;
      aadhaar_verified: boolean;
    }> = [];

    let rowNumber = 1; // Row 1 is header
    let totalRows = 0;

    // Streaming CSV Parser
    const parser = Readable.from(rawCsvText).pipe(
      parse({
        columns: true,
        trim: true,
        skip_empty_lines: true,
      }),
    );

    for await (const record of parser) {
      rowNumber++;
      totalRows++;

      const rawName = (record['name'] || record['full_name'] || record['Name'] || '').trim();
      const rawPhone = (record['phone'] || record['mobile'] || record['Phone'] || record['Mobile'] || '').replace(/\s+/g, '');
      const phone = rawPhone.startsWith('+91') ? rawPhone.slice(3) : rawPhone;

      // 1. Phone validation: Indian 10-digit mobile number format
      if (!/^[6-9]\d{9}$/.test(phone)) {
        errors.push({
          row: rowNumber,
          phone: rawPhone,
          reason: 'Invalid Indian 10-digit mobile number format',
        });
        continue;
      }

      // 2. Duplicate checking inside the batch
      if (seenPhones.has(phone)) {
        errors.push({
          row: rowNumber,
          phone: rawPhone,
          reason: 'Duplicate mobile number inside file',
        });
        continue;
      }

      seenPhones.add(phone);

      // 3. Aadhaar handling (Hard Invariant #8: Never store full Aadhaar number)
      const rawAadhaar = (record['aadhaar'] || record['aadhaar_number'] || '').replace(/\s+/g, '');
      const aadhaarLast4 = rawAadhaar.length >= 4 ? rawAadhaar.slice(-4) : undefined;

      // Invariant #2: users created in 'invited' state with zero SMS at import
      // Invariant #3: every bulk import row keeps its source
      validUsersToCreate.push({
        name: rawName || 'Invited Candidate',
        phone,
        source,
        role: entityType === 'employer' ? 'employer' : 'job_seeker',
        status: 'invited',
        ...(aadhaarLast4 ? { aadhaar_last4: aadhaarLast4, aadhaar_verified: false } : { aadhaar_verified: false }),
      });

      // Periodic progress tracking every 500 rows
      if (totalRows % 500 === 0) {
        await job.updateProgress({
          processed: totalRows,
          valid: validUsersToCreate.length,
          errors: errors.length,
        });
      }
    }

    // Persist to Supabase if database connection is available
    if (this.supabase && validUsersToCreate.length > 0) {
      const batchChunkSize = 200;
      for (let i = 0; i < validUsersToCreate.length; i += batchChunkSize) {
        const chunk = validUsersToCreate.slice(i, i + batchChunkSize);
        await this.supabase.from('users').upsert(
          chunk.map((u) => ({
            mobile_number: u.phone,
            role: u.role,
            status: u.status,
            source: u.source,
            created_at: new Date().toISOString(),
          })),
          { onConflict: 'mobile_number' },
        );
      }
    }

    // Generate Error CSV Report if any invalid rows were found (BULK-02)
    let errorCsvContent: string | undefined;
    if (errors.length > 0) {
      errorCsvContent = 'row,phone,reason\n' + errors.map((e) => `${e.row},"${e.phone}","${e.reason}"`).join('\n');
      if (this.supabase) {
        const errorPath = `bulk-imports/${batchId}-errors.csv`;
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
          valid_rows: validUsersToCreate.length,
          error_rows: errors.length,
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
      validRows: validUsersToCreate.length,
      errorRows: errors.length,
      status: 'completed',
      errorCsvContent,
      createdUserCount: validUsersToCreate.length,
    };
  }
}

export const importProcessor = new ImportProcessor();
export const bulkImportProcessor = (job: Job<BulkImportJobData>) => importProcessor.process(job);
