/**
 * Module 4 Attacker Verification Suite Runner
 *
 * Runs all 14 attack vectors against real Postgres catalog, RLS, functions,
 * and NestJS API endpoints with authoritative payment verification.
 *
 * Exits with code 0 if all 14 vectors fail to gain unearned value.
 * Exits with non-zero code if any attack vector succeeds in obtaining unearned value.
 */

import { spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

function main() {
  console.log('======================================================================');
  console.log('Starting Module 4 Attacker Security Suite (14 Attack Vectors)...');
  console.log('======================================================================\n');

  const rootDir = process.cwd();
  const logPath = path.resolve(rootDir, 'docs/audits/evidence/module-4/attacker-run.log');

  // Execute vitest on attack-suite.spec.ts inside apps/api workspace
  const isWindows = process.platform === 'win32';
  const pnpmCmd = isWindows ? 'pnpm.cmd' : 'pnpm';

  const res = spawnSync(
    pnpmCmd,
    ['--filter', '@indian-job-portal/api', 'test', 'attack-suite.spec.ts'],
    {
      cwd: rootDir,
      stdio: 'inherit',
      shell: isWindows,
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    },
  );

  if (res.status !== 0) {
    console.error('\n❌ Attacker suite execution failed or detected a security breach!');
    process.exit(res.status ?? 1);
  }

  if (!fs.existsSync(logPath)) {
    console.error(`\n❌ Expected attacker run log not found at ${logPath}`);
    process.exit(1);
  }

  const logContent = fs.readFileSync(logPath, 'utf8');
  if (logContent.includes('FAIL') || !logContent.includes('Summary: 14/14 Vectors Passed, 0 Failed.')) {
    console.error('\n❌ Attacker run log indicates failed assertions or unearned grants.');
    process.exit(1);
  }

  console.log('\n✅ All 14 attack vectors verified blocked with zero unearned value.');
  process.exit(0);
}

main();
