import { Job } from 'bullmq';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@indian-job-portal/database';
import { captureException, captureMessage } from '../config/sentry.js';
import { renderInvoicePdf } from '../pdf/invoice-pdf-generator.js';
import { WorkerEmailService } from '../email/email.service.js';
import { isValidGstin } from '@indian-job-portal/validation';

export interface InvoiceOutboxJobData {
  outboxId?: string;
  paymentId?: string;
  batchLimit?: number;
}

export interface InvoiceOutboxJobResult {
  processed: number;
  succeeded: number;
  failed: number;
}

export interface OutboxEntry {
  id: string;
  kind: string;
  payment_id: string;
  attempts: number;
  created_at: string;
}

export interface BillingSnapshot {
  name?: string;
  gstin?: string | null;
  state_code?: string | null;
  address?: string | null;
  email?: string | null;
}

export interface IssuedInvoice {
  id: string;
  number: string;
  kind: string;
  payment_id: string;
  fy: string;
  taxable_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  total_paise: number;
  issued_at: string;
  billing_snapshot: BillingSnapshot | Record<string, unknown>;
  pdf_path: string | null;
  emailed_at: string | null;
}

export interface PlatformInvoiceSettings {
  legal_name: string;
  gstin: string;
  state_code: string;
  address: string;
  sac: string;
  series_prefix: string;
}

export class InvoiceOutboxService {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly emailService: WorkerEmailService,
  ) {}

  /**
   * Boot validation: ensure platform GSTIN is valid and not a placeholder
   */
  async validatePlatformSettings(): Promise<PlatformInvoiceSettings> {
    const { data, error } = await this.supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'invoice_settings')
      .single();

    if (error || !data) {
      throw new Error(`Platform invoice settings not found: ${error?.message || 'missing'}`);
    }

    const settings = data.value as unknown as PlatformInvoiceSettings;
    if (!settings.gstin || !isValidGstin(settings.gstin)) {
      throw new Error(`Invalid platform GSTIN configured: ${settings.gstin}`);
    }

    return settings;
  }

  /**
   * Process a single outbox entry: issue invoice, render PDF, save to storage, send email.
   * Failure NEVER blocks credit grant.
   */
  async processOutboxEntry(entry: OutboxEntry): Promise<boolean> {
    const invoiceKind = entry.kind === 'credit_note' ? 'credit_note' : 'invoice';

    try {
      // 1. Issue invoice / credit note via atomic gapless RPC
      const { data: invData, error: invErr } = await (this.supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: IssuedInvoice | null; error: { message: string } | null }>)(
        'rpc_issue_invoice',
        {
          p_payment_id: entry.payment_id,
          p_kind: invoiceKind,
        },
      );

      if (invErr || !invData) {
        throw new Error(`Failed to issue invoice via RPC: ${invErr?.message || 'no data'}`);
      }

      await this.deliverInvoice(invData, invoiceKind);
    } catch (err) {
      const newAttempts = entry.attempts + 1;
      await this.acknowledgeAttempt(entry, false);
      if (newAttempts >= 5) {
        captureMessage(
          `Alert: Invoice outbox entry ${entry.id} failed after 5 attempts for payment ${entry.payment_id}`,
          'error',
        );
      }
      captureException(err instanceof Error ? err : new Error('INVOICE_DELIVERY_FAILED'));
      return false;
    }

    // If the completion response is lost, the write may have committed. Do not clear it.
    await this.acknowledgeAttempt(entry, true);
    return true;
  }

  private async deliverInvoice(invoice: IssuedInvoice, invoiceKind: 'invoice' | 'credit_note'): Promise<void> {
    const billing = (invoice.billing_snapshot || {}) as BillingSnapshot;
    const storage = this.supabase.storage.from('private');
    const storagePath = `invoices/${invoice.id}.pdf`;
    const readPdf = async () => {
      const { data, error } = await storage.download(storagePath);
      if (error || !data) throw new Error('INVOICE_PDF_READ_FAILED');
      return Buffer.from(await data.arrayBuffer());
    };
    let pdfBuffer: Buffer;
    if (invoice.pdf_path === storagePath) {
      pdfBuffer = await readPdf();
    } else {
      const settings = await this.validatePlatformSettings();
      pdfBuffer = await renderInvoicePdf({
        invoiceNumber: invoice.number,
        kind: invoiceKind,
        fy: invoice.fy,
        issuedAt: invoice.issued_at,
        supplier: {
          legalName: settings.legal_name,
          gstin: settings.gstin,
          stateCode: settings.state_code,
          address: settings.address,
          sac: settings.sac,
        },
        buyer: {
          name: billing.name || 'Customer',
          gstin: billing.gstin ?? null,
          stateCode: billing.state_code ?? null,
          address: billing.address ?? null,
        },
        taxablePaise: Number(invoice.taxable_paise),
        cgstPaise: Number(invoice.cgst_paise),
        sgstPaise: Number(invoice.sgst_paise),
        igstPaise: Number(invoice.igst_paise),
        totalPaise: Number(invoice.total_paise),
        description: invoiceKind === 'credit_note' ? 'Reversal / Credit Note' : 'JobsClick Platform Credits / Services',
      });

      const { data, error } = await storage.upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });
      if (error) {
        if (error.status !== 409 && String(error.statusCode) !== '409') {
          throw new Error('INVOICE_PDF_UPLOAD_FAILED');
        }
        // A retry after upload must reuse the original attachment with the same email idempotency key.
        pdfBuffer = await readPdf();
      } else if (data?.path !== storagePath) {
        throw new Error('INVOICE_PDF_UPLOAD_UNCONFIRMED');
      }
      await this.saveInvoiceCheckpoint(invoice.id, { pdf_path: storagePath });
    }

    const recipient = typeof billing.email === 'string' ? billing.email.trim() : '';
    if (!recipient || invoice.emailed_at) return;

    const result = await this.emailService.sendInvoiceEmail({
      to: recipient,
      invoiceNumber: invoice.number,
      kind: invoiceKind,
      totalInr: Number(invoice.total_paise) / 100,
      pdfBuffer,
      idempotencyKey: `invoice-email/${invoice.id}`,
    });
    if (!result.success || !result.messageId?.trim()) throw new Error('INVOICE_EMAIL_UNCONFIRMED');
    await this.saveInvoiceCheckpoint(invoice.id, { emailed_at: new Date().toISOString() });
  }

  private async saveInvoiceCheckpoint(
    invoiceId: string,
    checkpoint: Pick<Partial<IssuedInvoice>, 'pdf_path' | 'emailed_at'>,
  ): Promise<void> {
    const { data, error } = await this.supabase.from('invoices')
      .update(checkpoint)
      .eq('id', invoiceId)
      .select('id')
      .single();
    if (error || !data) throw new Error('INVOICE_CHECKPOINT_WRITE_FAILED');
  }

  private async acknowledgeAttempt(entry: OutboxEntry, done: boolean): Promise<void> {
    const { error } = await (this.supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>)(
      'rpc_complete_outbox',
      { p_id: entry.id, p_attempts: entry.attempts + 1, p_done: done },
    );
    if (error) throw new Error('INVOICE_OUTBOX_ACK_FAILED');
  }

  /**
   * Monitor for stuck outbox items: older than 30 min with done_at is null
   */
  async checkStuckOutboxEntries(): Promise<number> {
    const { data, error } = await (this.supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: number | null; error: { message: string } | null }>)(
      'rpc_check_stuck_outbox',
      { p_minutes: 30 },
    );

    if (!error && typeof data === 'number' && data > 0) {
      captureMessage(`Alert: ${data} invoice outbox items pending for >30m`, 'warning');
      return data;
    }
    return 0;
  }
}

