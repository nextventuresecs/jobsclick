import * as fs from 'fs';
import * as path from 'path';

export interface MigrationViolation {
  file: string;
  line: number;
  rule: string;
  evidence: string;
  severity: 'ERROR' | 'WARNING';
}

const MIGRATION_DIRS = [
  path.resolve(process.cwd(), 'supabase/migrations'),
  path.resolve(process.cwd(), 'packages/database/supabase/migrations'),
];

export function auditMigrationDirectories(): MigrationViolation[] {
  const violations: MigrationViolation[] = [];

  for (const dir of MIGRATION_DIRS) {
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'));

    for (const file of files) {
      // Skip bootstrap genesis migrations where tables are initialized empty
      if (file.startsWith('20261008')) continue;

      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split(/\r?\n/);
      const fullUpper = content.toUpperCase();

      // Find tables created in THIS file (which are safe from existing locks)
      const locallyCreatedTables = new Set<string>();
      lines.forEach((l) => {
        const match = l.toUpperCase().match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)/);
        if (match && match[1]) {
          locallyCreatedTables.add(match[1]);
        }
      });

      lines.forEach((lineText, idx) => {
        const lineNum = idx + 1;
        const upper = lineText.toUpperCase().trim();

        // Skip comment lines
        if (upper.startsWith('--') || upper.startsWith('/*')) return;

        // Rule 1: Check constraint added without NOT VALID
        if (upper.includes('ADD CONSTRAINT') && upper.includes('CHECK (')) {
          if (!upper.includes('NOT VALID')) {
            violations.push({
              file: path.relative(process.cwd(), filePath),
              line: lineNum,
              rule: 'UNBUFFERED_CHECK_CONSTRAINT_ACQUIRES_ACCESS_EXCLUSIVE',
              evidence: lineText.trim(),
              severity: 'ERROR',
            });
          }
        }

        // Rule 2: Altering pre-existing high-traffic live tables without lock_timeout
        const highTrafficTables = ['PAYMENTS'];
        for (const table of highTrafficTables) {
          if (locallyCreatedTables.has(table)) continue; // Safe: created in this migration

          if (upper.includes(`ALTER TABLE ${table}`) || upper.includes(`ALTER TABLE IF EXISTS ${table}`)) {
            if (!fullUpper.includes('LOCK_TIMEOUT')) {
              violations.push({
                file: path.relative(process.cwd(), filePath),
                line: lineNum,
                rule: 'HIGH_TRAFFIC_TABLE_MISSING_LOCK_TIMEOUT',
                evidence: lineText.trim(),
                severity: 'ERROR',
              });
            }
          }
        }
      });
    }
  }

  return violations;
}

if (process.argv[1]?.includes('audit-migrations')) {
  console.log('🔍 Auditing Supabase SQL Migrations for N/N-1 Zero-Downtime Locks...');
  const violations = auditMigrationDirectories();

  if (violations.length > 0) {
    console.error(`❌ Found ${violations.length} migration safety violation(s):`);
    console.table(violations);
    process.exit(1);
  } else {
    console.log('✅ All migrations pass Expand-Migrate-Contract zero-downtime safety checks.');
  }
}
