import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Client } from 'pg';

export const MIGRATION_LOCK_ID = 742941842;
const MIGRATION_FILENAME_RE = /^(\d{14})_([a-zA-Z0-9_]+)\.sql$/;
const NON_TX_MARKER_RE = /--\s*migration-strategy:\s*non-transactional/i;

export interface MigrationFile {
  filename: string;
  version: string;
  name: string;
  filePath: string;
  sql: string;
  checksum: string;
  nonTransactional: boolean;
}

export interface AppliedMigrationRow {
  version: string;
  name: string | null;
  statements: string[] | null;
  checksum?: string | null;
}

export interface MigrationRunnerOptions {
  client: Client;
  migrationsDir?: string;
  dryRun?: boolean;
  baselineChecksums?: boolean;
  allowNonTransactional?: boolean;
  lockAcquireTimeoutMs?: number;
  verifySecurityInvariants?: boolean;
  label?: string;
}

export interface MigrationRunSummary {
  totalFiles: number;
  alreadyApplied: number;
  pendingCount: number;
  appliedVersions: string[];
  baselinedVersions: string[];
  dryRun: boolean;
}

export function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n?/g, '\n');
}

export function computeSha256(content: string): string {
  return crypto.createHash('sha256').update(normalizeLineEndings(content), 'utf8').digest('hex');
}

/**
 * Whitespace-, comment- and semicolon-insensitive fingerprint. Used ONLY to verify
 * history rows that the Supabase CLI / MCP stored as several split statements, where
 * the original file text cannot be reconstructed byte-for-byte.
 */
export function sqlFingerprint(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '')
    .replace(/[\s;]+/g, '');
}

export function stripSqlCommentsAndStrings(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/'(?:''|[^'])*'/g, "''");
}

export function detectTransactionIncompatibleSql(sql: string): string[] {
  const cleaned = stripSqlCommentsAndStrings(sql);
  const patterns: { label: string; regex: RegExp }[] = [
    { label: 'CONCURRENTLY', regex: /\bCONCURRENTLY\b/i },
    { label: 'VACUUM', regex: /\bVACUUM\b/i },
    { label: 'CREATE DATABASE', regex: /\bCREATE\s+DATABASE\b/i },
    { label: 'DROP DATABASE', regex: /\bDROP\s+DATABASE\b/i },
    { label: 'DISCARD ALL', regex: /\bDISCARD\s+ALL\b/i },
  ];
  return patterns.filter((p) => p.regex.test(cleaned)).map((p) => p.label);
}

export function discoverAndValidateMigrations(
  migrationsDir: string,
  options: { allowNonTransactional?: boolean } = {},
): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Missing canonical migrations directory: ${migrationsDir}`);
  }

  const entries = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  const seenVersions = new Set<string>();
  const migrations: MigrationFile[] = [];

  for (const filename of entries) {
    const match = filename.match(MIGRATION_FILENAME_RE);
    if (!match) {
      throw new Error(
        `MIGRATION VALIDATION ERROR: Invalid migration filename "${filename}". Expected <14-digit-version>_<name>.sql.`,
      );
    }

    const [, version, name] = match;
    if (seenVersions.has(version)) {
      throw new Error(
        `MIGRATION VALIDATION ERROR: Duplicate migration version "${version}" detected at "${filename}".`,
      );
    }
    seenVersions.add(version);

    const filePath = path.join(migrationsDir, filename);
    const sql = fs.readFileSync(filePath, 'utf8');
    const incompatible = detectTransactionIncompatibleSql(sql);
    const hasMarker = NON_TX_MARKER_RE.test(sql);

    if (incompatible.length > 0 && (!hasMarker || !options.allowNonTransactional)) {
      throw new Error(
        `MIGRATION VALIDATION ERROR: "${filename}" contains transaction-incompatible SQL (${incompatible.join(', ')}). ` +
        `Add "-- migration-strategy: non-transactional" after review and pass --allow-non-transactional.`,
      );
    }

    migrations.push({
      filename,
      version,
      name,
      filePath,
      sql,
      checksum: computeSha256(sql),
      nonTransactional: incompatible.length > 0,
    });
  }

  return migrations;
}

export async function acquireAdvisoryLock(
  client: Client,
  lockId: number = MIGRATION_LOCK_ID,
  timeoutMs: number = 15000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const res = await client.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS acquired;',
      [lockId],
    );
    if (res.rows[0]?.acquired === true) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `MIGRATION LOCK TIMEOUT: Could not acquire advisory lock ${lockId} within ${timeoutMs}ms. Another migration process may be active.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function readAppliedHistory(client: Client): Promise<{
  tableExists: boolean;
  hasChecksumCol: boolean;
  rows: AppliedMigrationRow[];
}> {
  const tableRes = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
    ) AS exists;
  `);
  const tableExists = tableRes.rows[0]?.exists === true;
  if (!tableExists) {
    return { tableExists: false, hasChecksumCol: false, rows: [] };
  }

  const colRes = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'supabase_migrations'
        AND table_name = 'schema_migrations'
        AND column_name = 'checksum'
    ) AS exists;
  `);
  const hasChecksumCol = colRes.rows[0]?.exists === true;

  const query = hasChecksumCol
    ? 'SELECT version, name, statements, checksum FROM supabase_migrations.schema_migrations ORDER BY version ASC;'
    : 'SELECT version, name, statements FROM supabase_migrations.schema_migrations ORDER BY version ASC;';
  const rowsRes = await client.query<AppliedMigrationRow>(query);
  return { tableExists: true, hasChecksumCol, rows: rowsRes.rows };
}

