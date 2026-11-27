import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  getExpectedProductionRef,
  parseProductionDatabaseUrl,
} from './bootstrap-production-db.ts';
import {
  FORBIDDEN_OLD_PROJECT_REF,
  TARGET_STAGING_PROJECT_REF,
} from './bootstrap-staging-db.ts';
import { snapshotProductionSchema } from './snapshot-production-schema.ts';

describe('bootstrap-production-db safeguards', () => {
  const originalEnv = process.env;
  const prodRef = 'prodprojref123456789';
  const sessionPoolerUrl = `postgresql://postgres.${prodRef}:secretpass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`;
  let tmpDir: string;
  let testCaPem: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prod-bootstrap-test-'));
    const key = path.join(tmpDir, 'ca.key');
    const crt = path.join(tmpDir, 'ca.crt');
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', key, '-out', crt, '-days', '1', '-subj', '/CN=Test-Prod-CA',
    ]);
    testCaPem = fs.readFileSync(crt, 'utf8');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'production', SUPABASE_CA_CERT: testCaPem };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('requires PRODUCTION_PROJECT_REF and refuses staging or forbidden refs', () => {
    expect(() =>
      getExpectedProductionRef({ productionProjectRef: '' }),
    ).toThrow(/PRODUCTION_PROJECT_REF is required/);

    expect(() =>
      getExpectedProductionRef({ productionProjectRef: TARGET_STAGING_PROJECT_REF }),
    ).toThrow(/staging or forbidden project ref/);

    expect(() =>
      getExpectedProductionRef({ productionProjectRef: FORBIDDEN_OLD_PROJECT_REF }),
    ).toThrow(/staging or forbidden project ref/);

    expect(() =>
      getExpectedProductionRef({
        productionProjectRef: 'customstagingref123',
        stagingProjectRef: 'customstagingref123',
      }),
    ).toThrow(/staging or forbidden project ref/);

    expect(
      getExpectedProductionRef({ productionProjectRef: prodRef }),
    ).toBe(prodRef);
  });

  it('requires PRODUCTION_DATABASE_URL and rejects staging URLs or localhost', () => {
    expect(() =>
      parseProductionDatabaseUrl('', {
        productionProjectRef: prodRef,
        confirmedProjectRef: prodRef,
      }),
    ).toThrow(/PRODUCTION_DATABASE_URL is required/);

    expect(() =>
      parseProductionDatabaseUrl(
        `postgresql://postgres.${TARGET_STAGING_PROJECT_REF}:pass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
        {
          productionProjectRef: prodRef,
          confirmedProjectRef: prodRef,
        },
      ),
    ).toThrow(/staging\/forbidden project ref/);

    expect(() =>
      parseProductionDatabaseUrl(
        'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        {
          productionProjectRef: prodRef,
          confirmedProjectRef: prodRef,
        },
      ),
    ).toThrow(/Refusing to run production bootstrap against local host/);
  });

  it('enforces --confirm-project-ref, port 5432 session pooler, and tenant match', () => {
    expect(() =>
      parseProductionDatabaseUrl(sessionPoolerUrl, {
        productionProjectRef: prodRef,
      }),
    ).toThrow(/SECURITY CONFIRMATION REQUIRED/);

    expect(() =>
      parseProductionDatabaseUrl(sessionPoolerUrl, {
        productionProjectRef: prodRef,
        confirmedProjectRef: 'wrong-ref',
      }),
    ).toThrow(/SECURITY CONFIRMATION REQUIRED/);

    expect(() =>
      parseProductionDatabaseUrl(
        `postgresql://postgres.${prodRef}:secretpass@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
        {
          productionProjectRef: prodRef,
          confirmedProjectRef: prodRef,
        },
      ),
    ).toThrow(/Port 6543 is a transaction-mode/);

    expect(() =>
      parseProductionDatabaseUrl(
        'postgresql://postgres.otherref:secretpass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
        {
          productionProjectRef: prodRef,
          confirmedProjectRef: prodRef,
        },
      ),
    ).toThrow(/Pooler tenant mismatch/);

    const config = parseProductionDatabaseUrl(sessionPoolerUrl, {
      productionProjectRef: prodRef,
      confirmedProjectRef: prodRef,
    });
    expect(config.host).toBe('aws-0-ap-south-1.pooler.supabase.com');
    expect(config.port).toBe(5432);
    expect(config.user).toBe(`postgres.${prodRef}`);
    expect(config.ssl).toEqual({
      rejectUnauthorized: true,
      ca: testCaPem.replace(/\r\n/g, '\n').trim(),
      servername: 'aws-0-ap-south-1.pooler.supabase.com',
    });
  });

  it('requires valid SUPABASE_CA_CERT and rejects TLS bypass or URL parameter overrides in production', () => {
    delete process.env.SUPABASE_CA_CERT;
    expect(() =>
      parseProductionDatabaseUrl(sessionPoolerUrl, {
        productionProjectRef: prodRef,
        confirmedProjectRef: prodRef,
      }),
    ).toThrow(/SUPABASE_CA_CERT is required/);

    process.env.SUPABASE_CA_CERT = testCaPem;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    expect(() =>
      parseProductionDatabaseUrl(sessionPoolerUrl, {
        productionProjectRef: prodRef,
        confirmedProjectRef: prodRef,
      }),
    ).toThrow(/NODE_TLS_REJECT_UNAUTHORIZED=0\/false is forbidden/);

    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    expect(() =>
      parseProductionDatabaseUrl(`${sessionPoolerUrl}?sslmode=no-verify`, {
        productionProjectRef: prodRef,
        confirmedProjectRef: prodRef,
      }),
    ).toThrow(/sslmode=no-verify is forbidden/);
  });

  it('enforces strict TLS (verify-full + PGSSLROOTCERT) in snapshotProductionSchema', () => {
    const outFile = path.join(tmpDir, 'prod-schema.sql');
    let capturedEnv: NodeJS.ProcessEnv | undefined;
    let capturedCaExistsDuringRun = false;

    snapshotProductionSchema({
      outputFile: outFile,
      connectionString: sessionPoolerUrl,
      productionProjectRef: prodRef,
      confirmedProjectRef: prodRef,
      runner: (_file, _args, env) => {
        capturedEnv = env;
        capturedCaExistsDuringRun = Boolean(env.PGSSLROOTCERT && fs.existsSync(env.PGSSLROOTCERT));
        fs.writeFileSync(outFile, '-- schema snapshot');
      },
    });

    expect(capturedEnv?.PGSSLMODE).toBe('verify-full');
    expect(capturedCaExistsDuringRun).toBe(true);
    expect(fs.existsSync(capturedEnv?.PGSSLROOTCERT ?? '')).toBe(false);
  });
});
