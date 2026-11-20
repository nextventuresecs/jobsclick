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
  billing_snapshot: Record<string, unknown>;
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

      const invoice = invData;
      const settings = await this.validatePlatformSettings();
      const billing = invoice.billing_snapshot || {};

      // 2. Render PDF using @react-pdf/renderer with Noto Sans Devanagari
      const pdfBuffer = await renderInvoicePdf({
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
          gstin: billing.gstin,
          stateCode: billing.state_code,
          address: billing.address,
        },
        taxablePaise: Number(invoice.taxable_paise),
        cgstPaise: Number(invoice.cgst_paise),
        sgstPaise: Number(invoice.sgst_paise),
        igstPaise: Number(invoice.igst_paise),
        totalPaise: Number(invoice.total_paise),
        description: invoiceKind === 'credit_note' ? 'Reversal / Credit Note' : 'JobsClick Platform Credits / Services',
      });

      // 3. Store PDF in Supabase Storage (private bucket at invoices/{invoiceId}.pdf)
      const storagePath = `invoices/${invoice.id}.pdf`;
      const { error: uploadErr } = await this.supabase.storage
        .from('private')
        .upload(storagePath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadErr) {
        captureException(new Error(`Invoice PDF storage upload failed: ${uploadErr.message}`));
      }

      // 4. Send email via Resend if email is provided (body has NO phone number)
      let emailedAt: string | null = null;
      if (billing.email) {
        const emailRes = await this.emailService.sendInvoiceEmail({
          to: billing.email,
          invoiceNumber: invoice.number,
          kind: invoiceKind,
          totalInr: Number(invoice.total_paise) / 100,
          pdfBuffer,
        });
        if (emailRes.success) {
          emailedAt = new Date().toISOString();
        }
      }

      // 5. Update invoice record with pdf_path and emailed_at
      await this.supabase
        .from('invoices')
        .update({
          pdf_path: storagePath,
          emailed_at: emailedAt,
        })
        .eq('id', invoice.id);

      // 6. Mark outbox entry done via atomic RPC
      await (this.supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: { message: string } | null }>)(
        'rpc_complete_outbox',
        {
          p_id: entry.id,
          p_attempts: entry.attempts + 1,
          p_done: true,
        },
      );

      return true;
    } catch (err) {
      const newAttempts = entry.attempts + 1;
      await (this.supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: { message: string } | null }>)(
        'rpc_complete_outbox',
        {
          p_id: entry.id,
          p_attempts: newAttempts,
          p_done: false,
        },
      );

      if (newAttempts >= 5) {
        captureMessage(
          `Alert: Invoice outbox entry ${entry.id} failed after 5 attempts for payment ${entry.payment_id}`,
          'error',
        );
      }

      captureException(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
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
    const { data } = await (supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: OutboxEntry[] | null; error: { message: string } | null }>)(
      'rpc_claim_outbox_batch',
      { p_limit: 100 },
    );

    const match = (data || []).find((item) => item.id === job.data.outboxId);
    if (match) {
      const ok = await service.processOutboxEntry(match);
      return { processed: 1, succeeded: ok ? 1 : 0, failed: ok ? 0 : 1 };
    }
  }

  // Batch process pending entries using FOR UPDATE SKIP LOCKED
  const limit = job.data.batchLimit ?? 10;
  const { data: pending } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: OutboxEntry[] | null; error: { message: string } | null }>)(
    'rpc_claim_outbox_batch',
    { p_limit: limit },
  );

  let succeeded = 0;
  let failed = 0;

  for (const entry of pending || []) {
    const ok = await service.processOutboxEntry(entry);
    if (ok) succeeded++;
    else failed++;
  }

  await service.checkStuckOutboxEntries();

  return {
    processed: (pending || []).length,
    succeeded,
    failed,
  };
}
