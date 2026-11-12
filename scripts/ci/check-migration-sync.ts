import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function hashFile(filepath: string): string {
  const content = fs.readFileSync(filepath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function checkMigrationSync(): { success: boolean; errors: string[] } {
  const rootDir = process.cwd();
  const dir1 = path.resolve(rootDir, 'supabase/migrations');
  const dir2 = path.resolve(rootDir, 'packages/database/supabase/migrations');

  const errors: string[] = [];

  if (!fs.existsSync(dir1)) {
    errors.push(`Directory does not exist: ${dir1}`);
    return { success: false, errors };
  }
  if (!fs.existsSync(dir2)) {
    errors.push(`Directory does not exist: ${dir2}`);
    return { success: false, errors };
  }

  const files1 = fs.readdirSync(dir1).filter((f) => f.endsWith('.sql')).sort();
  const files2 = fs.readdirSync(dir2).filter((f) => f.endsWith('.sql')).sort();

  const set1 = new Set(files1);
  const set2 = new Set(files2);

  for (const f of files1) {
    if (!set2.has(f)) {
      errors.push(`File missing in packages/database/supabase/migrations: ${f}`);
    }
  }

  for (const f of files2) {
    if (!set1.has(f)) {
      errors.push(`Extra file in packages/database/supabase/migrations not in supabase/migrations: ${f}`);
    }
  }

  for (const f of files1) {
    if (set2.has(f)) {
      const p1 = path.join(dir1, f);
      const p2 = path.join(dir2, f);
      const b1 = fs.readFileSync(p1);
      const b2 = fs.readFileSync(p2);
      if (!b1.equals(b2)) {
        errors.push(
          `Byte mismatch in migration ${f}:\n  supabase/migrations SHA256: ${hashFile(p1)}\n  packages/database SHA256: ${hashFile(p2)}`
        );
      }
    }
  }

  return { success: errors.length === 0, errors };
}

// When executed directly
if (process.argv[1]?.includes('check-migration-sync')) {
  const result = checkMigrationSync();
  if (result.success) {
    console.log('[check-migration-sync] SUCCESS: supabase/migrations and packages/database/supabase/migrations are byte-identical.');
    process.exit(0);
  } else {
    console.error('[check-migration-sync] FAILED: Migration directories drifted:');
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
}
