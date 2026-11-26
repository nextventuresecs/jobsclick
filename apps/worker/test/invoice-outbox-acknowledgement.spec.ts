import { describe, expect, it, vi } from 'vitest';
import { InvoiceOutboxService, type IssuedInvoice, type OutboxEntry } from '../src/payments/invoice-outbox.processor.js';
import { WorkerEmailService } from '../src/email/email.service.js';

vi.mock('../src/pdf/invoice-pdf-generator.js', () => ({
  renderInvoicePdf: async () => Buffer.from('fixture pdf'),
}));
vi.mock('@indian-job-portal/validation', async (importOriginal) => ({
  ...await importOriginal<typeof import('@indian-job-portal/validation')>(),
  isValidGstin: () => true,
}));

const entry: OutboxEntry = { id: 'outbox', payment_id: 'payment', kind: 'issue_invoice', attempts: 0, created_at: '' };

function fixture(overrides: Partial<IssuedInvoice> = {}) {
  const invoice = {
    id: 'invoice', number: 'JC/2026/1', kind: 'invoice', payment_id: 'payment', fy: '2026',
    total_paise: 100, issued_at: '2026-11-23T00:00:00Z', pdf_path: null, emailed_at: null,
    billing_snapshot: { email: 'billing@example.test' }, ...overrides,
  };
  const upload = vi.fn().mockResolvedValue({ error: null, data: { path: 'invoices/invoice.pdf' } });
  const persist = vi.fn().mockResolvedValue({ error: null, data: { id: 'invoice' } });
  const finish = vi.fn().mockResolvedValue({ error: null });
  const email = new WorkerEmailService();
  const send = vi.spyOn(email, 'sendInvoiceEmail').mockResolvedValue({ success: true, messageId: 'provider-id' });
  const supabase = {
    rpc: (name: string, args: object) => {
      if (name === 'rpc_issue_invoice') return Promise.resolve({ data: invoice, error: null });
      if (name === 'rpc_complete_outbox') return finish(args);
      throw new Error('Unexpected RPC');
    },
    from: (table: string) => {
      if (table === 'platform_settings') return {
        select: () => ({ eq: () => ({ single: async () => ({ data: { value: { gstin: 'fixture' } }, error: null }) }) }),
      };
      return {
        update: (values: object) => {
          const mutation = { select: () => ({ single: () => persist(values) }) };
          return { eq: () => mutation };
        },
      };
    },
    storage: { from: () => ({
      upload,
      download: async () => ({ data: new Blob(['fixture pdf']), error: null }),
    }) },
  };
  const service = new InvoiceOutboxService(supabase as unknown as ConstructorParameters<typeof InvoiceOutboxService>[0], email);
  return { service, upload, persist, finish, send };
}

describe('Invoice outbox completion acknowledgement', () => {
  it('keeps a rejected PDF upload pending and sends no invoice email', async () => {
    const { service, upload, persist, finish, send } = fixture();
    upload.mockResolvedValue({ error: { message: 'fixture storage failure' } });
    await expect(service.processOutboxEntry(entry)).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    expect(finish.mock.calls).toEqual([[{ p_id: entry.id, p_attempts: 1, p_done: false }]]);
  });

  it('keeps an upload without a storage receipt pending', async () => {
    const { service, upload, persist, finish } = fixture();
    upload.mockResolvedValue({ error: null, data: null });
    await expect(service.processOutboxEntry(entry)).resolves.toBe(false);
    expect(persist).not.toHaveBeenCalled();
    expect(finish.mock.calls).toEqual([[{ p_id: entry.id, p_attempts: 1, p_done: false }]]);
  });

  it('keeps provider rejection pending and preserves the successful PDF checkpoint', async () => {
    const { service, persist, finish, send } = fixture();
    send.mockResolvedValue({ success: false, blocked_by_allowlist: true });
    await expect(service.processOutboxEntry(entry)).resolves.toBe(false);
    expect(persist.mock.calls).toEqual([[{ pdf_path: 'invoices/invoice.pdf' }]]);
    expect(finish.mock.calls).toEqual([[{ p_id: entry.id, p_attempts: 1, p_done: false }]]);
  });

  it('requires the PDF checkpoint write before sending email', async () => {
    const { service, persist, finish, send } = fixture();
    persist.mockResolvedValue({ error: { message: 'fixture write failure' }, data: null });
    await expect(service.processOutboxEntry(entry)).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(finish.mock.calls).toEqual([[{ p_id: entry.id, p_attempts: 1, p_done: false }]]);
  });

  it('rejects ambiguous outbox completion without recording a failure that could undo it', async () => {
    const { service, finish, send, upload } = fixture({ pdf_path: 'invoices/invoice.pdf', emailed_at: '2026-11-23T00:00:00Z' });
    finish.mockResolvedValue({ error: { message: 'fixture acknowledgement failure' } });
    await expect(service.processOutboxEntry(entry)).rejects.toThrow('INVOICE_OUTBOX_ACK_FAILED');
    expect(finish.mock.calls).toEqual([[{ p_id: entry.id, p_attempts: 1, p_done: true }]]);
    expect(send).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('checks the email receipt and records the email checkpoint before completion', async () => {
    const { service, finish, persist, send, upload } = fixture({ pdf_path: 'invoices/invoice.pdf' });
    await expect(service.processOutboxEntry(entry)).resolves.toBe(true);
    expect(upload).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'invoice-email/invoice' }));
    expect(persist.mock.calls).toEqual([[{ emailed_at: expect.any(String) }]]);
    expect(finish.mock.calls).toEqual([[{ p_id: entry.id, p_attempts: 1, p_done: true }]]);
  });

  it('reuses the existing PDF when an earlier upload succeeded before its checkpoint', async () => {
    const { service, upload, send } = fixture();
    upload.mockResolvedValue({ error: { statusCode: '409', message: 'The resource already exists' } });
    await expect(service.processOutboxEntry(entry)).resolves.toBe(true);
    expect(upload).toHaveBeenCalledWith('invoices/invoice.pdf', expect.any(Buffer), {
      contentType: 'application/pdf', upsert: false,
    });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      pdfBuffer: Buffer.from('fixture pdf'), idempotencyKey: 'invoice-email/invoice',
    }));
  });

  it('completes a stored invoice without an email destination', async () => {
    const { service, finish, send } = fixture({ billing_snapshot: {} });
    await expect(service.processOutboxEntry(entry)).resolves.toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(finish.mock.calls).toEqual([[{ p_id: entry.id, p_attempts: 1, p_done: true }]]);
  });

  it('sends the stable invoice idempotency key to Resend as an HTTP header', async () => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_API_KEY', 'fixture-provider-key');
    const fetch = vi.fn().mockResolvedValue(Response.json({ id: 'provider-id' }));
    vi.stubGlobal('fetch', fetch);
    try {
      await expect(new WorkerEmailService().sendInvoiceEmail({
        to: 'billing@example.test',
        invoiceNumber: 'JC/2026/1',
        kind: 'invoice',
        totalInr: 1,
        idempotencyKey: 'invoice-email/invoice',
      })).resolves.toEqual({ success: true, messageId: 'provider-id' });
      expect(fetch).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': 'invoice-email/invoice' }),
      }));
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});
