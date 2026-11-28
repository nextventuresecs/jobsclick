import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertStrictTlsEnv,
  buildRemoteSslConfig,
  resolveSupabaseCaCert,
} from './db-tls.ts';
import { parseAndValidateDbUrl } from './db-url.ts';
import { runOpenssl, SKIP_WITHOUT_OPENSSL } from './test-openssl.ts';

function generateTestPki(dir: string) {
  const caKey = path.join(dir, 'ca.key');
  const caCert = path.join(dir, 'ca.crt');
  const otherCaKey = path.join(dir, 'other-ca.key');
  const otherCaCert = path.join(dir, 'other-ca.crt');
  const srvKey = path.join(dir, 'srv.key');
  const srvCsr = path.join(dir, 'srv.csr');
  const srvCert = path.join(dir, 'srv.crt');
  const extFile = path.join(dir, 'srv.ext');

  runOpenssl([
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', caKey, '-out', caCert, '-days', '1',
    '-subj', '/CN=Test-Supabase-CA',
  ]);
  runOpenssl([
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', otherCaKey, '-out', otherCaCert, '-days', '1',
    '-subj', '/CN=Untrusted-CA',
  ]);
  runOpenssl([
    'req', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', srvKey, '-out', srvCsr,
    '-subj', '/CN=db.testref123.supabase.co',
  ]);
  fs.writeFileSync(extFile, 'subjectAltName=DNS:db.testref123.supabase.co\n');
  runOpenssl([
    'x509', '-req', '-in', srvCsr, '-CA', caCert, '-CAkey', caKey,
    '-CAcreateserial', '-out', srvCert, '-days', '1', '-extfile', extFile,
  ]);

  return {
    caPem: fs.readFileSync(caCert, 'utf8'),
    caFile: caCert,
    otherCaPem: fs.readFileSync(otherCaCert, 'utf8'),
    srvKeyPem: fs.readFileSync(srvKey, 'utf8'),
    srvCertPem: fs.readFileSync(srvCert, 'utf8'),
  };
}

describe.skipIf(SKIP_WITHOUT_OPENSSL)('DB TLS & Connection-String Security', () => {
  let tmpDir: string;
  let pki: ReturnType<typeof generateTestPki>;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-tls-test-'));
    pki = generateTestPki(tmpDir);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects missing, non-existent, and malformed SUPABASE_CA_CERT', () => {
    expect(() => resolveSupabaseCaCert('')).toThrow(/SUPABASE_CA_CERT is required/);
    expect(() => resolveSupabaseCaCert(path.join(tmpDir, 'missing.crt'))).toThrow(
      /does not exist or is not accessible/,
    );
    expect(() => resolveSupabaseCaCert(tmpDir)).toThrow(/not a regular file/);
    const badFile = path.join(tmpDir, 'bad.crt');
    fs.writeFileSync(badFile, 'not-a-cert');
    expect(() => resolveSupabaseCaCert(badFile)).toThrow(/does not contain a valid PEM/);
    expect(() =>
      resolveSupabaseCaCert('-----BEGIN CERTIFICATE-----\nINVALID\n-----END CERTIFICATE-----'),
    ).toThrow(/invalid or corrupt X.509/);
  });

  it('loads valid CA cert from inline PEM, escaped-newline PEM, and file path', () => {
    expect(resolveSupabaseCaCert(pki.caPem)).toContain('BEGIN CERTIFICATE');
    expect(resolveSupabaseCaCert(pki.caPem.replace(/\n/g, '\\n'))).toContain('BEGIN CERTIFICATE');
    expect(resolveSupabaseCaCert(pki.caFile)).toContain('BEGIN CERTIFICATE');
  });

  it('rejects TLS verification bypass env vars', () => {
    expect(() =>
      assertStrictTlsEnv({ isRemote: true, env: { NODE_TLS_REJECT_UNAUTHORIZED: '0' } }),
    ).toThrow(/NODE_TLS_REJECT_UNAUTHORIZED=0\/false is forbidden/);

    expect(() =>
      assertStrictTlsEnv({ isRemote: true, env: { DB_ALLOW_INSECURE_TLS: 'true' } }),
    ).toThrow(/DB_ALLOW_INSECURE_TLS is forbidden/);

    expect(() =>
      assertStrictTlsEnv({ isRemote: true, env: { PGSSLMODE: 'no-verify' } }),
    ).toThrow(/Insecure PGSSLMODE="no-verify" is forbidden/);
  });

  it('rejects connection-string parameter overrides', () => {
    const base = 'postgresql://postgres:secret@db.testref123.supabase.co:5432/postgres';
    const env = { NODE_ENV: 'production', SUPABASE_CA_CERT: pki.caPem };

    for (const badParam of [
      'sslmode=disable',
      'sslmode=no-verify',
      'sslmode=prefer',
      'ssl=false',
      'sslrootcert=/tmp/evil.crt',
      'options=-c%20statement_timeout=0',
    ]) {
      expect(() =>
        parseAndValidateDbUrl(`${base}?${badParam}`, {
          environment: 'staging',
          expectedProjectRef: 'testref123',
          confirmedProjectRef: 'testref123',
          env,
        }),
      ).toThrow(/forbidden|cannot override/);
    }
  });

  it('verifies real TLS handshake: accepts valid CA+hostname, rejects untrusted chain & hostname mismatch', async () => {
    const server = tls.createServer({
      key: pki.srvKeyPem,
      cert: pki.srvCertPem,
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const validSsl = buildRemoteSslConfig('db.testref123.supabase.co', {
        NODE_ENV: 'production',
        SUPABASE_CA_CERT: pki.caPem,
      });

      // 1. Valid CA + matching hostname succeeds
      await new Promise<void>((resolve, reject) => {
        const sock = tls.connect({ host: '127.0.0.1', port, ...validSsl }, () => {
          sock.end();
          resolve();
        });
        sock.on('error', reject);
      });

      // 2. Untrusted CA chain fails
      const wrongCaSsl = buildRemoteSslConfig('db.testref123.supabase.co', {
        NODE_ENV: 'production',
        SUPABASE_CA_CERT: pki.otherCaPem,
      });
      await expect(
        new Promise<void>((resolve, reject) => {
          const sock = tls.connect({ host: '127.0.0.1', port, ...wrongCaSsl }, () => {
            sock.end();
            resolve();
          });
          sock.on('error', reject);
        }),
      ).rejects.toThrow();

      // 3. Hostname mismatch fails
      const wrongHostSsl = buildRemoteSslConfig('db.wronghost.supabase.co', {
        NODE_ENV: 'production',
        SUPABASE_CA_CERT: pki.caPem,
      });
      await expect(
        new Promise<void>((resolve, reject) => {
          const sock = tls.connect({ host: '127.0.0.1', port, ...wrongHostSsl }, () => {
            sock.end();
            resolve();
          });
          sock.on('error', reject);
        }),
      ).rejects.toThrow(/Hostname\/IP does not match certificate's altnames/);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
