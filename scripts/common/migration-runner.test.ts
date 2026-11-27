import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Client } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  computeSha256,
  detectTransactionIncompatibleSql,
  discoverAndValidateMigrations,
  runMigrationRunner,
} from './migration-runner.ts';

interface MockQueryRecord {
  sql: string;
  params?: unknown[];
}

function createMockClient(options: {
  lockAcquired?: boolean;
  tableExists?: boolean;
  hasChecksumCol?: boolean;
  publicTableCount?: number;
  appliedRows?: Array<{ version: string; name: string | null; statements: string[] | null; checksum?: string | null }>;
  failOnSqlMatch?: string;
  unpinnedProcs?: Array<{ schema_name: string; proname: string }>;
  tablesWithoutRls?: Array<{ relname: string }>;
} = {}) {
  const queries: MockQueryRecord[] = [];
  const client = {
    queries,
    async query(sql: string, params?: unknown[]) {
      queries.push({ sql, params });
      if (options.failOnSqlMatch && sql.includes(options.failOnSqlMatch)) {
        throw new Error('Simulated SQL execution error');
      }
      if (sql.includes('pg_try_advisory_lock')) {
        return { rows: [{ acquired: options.lockAcquired ?? true }] };
      }
      if (sql.includes("table_name = 'schema_migrations'")) {
        return { rows: [{ exists: options.tableExists ?? true }] };
      }
      if (sql.includes("column_name = 'checksum'")) {
        return { rows: [{ exists: options.hasChecksumCol ?? true }] };
      }
      if (sql.includes('FROM information_schema.tables') && sql.includes("table_schema = 'public'")) {
        return { rows: [{ count: String(options.publicTableCount ?? 0) }] };
      }
      if (sql.includes('FROM supabase_migrations.schema_migrations')) {
        return { rows: options.appliedRows ?? [] };
      }
      if (sql.includes('FROM pg_proc p')) {
        return { rows: options.unpinnedProcs ?? [] };
      }
      if (sql.includes('FROM pg_class c')) {
        return { rows: options.tablesWithoutRls ?? [] };
      }
      return { rows: [] };
    },
  };
  return client as unknown as Client & { queries: MockQueryRecord[] };
}

