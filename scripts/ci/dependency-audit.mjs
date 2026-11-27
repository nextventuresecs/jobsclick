import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BLOCKED_SEVERITIES = new Set(['high', 'critical']);

export function evaluateAuditReport(reportJson, allowlist = {}) {
  if (!reportJson || typeof reportJson !== 'object' || reportJson.error || !reportJson.advisories || typeof reportJson.advisories !== 'object') {
    const errorMsg = reportJson?.error?.summary || reportJson?.error?.code || 'missing advisories map';
    throw new Error(`Invalid pnpm audit report: ${errorMsg}`);
  }

  const advisories = Object.values(reportJson.advisories);
  const unwaived = [];
  const waived = [];

  for (const advisory of advisories) {
    const severity = String(advisory.severity || '').toLowerCase();
    if (!BLOCKED_SEVERITIES.has(severity)) continue;

    const id = advisory.github_advisory_id || String(advisory.id);
    const entry = {
      id,
      package: advisory.module_name || 'unknown',
      severity,
      title: advisory.title || '',
    };

    if (Object.prototype.hasOwnProperty.call(allowlist, id)) {
      waived.push(entry);
    } else {
      unwaived.push(entry);
    }
  }

  return { unwaived, waived };
}

export function runDependencyAudit(cwd = process.cwd(), allowlistPath = path.join(cwd, 'scripts/ci/audit-allowlist.json')) {
  const rawAllowlist = fs.existsSync(allowlistPath)
    ? JSON.parse(fs.readFileSync(allowlistPath, 'utf8')).allowlistedAdvisories ?? {}
    : {};

  const result = spawnSync('pnpm audit --prod --json', {
    cwd,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (!result.stdout || !result.stdout.trim()) {
    throw new Error(`pnpm audit produced empty output (exit=${result.status}): ${result.stderr || 'no stderr'}`);
  }

  const parsed = JSON.parse(result.stdout);
  const { unwaived, waived } = evaluateAuditReport(parsed, rawAllowlist);

  console.log(`[Dependency Audit] Evaluated production advisories: ${waived.length} waived, ${unwaived.length} unwaived (high/critical)`);
  if (unwaived.length > 0) {
    console.error('[Dependency Audit] Unwaived high/critical advisories detected:');
    for (const item of unwaived) {
      console.error(`  - ${item.id} (${item.severity}) in ${item.package}: ${item.title}`);
    }
    process.exitCode = 1;
  }
  return { unwaived, waived };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runDependencyAudit();
}
