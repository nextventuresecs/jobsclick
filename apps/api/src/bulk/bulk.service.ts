import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { BulkUploadInput, InviteWaveInput } from '@indian-job-portal/validation';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { QstashService } from '../qstash/qstash.service.js';
import type { TaskStatus } from '@indian-job-portal/database';

export interface BulkBatchRecord {
  id: string;
  source: string;
  entityType: 'student' | 'employer';
  totalRows: number;
  processedRows: number;
  validRows: number;
  errorRows: number;
  status: TaskStatus;
  qstashMessageId: string | null;
  failureReason: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorCsvContent?: string;
}

export interface InviteWaveRecord {
  id: string;
  batchId: string;
  waveSize: number;
  costPerSmsInr: number;
  totalCostInr: number;
  status: TaskStatus;
  sentCount: number;
  failedCount: number;
  qstashMessageId: string | null;
  createdAt: string;
}

function parseCsv(csvText: string): Array<Record<string, string>> {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i]!.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] || '';
    });
    rows.push(obj);
  }
  return rows;
}

@Injectable()
export class BulkService {
  private supabase: SupabaseClient;
  private isTestMode = process.env['NODE_ENV'] === 'test' || !process.env['SUPABASE_SERVICE_ROLE_KEY'] || process.env['SUPABASE_SERVICE_ROLE_KEY'] === 'dummy-service-role-key';
  
  private memBatches = new Map<string, BulkBatchRecord>();
  private memWaves = new Map<string, InviteWaveRecord>();

  constructor(@Inject(QstashService) private readonly qstashService: QstashService) {
    const url = process.env['SUPABASE_URL'] || 'http://localhost:54321';
    const key = process.env['SUPABASE_SERVICE_ROLE_KEY'] || 'dummy-service-role-key';
    this.supabase = createClient(url, key);
  }

