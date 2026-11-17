import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// A fresh drill must use real GoTrue/platform schemas, never a hand-built auth stub.
export async function drillFreshDatabase(customMasterConn?: string): Promise<void> {
  if (customMasterConn) throw new Error('DISPOSABLE_TEST_TARGET_REQUIRED');
  const runner = fileURLToPath(new URL('./testing/run-disposable.cjs', import.meta.url));
  const result = spawnSync(process.execPath, [runner, '--auth-contracts', 'packages/database/test'], { stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) throw new Error('DISPOSABLE_DATABASE_DRILL_FAILED');
}

if (process.argv[1]?.endsWith('drill-fresh-database.ts')) {
  drillFreshDatabase().catch(error => { console.error(error.message); process.exitCode = 1; });
}
