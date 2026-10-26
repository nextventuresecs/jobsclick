const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(process.cwd(), 'supabase/migrations');
const destDir = path.resolve(process.cwd(), 'packages/database/supabase/migrations');

if (!fs.existsSync(srcDir)) {
  console.error(`Source directory not found: ${srcDir}`);
  process.exit(1);
}

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

let syncCount = 0;
for (const file of fs.readdirSync(srcDir)) {
  if (!file.endsWith('.sql')) continue;
  const srcFile = path.join(srcDir, file);
  const destFile = path.join(destDir, file);

  const srcContent = fs.readFileSync(srcFile, 'utf8');
  let destContent = '';
  if (fs.existsSync(destFile)) {
    destContent = fs.readFileSync(destFile, 'utf8');
  }

  if (srcContent !== destContent) {
    fs.writeFileSync(destFile, srcContent, 'utf8');
    syncCount++;
  }
}

console.log(`[sync:migrations] Synced ${syncCount} migration files between supabase/migrations and packages/database/supabase/migrations.`);
