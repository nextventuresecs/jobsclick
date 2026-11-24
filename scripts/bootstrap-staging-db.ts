import type { ClientConfig } from 'pg';
import pg from 'pg';
const { Client } = pg;
import fs from 'node:fs';
import path from 'node:path';

export interface BootstrapOptions {
  dryRun?: boolean;
  targetUrlAllowlist?: string[];
  connectionString?: string;
  confirmedProjectRef?: string;
  stagingProjectRef?: string;
}

export const TARGET_STAGING_PROJECT_REF = 'afxgvtfaofpnlhdsexnp';
export const FORBIDDEN_OLD_PROJECT_REF = 'aspahsnclunutwiqliau';

export function getExpectedStagingRef(): string {
  return (process.env.STAGING_PROJECT_REF || TARGET_STAGING_PROJECT_REF).trim();
}

export function parseDatabaseUrl(
  rawUrl: string,
  options: {
    allowlist?: string[];
    confirmedProjectRef?: string;
    stagingProjectRef?: string;
  } = {}
): ClientConfig {
  let url = rawUrl.trim();
  if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
    url = url.slice(1, -1);
  }

  // Pre-normalize URL if password contains unencoded special characters (e.g. '/', '<', '>')
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    const protoMatch = url.match(/^([^:]+):\/\//);
    if (protoMatch) {
      const scheme = protoMatch[1];
      const remainder = url.slice(protoMatch[0].length);
      const atIdx = remainder.lastIndexOf('@');
      if (atIdx !== -1) {
        const auth = remainder.slice(0, atIdx);
        const hostPath = remainder.slice(atIdx + 1);
        const colonIdx = auth.indexOf(':');
        if (colonIdx !== -1) {
          const user = auth.slice(0, colonIdx);
          const rawPass = auth.slice(colonIdx + 1);
          parsed = new URL(`${scheme}://${user}:${encodeURIComponent(rawPass)}@${hostPath}`);
        } else {
          throw new Error('Invalid database URL format');
        }
      } else {
        throw new Error('Invalid database URL format');
      }
    } else {
      throw new Error('Invalid database URL format');
    }
  }
  const host = parsed.hostname;
  const port = parseInt(parsed.port || '5432', 10);
  const isLocalHost = host === '127.0.0.1' || host === 'localhost';

  const expectedRef = options.stagingProjectRef || getExpectedStagingRef();

  // 1. Explicitly reject forbidden old project reference
  if (
    url.includes(FORBIDDEN_OLD_PROJECT_REF) ||
    parsed.username.includes(FORBIDDEN_OLD_PROJECT_REF) ||
    host.includes(FORBIDDEN_OLD_PROJECT_REF)
  ) {
    throw new Error(
      `SECURITY ABORT: Connection string references deprecated/forbidden staging project ref "${FORBIDDEN_OLD_PROJECT_REF}". Target staging project ref must be "${expectedRef}".`
    );
  }

  // 2. Safety guard: Reject transaction pooler port 6543 for DDL migrations
  if (port === 6543) {
    throw new Error(
      `CONFIGURATION ERROR: Port 6543 is a transaction-mode PgBouncer/Supavisor pooler and does NOT support DDL schema migrations or session advisory locks. Please use direct connection or session pooler on port 5432.`
    );
  }

  if (!isLocalHost) {
    // 3. Confirm project ref CLI argument for remote staging
    const confirmedRef = options.confirmedProjectRef;
    if (!confirmedRef || confirmedRef !== expectedRef) {
      throw new Error(
        `SECURITY CONFIRMATION REQUIRED: Target is a remote host (${host}). You must explicitly provide --confirm-project-ref ${expectedRef} to proceed.`
      );
    }

    // 4. Host and user tenant validation
    const expectedDirectHost = `db.${expectedRef}.supabase.co`;
    const isDirectAllowed = host === expectedDirectHost;
    const isPoolerHost = host.endsWith('.pooler.supabase.com');
    const isExpectedPoolerUser = parsed.username === `postgres.${expectedRef}`;

    if (isPoolerHost) {
      if (!isExpectedPoolerUser) {
        throw new Error(
          `SECURITY ABORT: Pooler tenant mismatch. Connected user is "${parsed.username}", but expected user for staging pooler is "postgres.${expectedRef}".`
        );
      }
      if (port !== 5432) {
        throw new Error(
          `SECURITY ABORT: Staging pooler must connect via Session Mode on port 5432. Found port ${port}.`
        );
      }
    } else if (!isDirectAllowed) {
      const customAllowlist = options.allowlist || [];
      if (!customAllowlist.includes(host)) {
        throw new Error(
          `SECURITY ABORT: Host "${host}" is not permitted. Only project ref "${expectedRef}" direct host (${expectedDirectHost}) or session pooler on port 5432 with user "postgres.${expectedRef}" is allowed.`
        );
      }
    }
  }

  // 5. TLS Certificate Configuration
  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
  const isStrictEnv = nodeEnv !== 'development' && nodeEnv !== 'test';

  if (isStrictEnv && process.env.DB_ALLOW_INSECURE_TLS === 'true') {
    throw new Error('FATAL: DB_ALLOW_INSECURE_TLS is forbidden in production/staging.');
  }

  let sslConfig: boolean | { rejectUnauthorized: boolean; ca?: string } = false;

  if (!isLocalHost) {
    let caCert: string | undefined;
    const caPathOrValue = process.env.SUPABASE_CA_CERT;
    if (caPathOrValue) {
      if (fs.existsSync(caPathOrValue)) {
        caCert = fs.readFileSync(caPathOrValue, 'utf8');
      } else if (caPathOrValue.includes('BEGIN CERTIFICATE')) {
        caCert = caPathOrValue;
      }
    }

    sslConfig = {
      rejectUnauthorized: true,
      ...(caCert ? { ca: caCert } : {}),
    };
  }

  return {
    connectionString: parsed.toString(),
    host,
    port,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.slice(1) || 'postgres',
    ssl: sslConfig,
    statement_timeout: 60000,
    query_timeout: 60000,
    connectionTimeoutMillis: 10000,
  };
}

