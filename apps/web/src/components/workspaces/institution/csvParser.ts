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

  const headerParts = parseCsvLine(lines[0] || '').map((h) =>
    h.toLowerCase().trim().replace(/[\s_-]+/g, ''),
  );

  const emailIdx = headerParts.findIndex((h) => h === 'email' || h === 'emailid' || h === 'mail');
  const phoneIdx = headerParts.findIndex(
    (h) =>
      h === 'phone' ||
      h === 'mobile' ||
      h === 'phonenumber' ||
      h === 'contact' ||
      h === 'mobileno' ||
      h === 'phoneno',
  );
  const nameIdx = headerParts.findIndex(
    (h) => h === 'studentname' || h === 'name' || h === 'fullname',
  );
  const rollIdx = headerParts.findIndex(
    (h) => h === 'rollnumber' || h === 'roll' || h === 'rollno',
  );
  const streamIdx = headerParts.findIndex(
    (h) => h === 'stream' || h === 'branch' || h === 'course',
  );
  const yearIdx = headerParts.findIndex(
    (h) => h === 'passingyear' || h === 'year' || h === 'batch',
  );

  const isExplicitHeader = emailIdx !== -1 || phoneIdx !== -1 || nameIdx !== -1;

  const rows: ParsedRow[] = lines.slice(1).map((line, idx) => {
    const parts = parseCsvLine(line);

    const studentName = (
      (isExplicitHeader && nameIdx !== -1 ? parts[nameIdx] : parts[0]) ?? ''
    ).trim();

    const rollNumber = (
      (isExplicitHeader && rollIdx !== -1 ? parts[rollIdx] : isExplicitHeader ? '' : parts[1]) ?? ''
    ).trim();

    const rawPhone = (
      (isExplicitHeader && phoneIdx !== -1 ? parts[phoneIdx] : isExplicitHeader ? '' : parts[2]) ?? ''
    ).trim();

    const rawEmail = ((isExplicitHeader && emailIdx !== -1 ? parts[emailIdx] : '') ?? '').trim();

    const stream = (
      (isExplicitHeader && streamIdx !== -1 ? parts[streamIdx] : isExplicitHeader ? '' : parts[3]) ??
      ''
    ).trim();

    const passingYear = (
      (isExplicitHeader && yearIdx !== -1 ? parts[yearIdx] : isExplicitHeader ? '' : parts[4]) ?? ''
    ).trim();

    const cleanPhone = rawPhone.replace(/\D/g, '');
    const isValidPhone = cleanPhone.length === 10 && /^[6-9]\d{9}$/.test(cleanPhone);
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail.toLowerCase());

    const errors: string[] = [];

    if (rawEmail && !isValidEmail) {
      errors.push('Invalid email address');
    }
    if (rawPhone && !isValidPhone) {
      errors.push('Invalid 10-digit Indian mobile number');
    }
    if (!isValidEmail && !isValidPhone) {
      if (errors.length === 0) {
        errors.push('Must provide either a valid email or a 10-digit Indian mobile number');
      }
    }

    return {
      rowNumber: idx + 2,
      studentName: studentName || (rawEmail ? rawEmail.split('@')[0]! : 'Enrolled Student'),
      rollNumber: rollNumber || `ROLL-${idx + 1}`,
      phone: cleanPhone || '',
      email: rawEmail || undefined,
      stream: stream || 'Vocational General',
      passingYear: passingYear || '2026',
      isValid: errors.length === 0,
      errors,
    };
  });

  return { rows };
}

export function downloadCsvTemplate() {
  const content = 'email,phone,student_name,roll_number,stream,passing_year\n';
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'JobsClick_Student_Import_Template.csv';
  a.click();
  URL.revokeObjectURL(url);
}
