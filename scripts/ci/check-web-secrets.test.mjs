import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanWebBundleForSecrets } from './check-web-secrets.mjs';

function makeTempWebBuild(files) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'web-secret-scan-'));
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(tmpRoot, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
  }
  return tmpRoot;
}

function makeJwt(payloadObj) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payloadObj)}.sig_part_123456`;
}

test('passes on clean static bundles containing only anon JWT and NEXT_PUBLIC variables', () => {
  const anonJwt = makeJwt({ iss: 'supabase', role: 'anon', exp: 2000000000 });
  const root = makeTempWebBuild({
    'apps/web/.next/static/chunks/main.js': `const key="${anonJwt}";const url="https://api.jobsclick.live";`,
    'apps/web/next.config.js': 'module.exports = { env: {} };',
  });

  try {
    const res = scanWebBundleForSecrets(root, {
      SUPABASE_SERVICE_ROLE_KEY: makeJwt({ iss: 'supabase', role: 'service_role', exp: 2000000000 }),
    });
    assert.equal(res.scannedFiles, 1);
    assert.equal(res.findings.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('flags leaked service_role JWT, connection URIs, or secrets without printing secret values', () => {
  const leakedSecretValue = 'super-real-service-role-secret-value-xyz';
  const serviceJwt = makeJwt({ iss: 'supabase', role: 'service_role', exp: 2000000000 });
  const root = makeTempWebBuild({
    'apps/web/.next/static/chunks/app.js':
      `window.__LEAK="${serviceJwt}";const k="${leakedSecretValue}";const x="SUPABASE_SERVICE_ROLE_KEY";const d="postgresql://user:secretpass@db.example.com:5432/postgres";`,
  });

  try {
    const res = scanWebBundleForSecrets(root, {
      SUPABASE_SERVICE_ROLE_KEY: leakedSecretValue,
    });
    assert.ok(res.findings.length >= 4);
    assert.ok(res.findings.some((f) => f.reason === 'PRIVILEGED_JWT_ROLE:service_role'));
    assert.ok(res.findings.some((f) => f.reason === 'FORBIDDEN_IDENTIFIER:SUPABASE_SERVICE_ROLE_KEY'));
    assert.ok(res.findings.some((f) => f.reason === 'EXPOSED_DATABASE_CONNECTION_URI'));
    assert.ok(res.findings.some((f) => f.reason === 'EXPOSED_RUNTIME_SECRET:SUPABASE_SERVICE_ROLE_KEY'));
    for (const finding of res.findings) {
      assert.equal(finding.reason.includes(leakedSecretValue), false);
      assert.equal(finding.reason.includes('secretpass'), false);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