export async function verifyPostMigrationInvariants(client: Client): Promise<void> {
  const unpinnedProc = await client.query<{ schema_name: string; proname: string }>(`
    SELECT n.nspname AS schema_name, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname IN ('public', 'private_payments')
      AND p.prosecdef = true
      AND (p.proconfig IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'
      ));
  `);
  if (unpinnedProc.rows.length > 0) {
    throw new Error(
      `POST-MIGRATION INVARIANT FAILED: SECURITY DEFINER function(s) missing pinned search_path: ${unpinnedProc.rows.map((r) => `${r.schema_name}.${r.proname}`).join(', ')}`,
    );
  }

  const tablesWithoutRls = await client.query<{ relname: string }>(`
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false
    ORDER BY c.relname;
  `);
  if (tablesWithoutRls.rows.length > 0) {
    throw new Error(
      `POST-MIGRATION INVARIANT FAILED: public table(s) missing RLS: ${tablesWithoutRls.rows.map((r) => r.relname).join(', ')}`,
    );
  }
}

export async function runMigrationRunner(options: MigrationRunnerOptions): Promise<MigrationRunSummary> {
  const {
    client,
    migrationsDir = path.resolve(process.cwd(), 'supabase/migrations'),
    dryRun = false,
    baselineChecksums = false,
    allowNonTransactional = false,
    lockAcquireTimeoutMs = 15000,
    verifySecurityInvariants = true,
  } = options;

  // Preflight: validate all local migration files before acquiring DB lock
  const localMigrations = discoverAndValidateMigrations(migrationsDir, { allowNonTransactional });
  const localByVersion = new Map(localMigrations.map((m) => [m.version, m]));

  await acquireAdvisoryLock(client, MIGRATION_LOCK_ID, lockAcquireTimeoutMs);
  try {
    await client.query("SET lock_timeout = '10s';");
    await client.query("SET statement_timeout = '60s';");

    // Revalidate migration state under the execution lock
    const history = await readAppliedHistory(client);
    const appliedVersions = new Set<string>();
    const toBaseline: MigrationFile[] = [];

    if (!history.tableExists) {
      const publicTablesRes = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
      `);
      const publicTableCount = parseInt(publicTablesRes.rows[0]?.count ?? '0', 10);
      if (publicTableCount > 0) {
        throw new Error(
          'MIGRATION HISTORY INCONSISTENCY: Target database has existing public tables but no supabase_migrations.schema_migrations table.',
        );
      }
      if (dryRun) {
        console.log('ℹ️  [DRY RUN] supabase_migrations schema does not exist yet (zero writes performed).');
      }
    } else {
      for (const row of history.rows) {
        const local = localByVersion.get(row.version);
        if (!local) {
          throw new Error(
            `MIGRATION HISTORY DRIFT: Database contains unknown migration version "${row.version}" not found in local supabase/migrations/.`,
          );
        }
        if (row.name && row.name !== local.name) {
          throw new Error(
            `MIGRATION HISTORY INCONSISTENCY: Migration ${row.version} name mismatch (DB: "${row.name}", local: "${local.name}").`,
          );
        }

        if (row.checksum) {
          if (row.checksum !== local.checksum) {
            throw new Error(
              `MIGRATION CHECKSUM MISMATCH: Applied migration ${local.filename} was modified (checksum mismatch).`,
            );
          }
        } else if (
          Array.isArray(row.statements) &&
          row.statements.length >= 1 &&
          row.statements.every((st) => typeof st === 'string')
        ) {
          const stored = row.statements;
          const exact = stored.length === 1 && computeSha256(stored[0]) === local.checksum;
          const equivalent = exact || sqlFingerprint(stored.join(';\n')) === sqlFingerprint(local.sql);
          if (!equivalent) {
            throw new Error(
              `MIGRATION CHECKSUM MISMATCH: Applied migration ${local.filename} was modified (statements checksum mismatch).`,
            );
          }
          if (baselineChecksums) {
            toBaseline.push(local);
          }
        } else if (baselineChecksums) {
          toBaseline.push(local);
        } else {
          throw new Error(
            `MIGRATION HISTORY INCONSISTENCY: Applied migration ${local.filename} has no verifiable checksum. Review history and re-run with --baseline-checksums if safe.`,
          );
        }

        appliedVersions.add(row.version);
      }
    }

    const pending = localMigrations.filter((m) => !appliedVersions.has(m.version));
    console.log(`Found ${localMigrations.length} total migration files.`);
    console.log(`Already applied: ${appliedVersions.size}`);
    console.log(`Pending execution: ${pending.length}\n`);

    const baselinedVersions: string[] = [];
    const newlyAppliedVersions: string[] = [];

    if (!dryRun) {
      if (!history.tableExists) {
        await client.query(`
          CREATE SCHEMA IF NOT EXISTS supabase_migrations;
          CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
            version text PRIMARY KEY,
            statements text[],
            name text,
            checksum text
          );
        `);
      } else if (!history.hasChecksumCol) {
        await client.query(`
          ALTER TABLE supabase_migrations.schema_migrations
          ADD COLUMN IF NOT EXISTS checksum text;
        `);
      }

      if (toBaseline.length > 0) {
        await client.query('BEGIN;');
        try {
          for (const item of toBaseline) {
            await client.query(
              `UPDATE supabase_migrations.schema_migrations
               SET checksum = $2
               WHERE version = $1 AND checksum IS NULL;`,
              [item.version, item.checksum],
            );
            baselinedVersions.push(item.version);
          }
          await client.query('COMMIT;');
        } catch (err) {
          await client.query('ROLLBACK;');
          throw err;
        }
      }
    } else if (toBaseline.length > 0) {
      console.log(`ℹ️  [DRY RUN] Would baseline checksums for ${toBaseline.length} existing migration(s).`);
    }

    for (const migration of pending) {
      console.log(`--> [${migration.version}] ${migration.name}...`);
      if (dryRun) {
        console.log(`    [DRY RUN] Would execute ${migration.sql.length} bytes (sha256: ${migration.checksum.slice(0, 12)}...)`);
        continue;
      }

      const startTime = Date.now();
      if (migration.nonTransactional) {
        await client.query(migration.sql);
        await client.query(
          `INSERT INTO supabase_migrations.schema_migrations (version, name, statements, checksum)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (version) DO UPDATE
             SET name = EXCLUDED.name, statements = EXCLUDED.statements, checksum = EXCLUDED.checksum;`,
          [migration.version, migration.name, [migration.sql], migration.checksum],
        );
      } else {
        await client.query('BEGIN;');
        try {
          await client.query(migration.sql);
          await client.query(
            `INSERT INTO supabase_migrations.schema_migrations (version, name, statements, checksum)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (version) DO UPDATE
               SET name = EXCLUDED.name, statements = EXCLUDED.statements, checksum = EXCLUDED.checksum;`,
            [migration.version, migration.name, [migration.sql], migration.checksum],
          );
          await client.query('COMMIT;');
        } catch (err) {
          await client.query('ROLLBACK;');
          console.error(`    ❌ FAILED at migration [${migration.version}] ${migration.name}`);
          throw err;
        }
      }
      newlyAppliedVersions.push(migration.version);
      console.log(`    ✅ Applied successfully in ${Date.now() - startTime}ms`);
    }

    if (!dryRun && verifySecurityInvariants) {
      await verifyPostMigrationInvariants(client);
    }

    return {
      totalFiles: localMigrations.length,
      alreadyApplied: appliedVersions.size,
      pendingCount: pending.length,
      appliedVersions: newlyAppliedVersions,
      baselinedVersions,
      dryRun,
    };
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1);', [MIGRATION_LOCK_ID]);
    } catch {
      // ignore unlock error on disconnect
    }
  }
}