export async function runBootstrap(options: BootstrapOptions = {}): Promise<void> {
  const isDryRun = options.dryRun ?? process.argv.includes('--dry-run');

  // Parse --confirm-project-ref <ref> from command line args if present
  let cliConfirmedRef = options.confirmedProjectRef;
  const confirmArgIdx = process.argv.indexOf('--confirm-project-ref');
  if (confirmArgIdx !== -1 && process.argv[confirmArgIdx + 1]) {
    cliConfirmedRef = process.argv[confirmArgIdx + 1];
  }

  const connectionString =
    options.connectionString ||
    process.env.STAGING_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

  const config = parseDatabaseUrl(connectionString, {
    allowlist: options.targetUrlAllowlist,
    confirmedProjectRef: cliConfirmedRef,
    stagingProjectRef: options.stagingProjectRef,
  });

  console.log(`========================================================================`);
  console.log(`🚀 DATABASE BOOTSTRAP RUNNER (Phase 1.2 DB Hardening)`);
  console.log(`Target: ${config.host}:${config.port}`);
  console.log(`Dry-Run: ${isDryRun ? 'YES (No writes will occur)' : 'NO (Live DDL execution)'}`);
  console.log(`========================================================================\n`);

  const client = new Client(config);
  await client.connect();

  try {
    // 1. Acquire advisory lock to prevent concurrent migration runs
    const MIGRATION_LOCK_ID = 742941842;
    await client.query('SELECT pg_advisory_lock($1);', [MIGRATION_LOCK_ID]);

    // Set safety timeouts
    await client.query("SET lock_timeout = '10s';");
    await client.query("SET statement_timeout = '60s';");

    // 2. Read migration history if schema_migrations exists, without creating it in dry-run mode
    const tableCheckRes = await client.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
      ) AS exists;
    `);
    const schemaMigrationsExists = tableCheckRes.rows[0]?.exists === true;

    let appliedVersions = new Set<string>();

    if (schemaMigrationsExists) {
      const appliedRes = await client.query<{ version: string }>(
        'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version ASC;'
      );
      appliedVersions = new Set(appliedRes.rows.map((r) => r.version));
    } else if (!isDryRun) {
      // Ensure schema_migrations table exists in live run
      await client.query(`
        CREATE SCHEMA IF NOT EXISTS supabase_migrations;
        CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
          version text PRIMARY KEY,
          statements text[],
          name text
        );
      `);
    } else {
      console.log('ℹ️  [DRY RUN] supabase_migrations schema does not exist yet (zero writes performed).');
    }

    // 4. Discover local migrations in canonical supabase/migrations directory
    const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Missing canonical migrations directory: ${migrationsDir}`);
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    console.log(`Found ${files.length} total migration files.`);
    console.log(`Already applied: ${appliedVersions.size}`);

    const pendingFiles = files.filter((f) => {
      const match = f.match(/^(\d{14})_(.*)\.sql$/);
      if (!match) return false;
      const version = match[1];
      return !appliedVersions.has(version);
    });

    console.log(`Pending execution: ${pendingFiles.length}\n`);

    if (pendingFiles.length === 0) {
      console.log('✅ Database is already up to date. Zero migrations pending.');
      return;
    }

    // 5. Execute pending migrations sequentially
    for (const file of pendingFiles) {
      const match = file.match(/^(\d{14})_(.*)\.sql$/)!;
      const version = match[1];
      const name = match[2];
      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');

      console.log(`--> [${version}] ${name}...`);

      if (isDryRun) {
        console.log(`    [DRY RUN] Would execute ${sqlContent.length} bytes`);
        continue;
      }

      const startTime = Date.now();
      await client.query('BEGIN;');
      try {
        await client.query(sqlContent);
        await client.query(
          `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
           VALUES ($1, $2, $3)
           ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name, statements = EXCLUDED.statements;`,
          [version, name, [sqlContent]]
        );
        await client.query('COMMIT;');
        const duration = Date.now() - startTime;
        console.log(`    ✅ Applied successfully in ${duration}ms`);
      } catch (err) {
        await client.query('ROLLBACK;');
        console.error(`    ❌ FAILED at migration [${version}] ${name}`);
        throw err;
      }
    }

    console.log(`\n========================================================================`);
    console.log(`🎉 ALL PENDING MIGRATIONS APPLIED SUCCESSFULLY`);
    console.log(`========================================================================\n`);
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock_all();');
    } catch {}
    await client.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith('bootstrap-staging-db.ts')) {
  runBootstrap().catch((err) => {
    console.error('\n❌ Bootstrap runner failed with error:');
    console.error(err.message || err);
    process.exit(1);
  });
}
