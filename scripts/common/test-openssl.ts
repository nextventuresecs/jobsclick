import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';

const WINDOWS_FALLBACKS = [
  'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
  'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe',
  'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe',
];

function resolveOpenssl(): string | null {
  const candidates = [
    'openssl',
    ...(process.platform === 'win32' ? WINDOWS_FALLBACKS.filter((p) => fs.existsSync(p)) : []),
  ];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['version'], { encoding: 'utf8' });
    if (probe.status === 0) return candidate;
  }
  return null;
}

export const OPENSSL_BIN = resolveOpenssl();

/** Skip only on developer machines without a working openssl; CI must never skip silently. */
export const SKIP_WITHOUT_OPENSSL = OPENSSL_BIN === null && !process.env.CI;

export function runOpenssl(args: string[]): Buffer {
  if (OPENSSL_BIN === null) {
    throw new Error('openssl is required for this test but no working binary was found on PATH');
  }
  return execFileSync(OPENSSL_BIN, args, { stdio: 'pipe' });
}
