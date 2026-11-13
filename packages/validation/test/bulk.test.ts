import { describe, it, expect } from 'vitest';
import { bulkUploadSchema, inviteWaveSchema } from '../src/bulk.js';
import { parseSharedCsv } from '../src/csv.js';

describe('Bulk Onboarding Schemas - Epic 4', () => {
  it('validates bulkUploadSchema', () => {
    const valid = bulkUploadSchema.parse({
      source: 'MSME Department MP',
      entityType: 'employer',
    });
    expect(valid.source).toBe('MSME Department MP');
    expect(valid.entityType).toBe('employer');
  });

  it('validates inviteWaveSchema', () => {
    const valid = inviteWaveSchema.parse({
      batchId: 'batch_100',
      waveSize: 5000,
      costPerSmsInr: 0.25,
    });
    expect(valid.waveSize).toBe(5000);
    expect(valid.costPerSmsInr).toBe(0.25);
  });

  describe('parseSharedCsv RFC-4180 parser', () => {
    it('handles CRLF (\\r\\n) and LF (\\n) line endings seamlessly', () => {
      const crlfCsv = 'name,phone\r\nKaran,9876543210\r\nRavi,9876543211\r\n';
      const records = parseSharedCsv(crlfCsv);
      expect(records).toHaveLength(2);
      expect(records[0]!['name']).toBe('Karan');
      expect(records[0]!['phone']).toBe('9876543210');
      expect(records[1]!['name']).toBe('Ravi');
      expect(records[1]!['phone']).toBe('9876543211');
    });

    it('handles multiline quoted fields and escaped quotes without breaking', () => {
      const multilineCsv =
        'company_name,address,phone\n' +
        '"Shree Ganesh Textiles","Plot 14, Sector C\nIndustrial Area\nIndore",9876543210\n' +
        '"Malwa ""Agro"" Pvt Ltd","Sanwer Road",9876543211\n';

      const records = parseSharedCsv(multilineCsv);
      expect(records).toHaveLength(2);
      expect(records[0]!['company_name']).toBe('Shree Ganesh Textiles');
      expect(records[0]!['address']).toContain('Plot 14, Sector C\nIndustrial Area\nIndore');
      expect(records[0]!['phone']).toBe('9876543210');
      expect(records[1]!['company_name']).toBe('Malwa "Agro" Pvt Ltd');
    });

    it('returns empty array on empty or whitespace inputs', () => {
      expect(parseSharedCsv('')).toEqual([]);
      expect(parseSharedCsv('   \n\n  ')).toEqual([]);
    });
  });
});
