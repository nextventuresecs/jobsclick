import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Architecture Test: No Database or Public ID is Composed in Application Code
 *
 * GOAL: No database or public id is ever derived from a phone, email, timestamp,
 * or random number in application code. IDs must come from the database (gen_random_uuid())
 * or from an external provider.
 *
 * Rules:
 * - Scans apps/api/src and apps/worker/src
 * - Fails on /\b(usr|seeker_usr|job|app|cld|pay|batch|camp)_\$\{/
 * - Fails on Date.now() appearing inside an id-building expression
 * - Allow-list nothing silently: any exception requires an explicit comment naming the reason.
 */

// Allow-list for legitimate non-ID occurrences of Date.now().
// Every single entry must state its exact purpose and justification.
const ALLOWED_DATE_NOW_FILES: Record<string, { reason: string; allowedLines: (line: string) => boolean }> = {
  // apps/worker/src/pdf/pdf-generator.ts: timing generation performance and cache TTL
  'apps/worker/src/pdf/pdf-generator.ts': {
    reason: 'Performance duration measurement (Date.now() - startTime) and cache timestamp TTL',
    allowedLines: (line: string) =>
      line.includes('Date.now() - startTime') ||
      line.includes('const startTime = Date.now()') ||
      line.includes('cachedAt: Date.now()'),
  },
  // apps/worker/src/processors/alerts.processor.ts: sliding window timeframe calculations
  'apps/worker/src/processors/alerts.processor.ts': {
    reason: 'Sliding window cutoff timestamp calculation for search alerts query filter',
    allowedLines: (line: string) =>
      line.includes('Date.now() - timeframeHours') ||
      line.includes('cutoff'),
  },
  // apps/worker/src/processors/pdf.processor.ts: document update timestamp
  'apps/worker/src/processors/pdf.processor.ts': {
    reason: 'Document updatedAt ISO timestamp tracking',
    allowedLines: (line: string) => line.includes('updatedAt: data.updatedAt || Date.now()'),
  },
  // apps/api/src/auth/jwt.service.ts: JWT standard iat/nbf epoch seconds
  'apps/api/src/auth/jwt.service.ts': {
    reason: 'Standard JWT epoch second calculation (iat / nbf claims)',
    allowedLines: (line: string) => line.includes('Math.floor(Date.now() / 1000)'),
  },
  // apps/api/src/auth/auth.service.ts: token revocation timestamp
  'apps/api/src/auth/auth.service.ts': {
    reason: 'Epoch timestamp for token revocation invalidation check',
    allowedLines: (line: string) => line.includes('setRevokedTimestamp(userId, Date.now())'),
  },
  // apps/api/src/auth/otp-redis.service.ts: Redis sliding window sorted set score
  'apps/api/src/auth/otp-redis.service.ts': {
    reason: 'Sorted set epoch millisecond score for IP sliding window rate limit',
    allowedLines: (line: string) => line.includes('const now = Date.now()') || line.includes('now - 3600'),
  },
  // apps/api/src/jobs/jobs.service.ts: expiration check for featured jobs
  'apps/api/src/jobs/jobs.service.ts': {
    reason: 'Epoch comparison for featured_until expiration',
    allowedLines: (line: string) => line.includes('new Date(row.featured_until).getTime() > Date.now()'),
  },
  // apps/api/src/wallet/sponsorship.service.ts: expiration check for sponsorships
  'apps/api/src/wallet/sponsorship.service.ts': {
    reason: 'Epoch comparison for sponsorship_expires_at expiration',
    allowedLines: (line: string) => line.includes('getTime() > Date.now()'),
  },
  // apps/api/src/bulk/bulk.service.ts: unique timestamped storage upload filename (not an entity ID)
  'apps/api/src/bulk/bulk.service.ts': {
    reason: 'Storage upload filename prefix for uniqueness in S3/Supabase storage',
    allowedLines: (line: string) => line.includes('safeName = `${Date.now()}_${fileName'),
  },
};

function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') && !entry.name.endsWith('.test.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

const COMPOSED_PREFIX_REGEX = /\b(usr|seeker_usr|job|app|cld|pay|batch|camp)_\$\{/;

// Detects Date.now() used to construct an identifier
const ID_BUILDING_DATE_NOW_REGEX = /(?:id|Id|ID)\s*[:=]\s*`[^`]*Date\.now\(\)[^`]*`|(?:id|Id|ID)\s*[:=]\s*.*Date\.now\(\)|`[^`]*(?:usr|seeker_usr|job|app|cld|pay|batch|camp|tieup|wave|inq|order|rcpt|msg|emp)[^`]*\$\{.*Date\.now\(\)[^`]*`/;

describe('Architecture: No Composed or Derived IDs in Application Code', () => {
  const repoRoot = path.resolve(__dirname, '../../..');
  const targetDirs = [
    path.join(repoRoot, 'apps/api/src'),
    path.join(repoRoot, 'apps/worker/src'),
  ];

  const files = targetDirs.flatMap((dir) => getAllTsFiles(dir));

  it('scans all source files and fails on forbidden composed ID prefixes', () => {
    const violations: Array<{ file: string; line: number; text: string }> = [];

    for (const filePath of files) {
      const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        if (COMPOSED_PREFIX_REGEX.test(line)) {
          violations.push({
            file: relPath,
            line: index + 1,
            text: line.trim(),
          });
        }
      });
    }

    expect(
      violations,
      `Found ${violations.length} composed ID violation(s) matching /\\b(usr|seeker_usr|job|app|cld|pay|batch|camp)_\\$\\{/:\n` +
        violations.map((v) => `  ${v.file}:${v.line} -> ${v.text}`).join('\n'),
    ).toHaveLength(0);
  });

  it('scans all source files and fails on Date.now() inside an ID-building expression', () => {
    const violations: Array<{ file: string; line: number; text: string }> = [];

    for (const filePath of files) {
      const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        if (!line.includes('Date.now()')) return;

        // Check if file is in allow-list with explicit justified exception
        const allowEntry = ALLOWED_DATE_NOW_FILES[relPath];
        if (allowEntry && allowEntry.allowedLines(line)) {
          return;
        }

        // Check if Date.now() is being used in an ID-building expression
        if (
          ID_BUILDING_DATE_NOW_REGEX.test(line) ||
          line.includes('`pay_${Date.now()}`') ||
          line.includes('`batch_${Date.now()') ||
          line.includes('`campaign_${Date.now()') ||
          line.includes('`wave_${Date.now()') ||
          line.includes('`tieup-${Date.now()') ||
          line.includes('`emp-${Date.now()') ||
          line.includes('`app-pl-${Date.now()') ||
          line.includes('`inq_${Date.now()') ||
          line.includes('`order_${Date.now()') ||
          line.includes('`mock_${Date.now()')
        ) {
          violations.push({
            file: relPath,
            line: index + 1,
            text: line.trim(),
          });
        }
      });
    }

    expect(
      violations,
      `Found ${violations.length} Date.now() ID-building violation(s):\n` +
        violations.map((v) => `  ${v.file}:${v.line} -> ${v.text}`).join('\n'),
    ).toHaveLength(0);
  });

  it('verification: negative control confirms test catches composed IDs and Date.now() ID construction', () => {
    const sampleComposedId = 'const batchId = `batch_${Date.now()}_${Math.random()}`;';
    expect(COMPOSED_PREFIX_REGEX.test(sampleComposedId)).toBe(true);

    const samplePayId = 'const paymentId = paymentEntity["id"] || `pay_${Date.now()}`;';
    expect(COMPOSED_PREFIX_REGEX.test(samplePayId)).toBe(true);
    expect(ID_BUILDING_DATE_NOW_REGEX.test(samplePayId) || samplePayId.includes('`pay_${Date.now()}`')).toBe(true);

    const sampleUsrId = 'const usrId = `usr_${randomId}`;';
    expect(COMPOSED_PREFIX_REGEX.test(sampleUsrId)).toBe(true);

    const sampleJobId = 'const jobId = `job_${uuid}`;';
    expect(COMPOSED_PREFIX_REGEX.test(sampleJobId)).toBe(true);
  });
});
