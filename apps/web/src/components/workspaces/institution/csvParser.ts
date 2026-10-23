import type { ParsedRow } from './BulkUploadModal';

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCsvContent(rawCsvText: string): { rows: ParsedRow[]; error?: string } {
  const lines = rawCsvText.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { rows: [], error: 'CSV file must have at least one data row.' };
  }

  const rows: ParsedRow[] = lines.slice(1).map((line, idx) => {
    const parts = parseCsvLine(line);
    const studentName = parts[0]?.trim() ?? '';
    const rollNumber = parts[1]?.trim() ?? '';
    const phone = parts[2]?.trim().replace(/\D/g, '') ?? '';
    const stream = parts[3]?.trim() ?? '';
    const passingYear = parts[4]?.trim() ?? '';

    const errors: string[] = [];
    if (!studentName) errors.push('Missing Student Name');
    if (!rollNumber) errors.push('Missing Roll Number');
    if (!phone || phone.length !== 10 || !/^[6-9]\d{9}$/.test(phone)) {
      errors.push('Invalid 10-digit Indian mobile number');
    }

    return {
      rowNumber: idx + 2,
      studentName,
      rollNumber,
      phone,
      stream: stream || 'Vocational General',
      passingYear: passingYear || '2026',
      isValid: errors.length === 0,
      errors,
    };
  });

  return { rows };
}

export function downloadCsvTemplate(rawCsvText: string) {
  const blob = new Blob([rawCsvText], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'JobsClick_Student_Import_Template.csv';
  a.click();
  URL.revokeObjectURL(url);
}
