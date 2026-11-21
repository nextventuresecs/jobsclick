import { parse as parseCsvSync } from 'csv-parse/sync';

export interface CsvParseOptions {
  readonly relaxColumnCount?: boolean;
  readonly trim?: boolean;
}

/**
 * Shared RFC-4180 compliant CSV parser using csv-parse/sync.
 * Handles:
 * - \r\n (CRLF) and \n (LF) line endings cleanly
 * - Multiline quoted fields (e.g., addresses or notes with embedded newlines)
 * - Escaped quotes ("")
 * - UTF-8 Byte Order Mark (BOM)
 */
export function parseSharedCsv(
  csvText: string,
  options?: CsvParseOptions,
): Array<Record<string, string>> {
  if (!csvText || typeof csvText !== 'string' || !csvText.trim()) {
    return [];
  }

  try {
    return parseCsvSync(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: options?.trim ?? true,
      bom: true,
      relax_column_count: options?.relaxColumnCount ?? true,
    }) as Array<Record<string, string>>;
  } catch (err) {
    throw new Error(`CSV parse error: ${(err as Error).message}`);
  }
}