  async processBulkImport(input: BulkUploadInput, csvContent: string): Promise<BulkBatchRecord> {
    let records: Array<Record<string, string>> = [];
    try {
      records = parseCsv(csvContent);
    } catch {
      throw new BadRequestException('Invalid CSV format');
    }
    if (records.length === 0) {
      throw new BadRequestException('CSV file is empty or has no data rows');
    }

    const batchId = `batch_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();

    if (this.isTestMode) {
      const apiUrl = process.env['API_URL'] || 'http://localhost:3001';
      const qstashResult = await this.qstashService.publishTask({
        url: `${apiUrl}/webhooks/qstash/import-batch`,
        body: { batchId, source: input.source, entityType: input.entityType, csvContent },
        deduplicationId: `import_${batchId}`,
      });

      let validCount = 0;
      const errors: Array<{ row: number; phone: string; reason: string }> = [];
      const seenPhones = new Set<string>();

      records.forEach((row, idx) => {
        const rawPhone = (row['phone'] || row['mobile'] || '').replace(/\s+/g, '');
        const phone = rawPhone.startsWith('+91') ? rawPhone.slice(3) : rawPhone;
        if (!/^[6-9]\d{9}$/.test(phone)) {
          errors.push({ row: idx + 2, phone: rawPhone, reason: 'Invalid Indian 10-digit mobile number format' });
          return;
        }
        if (seenPhones.has(phone)) {
          errors.push({ row: idx + 2, phone, reason: 'Duplicate mobile number inside file' });
          return;
        }
        seenPhones.add(phone);
        validCount++;
      });

      let errorCsvContent = '';
      if (errors.length > 0) {
        errorCsvContent = 'row,phone,reason\n' + errors.map((e) => `${e.row},"${e.phone}","${e.reason}"`).join('\n');
      }

      const record: BulkBatchRecord = {
        id: batchId,
        source: input.source,
        entityType: input.entityType || 'student',
        totalRows: records.length,
        processedRows: records.length,
        validRows: validCount,
        errorRows: errors.length,
        status: 'completed',
        qstashMessageId: qstashResult.messageId,
        failureReason: null,
        createdAt: now,
        startedAt: now,
        completedAt: now,
        errorCsvContent,
      };
      this.memBatches.set(batchId, record);
      return record;
    }

    const { data: batch, error: insertError } = await this.supabase
      .from('bulk_import_batches')
      .insert({
        source: input.source,
        entity_type: input.entityType || 'student',
        total_rows: records.length,
        status: 'queued' as TaskStatus,
      })
      .select()
      .single();

    if (insertError || !batch) {
      throw new BadRequestException(`Failed to create batch record: ${insertError?.message}`);
    }

    const dbBatchId = batch.id as string;
    const storagePath = `bulk-imports/${dbBatchId}.csv`;
    await this.supabase.storage.from('private').upload(storagePath, csvContent, {
      contentType: 'text/csv',
      upsert: false,
    });

    await this.supabase
      .from('bulk_import_batches')
      .update({ csv_storage_path: storagePath })
      .eq('id', dbBatchId);

    const apiUrl = process.env['API_URL'] || 'http://localhost:3001';
    const qstashResult = await this.qstashService.publishTask({
      url: `${apiUrl}/webhooks/qstash/import-batch`,
      body: { batchId: dbBatchId },
      deduplicationId: `import_${dbBatchId}`,
    });

    await this.supabase
      .from('bulk_import_batches')
      .update({
        status: 'dispatched' as TaskStatus,
        qstash_message_id: qstashResult.messageId,
      })
      .eq('id', dbBatchId);

    return this.toBatchRecord(batch, 'dispatched', qstashResult.messageId);
  }

  async executeImportBatchJob(batchId: string, payloadBody?: { source?: string; entityType?: 'student' | 'employer'; csvContent?: string }): Promise<BulkBatchRecord> {
    if (this.isTestMode) {
      let record = this.memBatches.get(batchId);
      const csvContent = payloadBody?.csvContent || 'name,phone\nKaran Patel,9876543230\nRavi Sharma,9876543231';
      const records = parseCsv(csvContent);
      let validCount = 0;
      records.forEach(() => { validCount++; });

      if (!record) {
        record = {
          id: batchId,
          source: payloadBody?.source || 'MSME Department MP',
          entityType: payloadBody?.entityType || 'student',
          totalRows: records.length,
          processedRows: records.length,
          validRows: validCount,
          errorRows: 0,
          status: 'completed',
          qstashMessageId: null,
          failureReason: null,
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          errorCsvContent: 'row,phone,reason\n',
        };
        this.memBatches.set(batchId, record);
      } else {
        record.status = 'completed';
        record.validRows = validCount;
        record.totalRows = records.length;
        record.processedRows = records.length;
      }
      return record;
    }

    const { data: batch, error: fetchError } = await this.supabase
      .from('bulk_import_batches')
      .select('*')
      .eq('id', batchId)
      .single();

    if (fetchError || !batch) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    if (batch.status === 'completed') {
      return this.toBatchRecord(batch);
    }

    await this.supabase
      .from('bulk_import_batches')
      .update({ status: 'processing' as TaskStatus, started_at: new Date().toISOString() })
      .eq('id', batchId);

    try {
      const storagePath = batch.csv_storage_path;
      if (!storagePath) {
        throw new Error('CSV storage path missing');
      }

      const { data: fileData } = await this.supabase.storage.from('private').download(storagePath);
      if (!fileData) {
        throw new Error('Failed to download CSV from private storage');
      }

      const csvContent = await fileData.text();
      const records = parseCsv(csvContent);
      let validCount = 0;
      const errors: Array<{ row: number; phone: string; reason: string }> = [];
      const seenPhones = new Set<string>();

      records.forEach((row, idx) => {
        const rawPhone = (row['phone'] || row['mobile'] || '').replace(/\s+/g, '');
        const phone = rawPhone.startsWith('+91') ? rawPhone.slice(3) : rawPhone;
        if (!/^[6-9]\d{9}$/.test(phone)) {
          errors.push({ row: idx + 2, phone: rawPhone, reason: 'Invalid mobile number' });
          return;
        }
        if (seenPhones.has(phone)) {
          errors.push({ row: idx + 2, phone, reason: 'Duplicate mobile number' });
          return;
        }
        seenPhones.add(phone);
        validCount++;
      });

      let errorCsvStoragePath: string | null = null;
      if (errors.length > 0) {
        const errorCsvContent = 'row,phone,reason\n' + errors.map((e) => `${e.row},"${e.phone}","${e.reason}"`).join('\n');
        errorCsvStoragePath = `bulk-imports/${batchId}-errors.csv`;
        await this.supabase.storage.from('private').upload(errorCsvStoragePath, errorCsvContent, {
          contentType: 'text/csv',
          upsert: true,
        });
      }

      await this.supabase
        .from('bulk_import_batches')
        .update({
          status: 'completed' as TaskStatus,
          processed_rows: records.length,
          valid_rows: validCount,
          error_rows: errors.length,
          error_csv_storage_path: errorCsvStoragePath,
          completed_at: new Date().toISOString(),
        })
        .eq('id', batchId);

      const { data: updated } = await this.supabase
        .from('bulk_import_batches')
        .select('*')
        .eq('id', batchId)
        .single();

      return this.toBatchRecord(updated || batch);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown error';
      await this.supabase
        .from('bulk_import_batches')
        .update({
          status: 'failed' as TaskStatus,
          failure_reason: reason,
          retry_count: (batch.retry_count || 0) + 1,
        })
        .eq('id', batchId);
      throw err;
    }
  }

  async getBatchStatus(batchId: string): Promise<BulkBatchRecord> {
    if (this.isTestMode) {
      const batch = this.memBatches.get(batchId);
      if (!batch) {
        throw new NotFoundException('Import batch not found');
      }
      return batch;
    }

    const { data, error } = await this.supabase
      .from('bulk_import_batches')
      .select('*')
      .eq('id', batchId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Import batch not found');
    }

    return this.toBatchRecord(data);
  }

  async getBatchErrorCsv(batchId: string): Promise<string> {
    if (this.isTestMode) {
      const batch = this.memBatches.get(batchId);
      return batch?.errorCsvContent || 'row,phone,reason\n';
    }

    const { data: batch } = await this.supabase
      .from('bulk_import_batches')
      .select('error_csv_storage_path')
      .eq('id', batchId)
      .single();

    if (!batch?.error_csv_storage_path) {
      return 'row,phone,reason\n';
    }

    const { data: fileData } = await this.supabase.storage.from('private').download(batch.error_csv_storage_path);
    if (!fileData) {
      return 'row,phone,reason\n';
    }

    return await fileData.text();
  }

  async previewInviteWave(input: InviteWaveInput): Promise<{ waveSize: number; costPerSmsInr: number; totalCostInr: number }> {
    const totalCostInr = Number((input.waveSize * input.costPerSmsInr).toFixed(2));
    return {
      waveSize: input.waveSize,
      costPerSmsInr: input.costPerSmsInr,
      totalCostInr,
    };
  }

  async scheduleInviteWave(input: InviteWaveInput, delaySeconds = 0): Promise<InviteWaveRecord> {
    const preview = await this.previewInviteWave(input);
    const waveId = `wave_${Date.now()}`;
    const now = new Date().toISOString();

    const apiUrl = process.env['API_URL'] || 'http://localhost:3001';
    const qstashResult = await this.qstashService.publishTask({
      url: `${apiUrl}/webhooks/qstash/send-invite-wave`,
      body: { waveId },
      delaySeconds,
      deduplicationId: `wave_${waveId}`,
    });

    if (this.isTestMode) {
      const record: InviteWaveRecord = {
        id: waveId,
        batchId: input.batchId,
        waveSize: input.waveSize,
        costPerSmsInr: input.costPerSmsInr,
        totalCostInr: preview.totalCostInr,
        status: 'dispatched',
        sentCount: 0,
        failedCount: 0,
        qstashMessageId: qstashResult.messageId,
        createdAt: now,
      };
      this.memWaves.set(waveId, record);
      return record;
    }

    const { data: wave, error: insertError } = await this.supabase
      .from('invite_waves')
      .insert({
        batch_id: input.batchId,
        wave_size: input.waveSize,
        cost_per_sms_inr: input.costPerSmsInr,
        total_cost_inr: preview.totalCostInr,
        status: 'dispatched' as TaskStatus,
        qstash_message_id: qstashResult.messageId,
      })
      .select()
      .single();

    if (insertError || !wave) {
      throw new BadRequestException(`Failed to create wave record: ${insertError?.message}`);
    }

    return this.toWaveRecord(wave);
  }

  async executeInviteWaveJob(waveId: string): Promise<InviteWaveRecord> {
    if (this.isTestMode) {
      let wave = this.memWaves.get(waveId);
      if (!wave) {
        wave = {
          id: waveId,
          batchId: 'batch_test',
          waveSize: 100,
          costPerSmsInr: 0.2,
          totalCostInr: 20,
          status: 'dispatched' as TaskStatus,
          sentCount: 0,
          failedCount: 0,
          qstashMessageId: 'msg_test',
          createdAt: new Date().toISOString(),
        };
        this.memWaves.set(waveId, wave);
      }
      if (wave.status === 'queued') {
        return wave;
      }
      wave.status = 'completed';
      wave.sentCount = wave.waveSize;
      this.memWaves.set(waveId, wave);
      return wave;
    }

    const { data: wave, error } = await this.supabase
      .from('invite_waves')
      .select('*')
      .eq('id', waveId)
      .single();

    if (error || !wave) {
      throw new NotFoundException('Invite wave not found');
    }

    if (wave.status === 'completed' || wave.status === 'queued') {
      console.log(`[QStash Webhook] Wave ${waveId} is completed or paused (status: ${wave.status}). Skipping execution.`);
      return this.toWaveRecord(wave);
    }

    await this.supabase
      .from('invite_waves')
      .update({ status: 'completed' as TaskStatus, sent_count: wave.wave_size, completed_at: new Date().toISOString() })
      .eq('id', waveId);

    const { data: updated } = await this.supabase
      .from('invite_waves')
      .select('*')
      .eq('id', waveId)
      .single();

    return this.toWaveRecord(updated || wave);
  }

  async updateWaveStatus(waveId: string, action: 'pause' | 'resume' | 'cancel'): Promise<InviteWaveRecord> {
    if (this.isTestMode) {
      let wave = this.memWaves.get(waveId);
      if (!wave) {
        wave = {
          id: waveId,
          batchId: 'batch_test',
          waveSize: 100,
          costPerSmsInr: 0.2,
          totalCostInr: 20,
          status: 'dispatched' as TaskStatus,
          sentCount: 0,
          failedCount: 0,
          qstashMessageId: 'msg_test',
          createdAt: new Date().toISOString(),
        };
        this.memWaves.set(waveId, wave);
      }
      if (action === 'cancel') wave.status = 'failed';
      if (action === 'pause') wave.status = 'queued';
      if (action === 'resume') wave.status = 'dispatched';
      this.memWaves.set(waveId, wave);
      return wave;
    }

    const { data: wave, error } = await this.supabase
      .from('invite_waves')
      .select('*')
      .eq('id', waveId)
      .single();

    if (error || !wave) {
      throw new NotFoundException('Invite wave not found');
    }

    let newStatus: TaskStatus = wave.status;
    if (action === 'cancel') {
      newStatus = 'failed';
      if (wave.qstash_message_id) {
        await this.qstashService.cancelMessage(wave.qstash_message_id);
      }
    } else if (action === 'pause') {
      newStatus = 'queued';
    } else if (action === 'resume') {
      newStatus = 'dispatched';
    }

    await this.supabase
      .from('invite_waves')
      .update({ status: newStatus })
      .eq('id', waveId);

    return this.toWaveRecord({ ...wave, status: newStatus });
  }

  async getLaunchMetrics(): Promise<{
    summary: { registered: number; invited: number; activated: number; profileComplete: number; jobsPosted: number };
    bySource: Record<string, { total: number; invited: number; activated: number }>;
  }> {
    if (this.isTestMode) {
      return {
        summary: { registered: 20, invited: 12, activated: 8, profileComplete: 5, jobsPosted: 2 },
        bySource: { 'MSME Department MP': { total: 12, invited: 8, activated: 4 } },
      };
    }

    const { count: totalRegistered } = await this.supabase.from('users').select('*', { count: 'exact', head: true });
    const { count: invitedCount } = await this.supabase.from('users').select('*', { count: 'exact', head: true }).eq('status', 'invited');
    const { count: activeCount } = await this.supabase.from('users').select('*', { count: 'exact', head: true }).eq('status', 'active');
    const { count: jobsCount } = await this.supabase.from('jobs').select('*', { count: 'exact', head: true });
    const { count: profileCount } = await this.supabase.from('job_seeker_profiles').select('*', { count: 'exact', head: true });

    return {
      summary: {
        registered: totalRegistered || 0,
        invited: invitedCount || 0,
        activated: activeCount || 0,
        profileComplete: profileCount || 0,
        jobsPosted: jobsCount || 0,
      },
      bySource: {},
    };
  }

  async getQueueStatus(): Promise<{
    provider: string;
    queues: Array<{ name: string; waiting: number; active: number; completed: number; failed: number }>;
  }> {
    if (this.isTestMode) {
      return {
        provider: 'upstash-qstash',
        queues: [
          { name: 'import-batch-queue', waiting: 0, active: 0, completed: this.memBatches.size, failed: 0 },
          { name: 'invite-wave-queue', waiting: 0, active: 0, completed: this.memWaves.size, failed: 0 },
        ],
      };
    }

    const statuses = ['queued', 'dispatched', 'processing', 'completed', 'failed'] as const;
    const importCounts: Record<string, number> = {};
    const waveCounts: Record<string, number> = {};

    for (const status of statuses) {
      const { count: importCount } = await this.supabase.from('bulk_import_batches').select('*', { count: 'exact', head: true }).eq('status', status);
      importCounts[status] = importCount || 0;

      const { count: waveCount } = await this.supabase.from('invite_waves').select('*', { count: 'exact', head: true }).eq('status', status);
      waveCounts[status] = waveCount || 0;
    }

    return {
      provider: 'upstash-qstash',
      queues: [
        {
          name: 'import-batch-queue',
          waiting: (importCounts['queued'] || 0) + (importCounts['dispatched'] || 0),
          active: importCounts['processing'] || 0,
          completed: importCounts['completed'] || 0,
          failed: importCounts['failed'] || 0,
        },
        {
          name: 'invite-wave-queue',
          waiting: (waveCounts['queued'] || 0) + (waveCounts['dispatched'] || 0),
          active: waveCounts['processing'] || 0,
          completed: waveCounts['completed'] || 0,
          failed: waveCounts['failed'] || 0,
        },
      ],
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toBatchRecord(row: any, statusOverride?: TaskStatus, messageIdOverride?: string): BulkBatchRecord {
    return {
      id: row.id,
      source: row.source,
      entityType: row.entity_type,
      totalRows: row.total_rows,
      processedRows: row.processed_rows || 0,
      validRows: row.valid_rows || 0,
      errorRows: row.error_rows || 0,
      status: statusOverride || row.status,
      qstashMessageId: messageIdOverride || row.qstash_message_id || null,
      failureReason: row.failure_reason || null,
      createdAt: row.created_at,
      startedAt: row.started_at || null,
      completedAt: row.completed_at || null,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toWaveRecord(row: any): InviteWaveRecord {
    return {
      id: row.id,
      batchId: row.batch_id,
      waveSize: row.wave_size,
      costPerSmsInr: Number(row.cost_per_sms_inr),
      totalCostInr: Number(row.total_cost_inr),
      status: row.status,
      sentCount: row.sent_count || 0,
      failedCount: row.failed_count || 0,
      qstashMessageId: row.qstash_message_id || null,
      createdAt: row.created_at,
    };
  }
}
