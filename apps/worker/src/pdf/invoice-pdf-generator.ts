import { renderToBuffer } from '@react-pdf/renderer';
import { InvoicePdfTemplate, type InvoicePdfProps } from './templates/InvoicePdfTemplate.js';
import { ensureDevanagariFontsRegistered } from './pdf-generator.js';

export async function renderInvoicePdf(props: InvoicePdfProps): Promise<Buffer> {
  ensureDevanagariFontsRegistered();
  const doc = InvoicePdfTemplate(props);
  return renderToBuffer(doc);
}
