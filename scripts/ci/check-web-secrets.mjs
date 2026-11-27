import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_PUBLIC_IDENTIFIERS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'ADMIN_DASHBOARD_SECRET',
  'OTP_PEPPER',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'MSG91_AUTH_KEY',
  'RESEND_API_KEY',
  'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE',
];

const PRIVILEGED_ENV_ACCESS_PATTERN =
  /process\.env\.(SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|DIRECT_URL|ADMIN_DASHBOARD_SECRET|OTP_PEPPER)/;
const DB_CONNECTION_URI_PATTERN = /postgres(?:ql)?:\/\/[^\s"'`<>]+/i;

const PRIVILEGED_RUNTIME_ENV_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'DIRECT_URL',
  'ADMIN_DASHBOARD_SECRET',
  'JWT_SECRET',
  'OTP_PEPPER',
];

const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g;
const CLIENT_SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.map', '.json', '.html', '.css']);

function walkFiles(dirPath, collected = []) {
  if (!fs.existsSync(dirPath)) return collected;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, collected);
    } else if (CLIENT_SCAN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      collected.push(full);
    }
  }
  return collected;
}

function hasServiceRoleJwtClaim(content) {
  const matches = content.match(JWT_PATTERN);
  if (!matches) return false;
  for (const token of matches) {
    const payloadSegment = token.split('.')[1];
    if (!payloadSegment) continue;
    try {
      const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = Buffer.from(normalized, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded);
      if (parsed && typeof parsed === 'object' && parsed.role === 'service_role') {
        return true;
      }
    } catch {
      // Ignore non-JSON token fragments
    }
  }
  return false;
}

/**
 * Scans Next.js browser build output (.next/static) and source client config
 * for accidental leakage of server-only privileged database credentials or secrets.
 * Never prints discovered secret values.
 */
export function scanWebBundleForSecrets(rootDir = process.cwd(), env = process.env) {
  const staticDir = path.join(rootDir, 'apps', 'web', '.next', 'static');
  if (!fs.existsSync(staticDir)) {
    throw new Error(`Web static build directory not found at ${staticDir}. Run pnpm build before scanning.`);
  }

  const findings = [];
  const files = walkFiles(staticDir);

  const secretValues = PRIVILEGED_RUNTIME_ENV_KEYS
    .map((key) => ({ key, value: (env[key] || '').trim() }))
    .filter((item) => item.value.length >= 12 && !item.value.toLowerCase().includes('dummy'));

  for (const filePath of files) {
    const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
    const content = fs.readFileSync(filePath, 'utf8');

    for (const identifier of FORBIDDEN_PUBLIC_IDENTIFIERS) {
      if (content.includes(identifier)) {
        findings.push({ file: relPath, reason: `FORBIDDEN_IDENTIFIER:${identifier}` });
      }
    }

    const envAccessMatch = content.match(PRIVILEGED_ENV_ACCESS_PATTERN);
    if (envAccessMatch) {
      findings.push({ file: relPath, reason: `PRIVILEGED_ENV_ACCESS:${envAccessMatch[1]}` });
    }

    if (DB_CONNECTION_URI_PATTERN.test(content)) {
      findings.push({ file: relPath, reason: 'EXPOSED_DATABASE_CONNECTION_URI' });
    }

    if (hasServiceRoleJwtClaim(content)) {
      findings.push({ file: relPath, reason: 'PRIVILEGED_JWT_ROLE:service_role' });
    }

    for (const secret of secretValues) {
      if (content.includes(secret.value)) {
        findings.push({ file: relPath, reason: `EXPOSED_RUNTIME_SECRET:${secret.key}` });
      }
    }
  }

  const nextConfigPath = path.join(rootDir, 'apps', 'web', 'next.config.js');
  if (fs.existsSync(nextConfigPath)) {
    const nextConfig = fs.readFileSync(nextConfigPath, 'utf8');
    if (/NEXT_PUBLIC_[A-Z0-9_]*SERVICE_ROLE/i.test(nextConfig) || nextConfig.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      findings.push({ file: 'apps/web/next.config.js', reason: 'FORBIDDEN_CONFIG_REFERENCE:SUPABASE_SERVICE_ROLE_KEY' });
    }
  }

  return { scannedFiles: files.length, findings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = scanWebBundleForSecrets();
  console.log(`[Web Secret Scan] Scanned ${result.scannedFiles} browser asset files; findings=${result.findings.length}`);
  if (result.findings.length > 0) {
    for (const finding of result.findings) {
      console.error(`  - ${finding.file}: ${finding.reason}`);
    }
    process.exitCode = 1;
  }
}