describe('Migration Runner Safety & Integrity', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-runner-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('rejects invalid migration filenames and duplicate versions', () => {
    fs.writeFileSync(path.join(tempDir, 'bad_name.sql'), 'SELECT 1;');
    expect(() => discoverAndValidateMigrations(tempDir)).toThrow(/Invalid migration filename/);

    fs.rmSync(path.join(tempDir, 'bad_name.sql'));
    fs.writeFileSync(path.join(tempDir, '20261008000000_first.sql'), 'SELECT 1;');
    fs.writeFileSync(path.join(tempDir, '20261008000000_second.sql'), 'SELECT 2;');
    expect(() => discoverAndValidateMigrations(tempDir)).toThrow(/Duplicate migration version/);
  });

  it('detects transaction-incompatible SQL and requires reviewed marker + flag', () => {
    const sql = 'CREATE INDEX CONCURRENTLY idx_foo ON public.jobs(id);';
    expect(detectTransactionIncompatibleSql(sql)).toEqual(['CONCURRENTLY']);

    fs.writeFileSync(path.join(tempDir, '20261008000000_idx.sql'), sql);
    expect(() => discoverAndValidateMigrations(tempDir)).toThrow(/transaction-incompatible SQL/);

    fs.writeFileSync(
      path.join(tempDir, '20261008000000_idx.sql'),
      `-- migration-strategy: non-transactional\n${sql}`,
    );
    expect(() => discoverAndValidateMigrations(tempDir, { allowNonTransactional: false })).toThrow(
      /transaction-incompatible SQL/,
    );

    const parsed = discoverAndValidateMigrations(tempDir, { allowNonTransactional: true });
    expect(parsed[0]?.nonTransactional).toBe(true);
  });

  it('detects checksum mismatch and unknown migration history drift', async () => {
    const sql = 'CREATE TABLE public.test_t (id int);';
    fs.writeFileSync(path.join(tempDir, '20261008000000_init.sql'), sql);

    const clientMismatch = createMockClient({
      appliedRows: [
        { version: '20261008000000', name: 'init', statements: [sql], checksum: 'deadbeef' },
      ],
    });
    await expect(
      runMigrationRunner({ client: clientMismatch, migrationsDir: tempDir }),
    ).rejects.toThrow(/MIGRATION CHECKSUM MISMATCH/);

    const clientDrift = createMockClient({
      appliedRows: [
        { version: '20261008000000', name: 'init', statements: [sql], checksum: computeSha256(sql) },
        { version: '20990101000000', name: 'ghost', statements: ['SELECT 1;'], checksum: computeSha256('SELECT 1;') },
      ],
    });
    await expect(
      runMigrationRunner({ client: clientDrift, migrationsDir: tempDir }),
    ).rejects.toThrow(/MIGRATION HISTORY DRIFT/);
  });

  it('accepts history rows stored with CRLF line endings (Windows-applied migrations)', async () => {
    const sqlLf = 'CREATE TABLE public.test_t (\n  id int\n);\n';
    fs.writeFileSync(path.join(tempDir, '20261008000000_init.sql'), sqlLf);
    const client = createMockClient({
      appliedRows: [
        { version: '20261008000000', name: 'init', statements: [sqlLf.replace(/\n/g, '\r\n')], checksum: null },
      ],
    });
    const summary = await runMigrationRunner({ client, migrationsDir: tempDir, dryRun: true });
    expect(summary.pendingCount).toBe(0);
  });

  it('accepts CLI-split multi-statement history rows only when SQL is equivalent', async () => {
    fs.writeFileSync(
      path.join(tempDir, '20261008000000_init.sql'),
      '-- c\nALTER VIEW a RESET (x);\nALTER VIEW b RESET (x);\n',
    );
    const ok = createMockClient({
      appliedRows: [
        { version: '20261008000000', name: 'init', statements: ['-- c\nALTER VIEW a RESET (x)', 'ALTER VIEW b RESET (x)'], checksum: null },
      ],
    });
    await expect(runMigrationRunner({ client: ok, migrationsDir: tempDir, dryRun: true })).resolves.toBeDefined();

    const drifted = createMockClient({
      appliedRows: [
        { version: '20261008000000', name: 'init', statements: ['-- c\nALTER VIEW a RESET (x)', 'ALTER VIEW b RESET (y)'], checksum: null },
      ],
    });
    await expect(
      runMigrationRunner({ client: drifted, migrationsDir: tempDir, dryRun: true }),
    ).rejects.toThrow(/MIGRATION CHECKSUM MISMATCH/);
  });

  it('still rejects genuinely modified content even with CRLF normalization', async () => {
    fs.writeFileSync(path.join(tempDir, '20261008000000_init.sql'), 'SELECT 2;\n');
    const client = createMockClient({
      appliedRows: [{ version: '20261008000000', name: 'init', statements: ['SELECT 1;\r\n'], checksum: null }],
    });
    await expect(
      runMigrationRunner({ client, migrationsDir: tempDir, dryRun: true }),
    ).rejects.toThrow(/MIGRATION CHECKSUM MISMATCH/);
  });

  it('supports explicit non-destructive checksum baseline and refuses silent baseline', async () => {
    const sql = 'CREATE TABLE public.test_t (id int);';
    fs.writeFileSync(path.join(tempDir, '20261008000000_init.sql'), sql);

    const clientNoChecksum = createMockClient({
      hasChecksumCol: false,
      appliedRows: [{ version: '20261008000000', name: 'init', statements: null }],
    });

    await expect(
      runMigrationRunner({ client: clientNoChecksum, migrationsDir: tempDir }),
    ).rejects.toThrow(/--baseline-checksums/);

    const summary = await runMigrationRunner({
      client: clientNoChecksum,
      migrationsDir: tempDir,
      baselineChecksums: true,
    });
    expect(summary.baselinedVersions).toEqual(['20261008000000']);
    expect(clientNoChecksum.queries.some((q) => q.sql.includes('UPDATE supabase_migrations.schema_migrations'))).toBe(true);
  });

  it('aborts on concurrent lock timeout', async () => {
    fs.writeFileSync(path.join(tempDir, '20261008000000_init.sql'), 'SELECT 1;');
    const lockedClient = createMockClient({ lockAcquired: false });

    await expect(
      runMigrationRunner({
        client: lockedClient,
        migrationsDir: tempDir,
        lockAcquireTimeoutMs: 50,
      }),
    ).rejects.toThrow(/MIGRATION LOCK TIMEOUT/);
  });

  it('rolls back transaction on migration failure and verifies dry-run writes nothing', async () => {
    const sql = 'CREATE TABLE public.broken (id int);';
    fs.writeFileSync(path.join(tempDir, '20261008000000_broken.sql'), sql);

    // Dry-run performs zero writes
    const dryClient = createMockClient({ tableExists: false });
    const drySummary = await runMigrationRunner({
      client: dryClient,
      migrationsDir: tempDir,
      dryRun: true,
    });
    expect(drySummary.dryRun).toBe(true);
    expect(drySummary.pendingCount).toBe(1);
    const writeQueries = dryClient.queries.filter((q) =>
      /\b(CREATE|ALTER|INSERT|UPDATE|DELETE|BEGIN|COMMIT)\b/i.test(q.sql),
    );
    expect(writeQueries).toEqual([]);

    // Live failure triggers ROLLBACK and skips COMMIT
    const failClient = createMockClient({ tableExists: true, failOnSqlMatch: 'CREATE TABLE public.broken' });
    await expect(
      runMigrationRunner({ client: failClient, migrationsDir: tempDir }),
    ).rejects.toThrow(/Simulated SQL execution error/);
    expect(failClient.queries.some((q) => q.sql === 'ROLLBACK;')).toBe(true);
    expect(failClient.queries.some((q) => q.sql === 'COMMIT;')).toBe(false);
  });

  it('fails closed if post-migration security invariants fail', async () => {
    fs.writeFileSync(path.join(tempDir, '20261008000000_init.sql'), 'SELECT 1;');
    const insecureClient = createMockClient({
      tableExists: true,
      tablesWithoutRls: [{ relname: 'users' }],
    });
    await expect(
      runMigrationRunner({ client: insecureClient, migrationsDir: tempDir }),
    ).rejects.toThrow(/POST-MIGRATION INVARIANT FAILED: public table\(s\) missing RLS: users/);
  });
});