export async function invoiceOutboxProcessor(
  job: Job<InvoiceOutboxJobData>,
): Promise<InvoiceOutboxJobResult> {
  const supabaseUrl = process.env['SUPABASE_URL'] || 'http://127.0.0.1:54321';
  const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] || process.env['SUPABASE_KEY'] || '';
  const supabase = createClient<Database>(supabaseUrl, supabaseKey);
  const emailService = new WorkerEmailService();

  const service = new InvoiceOutboxService(supabase, emailService);

  // If specific outboxId or paymentId provided
  if (job.data.outboxId) {
    const { data, error } = await (supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: OutboxEntry[] | null; error: { message: string } | null }>)(
      'rpc_claim_outbox_batch',
      { p_limit: 100 },
    );
    if (error || !data) throw new Error('INVOICE_OUTBOX_CLAIM_FAILED');

    const match = data.find((item) => item.id === job.data.outboxId);
    if (match) {
      const ok = await service.processOutboxEntry(match);
      return { processed: 1, succeeded: ok ? 1 : 0, failed: ok ? 0 : 1 };
    }
  }

  // Batch process pending entries using FOR UPDATE SKIP LOCKED
  const limit = job.data.batchLimit ?? 10;
  const { data: pending, error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: OutboxEntry[] | null; error: { message: string } | null }>)(
    'rpc_claim_outbox_batch',
    { p_limit: limit },
  );
  if (error || !pending) throw new Error('INVOICE_OUTBOX_CLAIM_FAILED');

  let succeeded = 0;
  let failed = 0;

  for (const entry of pending) {
    const ok = await service.processOutboxEntry(entry);
    if (ok) succeeded++;
    else failed++;
  }

  await service.checkStuckOutboxEntries();

  return {
    processed: pending.length,
    succeeded,
    failed,
  };
}
