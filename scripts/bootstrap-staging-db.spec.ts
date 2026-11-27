import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import pg from 'pg';
const { Client } = pg;
import {
  parseDatabaseUrl,
  runBootstrap,
  TARGET_STAGING_PROJECT_REF,
  FORBIDDEN_OLD_PROJECT_REF,
} from './bootstrap-staging-db.js';

describe('Staging Database Bootstrap Runner URL Validation & Safety Gates', () => {
  const originalEnv = process.env;
  let tmpDir: string;
  let testCaPem: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-bootstrap-test-'));
    const key = path.join(tmpDir, 'ca.key');
    const crt = path.join(tmpDir, 'ca.crt');
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', key, '-out', crt, '-days', '1', '-subj', '/CN=Test-Staging-CA',
    ]);
    testCaPem = fs.readFileSync(crt, 'utf8');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    process.env = { ...originalEnv, SUPABASE_CA_CERT: testCaPem };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Localhost & Scratch Container Connections', () => {
    it('accepts local database URL on port 54322 without confirmation', () => {
      const config = parseDatabaseUrl('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
      expect(config.connectionString).toBe('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
      expect(config.ssl).toBe(false);
    });

    it('accepts localhost connection on port 5432', () => {
      const config = parseDatabaseUrl('postgresql://postgres:postgres@localhost:5432/postgres');
      expect(config.ssl).toBe(false);
    });
  });

  describe('Deprecation and Forbidden Project Ref Rejection', () => {
    it('rejects connection string containing forbidden old project ref in host', () => {
      expect(() => {
        parseDatabaseUrl(
          `postgresql://postgres:pass@db.${FORBIDDEN_OLD_PROJECT_REF}.supabase.co:5432/postgres`,
          { confirmedProjectRef: TARGET_STAGING_PROJECT_REF }
        );
      }).toThrow(/deprecated\/forbidden staging project ref/);
    });

    it('rejects connection string containing forbidden old project ref in pooler username', () => {
      expect(() => {
        parseDatabaseUrl(
          `postgresql://postgres.${FORBIDDEN_OLD_PROJECT_REF}:pass@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres`,
          { confirmedProjectRef: TARGET_STAGING_PROJECT_REF }
        );
      }).toThrow(/deprecated\/forbidden staging project ref/);
    });
  });

  describe('Port 6543 Transaction Pooler Rejection', () => {
    it('rejects port 6543 even on localhost with DDL error', () => {
      expect(() => {
        parseDatabaseUrl('postgresql://postgres:pass@127.0.0.1:6543/postgres');
      }).toThrow(/Port 6543 is a transaction-mode PgBouncer\/Supavisor pooler and does NOT support DDL schema migrations/);
    });

    it('rejects port 6543 on staging pooler', () => {
      expect(() => {
        parseDatabaseUrl(
          `postgresql://postgres.${TARGET_STAGING_PROJECT_REF}:pass@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres`,
          { confirmedProjectRef: TARGET_STAGING_PROJECT_REF }
        );
      }).toThrow(/Port 6543 is a transaction-mode PgBouncer\/Supavisor pooler and does NOT support DDL schema migrations/);
    });
  });

  describe('Remote Staging Confirmation Gate (--confirm-project-ref)', () => {
    it('throws when --confirm-project-ref is missing for remote direct host', () => {
      expect(() => {
        parseDatabaseUrl(`postgresql://postgres:pass@db.${TARGET_STAGING_PROJECT_REF}.supabase.co:5432/postgres`);
      }).toThrow(/SECURITY CONFIRMATION REQUIRED: Target is a remote host/);
    });

    it('throws when --confirm-project-ref does not match expected staging ref', () => {
      expect(() => {
        parseDatabaseUrl(
          `postgresql://postgres:pass@db.${TARGET_STAGING_PROJECT_REF}.supabase.co:5432/postgres`,
          { confirmedProjectRef: 'wrong-ref' }
        );
      }).toThrow(/SECURITY CONFIRMATION REQUIRED: Target is a remote host/);
    });

    it('succeeds when valid direct host is supplied with matching confirmedProjectRef', () => {
      const config = parseDatabaseUrl(
        `postgresql://postgres:pass@db.${TARGET_STAGING_PROJECT_REF}.supabase.co:5432/postgres`,
        { confirmedProjectRef: TARGET_STAGING_PROJECT_REF }
      );
      expect(config.connectionString).toBe(`postgresql://postgres:pass@db.${TARGET_STAGING_PROJECT_REF}.supabase.co:5432/postgres`);
      expect(typeof config.ssl).toBe('object');
      expect((config.ssl as { rejectUnauthorized: boolean }).rejectUnauthorized).toBe(true);
    });
    it('reads expected staging ref dynamically from STAGING_PROJECT_REF environment variable', () => {
      process.env.STAGING_PROJECT_REF = 'customstagingref123';
      expect(() => {
        parseDatabaseUrl('postgresql://postgres:pass@db.customstagingref123.supabase.co:5432/postgres');
      }).toThrow(/SECURITY CONFIRMATION REQUIRED: Target is a remote host .* --confirm-project-ref customstagingref123/);

      const config = parseDatabaseUrl(
        'postgresql://postgres:pass@db.customstagingref123.supabase.co:5432/postgres',
        { confirmedProjectRef: 'customstagingref123' }
      );
      expect(config.connectionString).toContain('customstagingref123');
    });
  });

  describe('Session Pooler Support (Port 5432 & User postgres.<ref>)', () => {
    it('accepts staging session pooler on port 5432 with matching tenant user', () => {
      const poolerUrl = `postgresql://postgres.${TARGET_STAGING_PROJECT_REF}:mypassword@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres`;
      const config = parseDatabaseUrl(poolerUrl, { confirmedProjectRef: TARGET_STAGING_PROJECT_REF });
      expect(config.connectionString).toBe(poolerUrl);
      expect((config.ssl as { rejectUnauthorized: boolean }).rejectUnauthorized).toBe(true);
    });

    it('rejects staging pooler if username tenant does not match target ref', () => {
      const poolerUrl = `postgresql://postgres.someothertenant:mypassword@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres`;
      expect(() => {
        parseDatabaseUrl(poolerUrl, { confirmedProjectRef: TARGET_STAGING_PROJECT_REF });
      }).toThrow(/Pooler tenant mismatch/);
    });

    it('rejects pooler on non-5432 port (e.g. 5433)', () => {
      const poolerUrl = `postgresql://postgres.${TARGET_STAGING_PROJECT_REF}:mypassword@aws-0-ap-northeast-2.pooler.supabase.com:5433/postgres`;
      expect(() => {
        parseDatabaseUrl(poolerUrl, { confirmedProjectRef: TARGET_STAGING_PROJECT_REF });
      }).toThrow(/Staging pooler must connect via Session Mode on port 5432/);
    });
  });

  describe('Arbitrary Remote Host Rejection', () => {
    it('rejects unauthorized external database host', () => {
      expect(() => {
        parseDatabaseUrl('postgresql://postgres:pass@malicious-db.com:5432/postgres', {
          confirmedProjectRef: TARGET_STAGING_PROJECT_REF,
        });
      }).toThrow(/SECURITY ABORT: Host "malicious-db.com" is not permitted/);
    });
  });

  describe('TLS and SUPABASE_CA_CERT Configuration', () => {
    it('enforces rejectUnauthorized: true on remote connections', () => {
      const config = parseDatabaseUrl(
        `postgresql://postgres:pass@db.${TARGET_STAGING_PROJECT_REF}.supabase.co:5432/postgres`,
        { confirmedProjectRef: TARGET_STAGING_PROJECT_REF }
      );
      expect((config.ssl as { rejectUnauthorized: boolean }).rejectUnauthorized).toBe(true);
    });

    it('attaches CA certificate from inline SUPABASE_CA_CERT PEM string and rejects missing CA', () => {
      process.env.SUPABASE_CA_CERT = testCaPem;
      const config = parseDatabaseUrl(
        `postgresql://postgres:pass@db.${TARGET_STAGING_PROJECT_REF}.supabase.co:5432/postgres`,
        { confirmedProjectRef: TARGET_STAGING_PROJECT_REF }
      );
      expect((config.ssl as { ca?: string }).ca).toBe(testCaPem.replace(/\r\n/g, '\n').trim());

      delete process.env.SUPABASE_CA_CERT;
      expect(() =>
        parseDatabaseUrl(
          `postgresql://postgres:pass@db.${TARGET_STAGING_PROJECT_REF}.supabase.co:5432/postgres`,
          { confirmedProjectRef: TARGET_STAGING_PROJECT_REF }
        )
      ).toThrow(/SUPABASE_CA_CERT is required/);
    });
  });

  describe('Environment Isolation & No Silent Local Fallback', () => {
    it('rejects missing STAGING_DATABASE_URL without falling back to DATABASE_URL or localhost', async () => {
      delete process.env.STAGING_DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
      await expect(runBootstrap({ dryRun: true })).rejects.toThrow(
        /STAGING_DATABASE_URL is required/,
      );
    });

    it('rejects production project ref in staging and rejects localhost in strict staging NODE_ENV', () => {
      process.env.PRODUCTION_PROJECT_REF = 'prodref999888777';
      expect(() =>
        parseDatabaseUrl(
          'postgresql://postgres.prodref999888777:pass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
          { confirmedProjectRef: TARGET_STAGING_PROJECT_REF }
        )
      ).toThrow(/deprecated\/forbidden staging project ref/);

      process.env.NODE_ENV = 'staging';
      expect(() =>
        parseDatabaseUrl('postgresql://postgres:postgres@127.0.0.1:54322/postgres')
      ).toThrow(/Localhost target "127.0.0.1" is forbidden in strict staging/);
    });

    it('rejects missing password on remote staging connections', () => {
      expect(() =>
        parseDatabaseUrl(
          `postgresql://postgres@db.${TARGET_STAGING_PROJECT_REF}.supabase.co:5432/postgres`,
          { confirmedProjectRef: TARGET_STAGING_PROJECT_REF }
        )
      ).toThrow(/Database password is required/);
    });
  });

  describe('--dry-run Zero-Writes Proof on Fresh Database', () => {
    it('performs zero writes and leaves database with no supabase_migrations schema', async () => {
      const masterConn = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
      const testDbName = 'dryrun_test_empty';
      const testDbUrl = `postgresql://postgres:postgres@127.0.0.1:54322/${testDbName}`;

      const master = new Client({ connectionString: masterConn });
      await master.connect();
      await master.query(`DROP DATABASE IF EXISTS ${testDbName} WITH (FORCE);`);
      await master.query(`CREATE DATABASE ${testDbName};`);
      await master.end();

      try {
        await runBootstrap({
          connectionString: testDbUrl,
          dryRun: true,
        });

        const testClient = new Client({ connectionString: testDbUrl });
        await testClient.connect();

        // 1. Assert supabase_migrations schema does NOT exist
        const schemaCheck = await testClient.query(`
          SELECT 1 FROM information_schema.schemata WHERE schema_name = 'supabase_migrations';
        `);
        expect(schemaCheck.rows.length).toBe(0);

        // 2. Assert public schema has 0 tables
        const tablesCheck = await testClient.query(`
          SELECT 1 FROM information_schema.tables WHERE table_schema = 'public';
        `);
        expect(tablesCheck.rows.length).toBe(0);

        await testClient.end();
      } finally {
        const cleanup = new Client({ connectionString: masterConn });
        await cleanup.connect();
        await cleanup.query(`DROP DATABASE IF EXISTS ${testDbName} WITH (FORCE);`);
        await cleanup.end();
      }
    });
  });
});
