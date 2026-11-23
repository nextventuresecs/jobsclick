import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { readSheet } from 'read-excel-file/node';
import { Parser } from 'saxen';
import { fromBufferPromise } from 'yauzl';

const MAX_EXPANDED_BYTES = 48 * 1024 * 1024;
const MAX_ENTRIES = 128;
const MAX_ROWS = 50_001;
const MAX_COLUMNS = 128;
const MAX_CELLS = 1_000_000;

function checkWorksheetBounds(xml: string): void {
  const parser = new Parser();
  let inSheet = false;
  let rows = 0;
  let cells = 0;
  parser.on('error', (error) => { throw error; });
  parser.on('openTag', (tag, attrs, decode) => {
    const name = tag.split(':').at(-1);
    if (name === 'sheetData') inSheet = true;
    if (!inSheet || (name !== 'c' && name !== 'row')) return;
    const ref = decode(attrs().r ?? '');
    if (name === 'row') {
      if (++rows > MAX_ROWS || (ref && (!/^\d+$/.test(ref) || Number(ref) > MAX_ROWS))) {
        throw new PayloadTooLargeException({ code: 'BULK_UPLOAD_LIMIT' });
      }
    } else {
      const address = /^([A-Z]{1,3})(\d+)$/i.exec(ref);
      if (!address) throw new BadRequestException({ code: 'BULK_XLSX_INVALID' });
      const column = [...address[1]!.toUpperCase()].reduce((number, char) => number * 26 + char.charCodeAt(0) - 64, 0);
      if (++cells > MAX_CELLS || column > MAX_COLUMNS || Number(address[2]) > MAX_ROWS) {
        throw new PayloadTooLargeException({ code: 'BULK_UPLOAD_LIMIT' });
      }
    }
  });
  parser.parse(xml);
}

export async function xlsxRosterToCsv(file: Buffer): Promise<string> {
  try {
    const archive = await fromBufferPromise(file, { lazyEntries: true, validateEntrySizes: true });
    try {
      if (archive.entryCount > MAX_ENTRIES) throw new PayloadTooLargeException({ code: 'BULK_UPLOAD_LIMIT' });
      let expandedBytes = 0;
      const names = new Set<string>();
      for await (const entry of archive.eachEntry()) {
        if (names.has(entry.fileName)) throw new BadRequestException({ code: 'BULK_XLSX_INVALID' });
        names.add(entry.fileName);
        if (entry.uncompressedSize > MAX_EXPANDED_BYTES - expandedBytes) {
          throw new PayloadTooLargeException({ code: 'BULK_UPLOAD_LIMIT' });
        }
        if (entry.fileName.endsWith('/')) continue;
        // Validate actual expansion before passing the same archive to the Excel reader.
        const stream = await archive.openReadStreamPromise(entry);
        const chunks: Buffer[] = [];
        for await (const data of stream) {
          const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
          expandedBytes += chunk.length;
          if (expandedBytes > MAX_EXPANDED_BYTES) {
            throw new PayloadTooLargeException({ code: 'BULK_UPLOAD_LIMIT' });
          }
          chunks.push(chunk);
        }
        const content = Buffer.concat(chunks);
        const text = content.toString('utf8');
        if (text.trimStart().startsWith('<') && text.includes('sheetData')) checkWorksheetBounds(text);
      }
    } finally {
      archive.close();
    }

    const rows = await readSheet(file, 1, { parseNumber: (value) => value });
    if (rows.length > MAX_ROWS || rows.some((row) => row.length > MAX_COLUMNS)) {
      throw new PayloadTooLargeException({ code: 'BULK_UPLOAD_LIMIT' });
    }
    const csv = rows.map((row) => row.map((cell) => {
      const value = cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell ?? '');
      return `"${value.replaceAll('"', '""')}"`;
    }).join(',')).join('\n');
    if (Buffer.byteLength(csv) > 16 * 1024 * 1024) {
      throw new PayloadTooLargeException({ code: 'BULK_UPLOAD_LIMIT' });
    }
    return csv;
  } catch (error) {
    if (error instanceof BadRequestException || error instanceof PayloadTooLargeException) throw error;
    throw new BadRequestException({ code: 'BULK_XLSX_INVALID' });
  }
}
