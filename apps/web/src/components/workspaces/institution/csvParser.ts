import type { ParsedRow } from './BulkUploadModal';
import { parseSharedCsv, normalizeIndianPhone } from '@indian-job-portal/validation';

export function parseCsvContent(rawCsvText: string): { rows: ParsedRow[]; error?: string } {
  let records: Array<Record<string, string>> = [];
  try {
    records = parseSharedCsv(rawCsvText);
  } catch (err) {
    return { rows: [], error: `Invalid CSV format: ${(err as Error).message}` };
  }

  if (records.length === 0) {
    return { rows: [], error: 'CSV file must have at least one valid data row with headers.' };
  }

  const rows: ParsedRow[] = records.map((record, idx) => {
    const studentName =
      (record['Student Name'] || record['student_name'] || record['name'] || record['Name'] || '').trim();
    const rollNumber =
      (record['Roll Number'] || record['roll_number'] || record['rollNo'] || record['RollNo'] || '').trim();
    const rawPhone =
      (record['Phone'] || record['phone'] || record['mobile'] || record['Mobile'] || '').trim();
    const phone = normalizeIndianPhone(rawPhone) || rawPhone.replace(/\D/g, '');
    const stream =
      (record['Stream'] || record['stream'] || record['trade'] || record['Trade'] || '').trim();
    const passingYear =
      (record['Passing Year'] || record['passing_year'] || record['year'] || record['Year'] || '').trim();

    const errors: string[] = [];
    if (!studentName) errors.push('Missing Student Name');
    if (!rollNumber) errors.push('Missing Roll Number');
    if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
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

export function parseCsvLine(line: string): string[] {
  try {
    const parsed = parseSharedCsv(`header\n${line}`);
    if (parsed.length > 0) {
      return Object.values(parsed[0]!);
    }
  } catch {
    // Fallback
  }
  return line.split(',').map((s) => s.trim());
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
