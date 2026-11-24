const fs = require('node:fs');
const path = require('node:path');

const rootDir = process.cwd();
const canonicalDir = path.join(rootDir, 'supabase', 'migrations');
const duplicateDir = path.join(rootDir, 'packages', 'database', 'supabase', 'migrations');

if (!fs.existsSync(canonicalDir)) {
  console.error(`FAIL: Canonical migration directory not found at ${canonicalDir}`);
  process.exit(1);
}

if (fs.existsSync(duplicateDir)) {
  const stat = fs.lstatSync(duplicateDir);
  if (!stat.isSymbolicLink()) {
    console.error(`FAIL: Duplicate migration directory detected at ${duplicateDir}.`);
    console.error('Canonical migrations must only reside in supabase/migrations/.');
    process.exit(1);
  }
}

console.log('SUCCESS: Single migration tree verified (canonical: supabase/migrations/).');
process.exit(0);
