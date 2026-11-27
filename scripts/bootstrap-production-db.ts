import type { ClientConfig } from 'pg';
import pg from 'pg';
const { Client } = pg;
import fs from 'node:fs';
import path from 'node:path';
import {
  TARGET_STAGING_PROJECT_REF,
  FORBIDDEN_OLD_PROJECT_REF,
} from './bootstrap-staging-db.ts';

export interface ProductionBootstrapOptions {
  dryRun?: boolean;
  targetUrlAllowlist?: string[];
  connectionString?: string;
  confirmedProjectRef?: string;
  productionProjectRef?: string;
  stagingProjectRef?: string;
}

export function getExpectedProductionRef(options: {
  productionProjectRef?: string;
  stagingProjectRef?: string;
} = {}): string {
  const ref = (options.productionProjectRef ?? process.env.PRODUCTION_PROJECT_REF ?? '').trim();
  if (!ref) {
    throw new Error(
      'CONFIGURATION ERROR: PRODUCTION_PROJECT_REF is required and cannot be empty.',
    );
  }

  const forbiddenRefs = new Set<string>([
    TARGET_STAGING_PROJECT_REF,
    FORBIDDEN_OLD_PROJECT_REF,
  ]);
  const envStagingRef = (options.stagingProjectRef ?? process.env.STAGING_PROJECT_REF ?? '').trim();
  if (envStagingRef) {
    forbiddenRefs.add(envStagingRef);
  }

  if (forbiddenRefs.has(ref)) {
    throw new Error(
      `SECURITY ABORT: PRODUCTION_PROJECT_REF "${ref}" matches a staging or forbidden project ref.`,
    );
  }

  return ref;
}

export function parseProductionDatabaseUrl(
  rawUrl: string,
  options: {
    allowlist?: string[];
    confirmedProjectRef?: string;
    productionProjectRef?: string;
    stagingProjectRef?: string;
  } = {},
): ClientConfig {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error(
      'CONFIGURATION ERROR: PRODUCTION_DATABASE_URL is required and cannot be empty.',
    );
  }

  let url = trimmed;
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
  const expectedRef = getExpectedProductionRef({
    productionProjectRef: options.productionProjectRef,
    stagingProjectRef: options.stagingProjectRef,
  });

  // 1. Explicitly reject staging or deprecated project refs in URL/user/host
  const forbiddenRefs = [
    TARGET_STAGING_PROJECT_REF,
    FORBIDDEN_OLD_PROJECT_REF,
    (options.stagingProjectRef ?? process.env.STAGING_PROJECT_REF ?? '').trim(),
  ].filter(Boolean);

  for (const forbiddenRef of forbiddenRefs) {
    if (
      url.includes(forbiddenRef) ||
      parsed.username.includes(forbiddenRef) ||
      host.includes(forbiddenRef)
    ) {
      throw new Error(
        `SECURITY ABORT: Production connection string references staging/forbidden project ref "${forbiddenRef}". Expected production project ref "${expectedRef}".`,
      );
    }
  }

  // 2. Reject local database targets unless explicitly allowlisted in unit tests
  const customAllowlist = options.allowlist || [];
  if (isLocalHost && !customAllowlist.includes(host)) {
    throw new Error(
      `SECURITY ABORT: Refusing to run production bootstrap against local host "${host}".`,
    );
  }

  // 3. Safety guard: Reject transaction pooler port 6543 for DDL migrations
  if (port === 6543) {
    throw new Error(
      'CONFIGURATION ERROR: Port 6543 is a transaction-mode PgBouncer/Supavisor pooler and does NOT support DDL schema migrations or session advisory locks. Use the Session mode pooler on port 5432.',
    );
  }

  // 4. Require explicit --confirm-project-ref CLI argument matching PRODUCTION_PROJECT_REF
  const confirmedRef = options.confirmedProjectRef?.trim();
  if (!confirmedRef || confirmedRef !== expectedRef) {
    throw new Error(
      `SECURITY CONFIRMATION REQUIRED: Target is production host (${host}). You must explicitly provide --confirm-project-ref ${expectedRef} to proceed.`,
    );
  }

  // 5. Host and user tenant validation (Session mode pooler or direct Supabase host on port 5432)
  const expectedDirectHost = `db.${expectedRef}.supabase.co`;
  const isDirectAllowed = host === expectedDirectHost && port === 5432;
  const isPoolerHost = host.endsWith('.pooler.supabase.com');
  const isExpectedPoolerUser = parsed.username === `postgres.${expectedRef}`;

  if (isPoolerHost) {
    if (!isExpectedPoolerUser) {
      throw new Error(
        `SECURITY ABORT: Pooler tenant mismatch. Connected user is "${parsed.username}", but expected user for production session pooler is "postgres.${expectedRef}".`,
      );
    }
    if (port !== 5432) {
      throw new Error(
        `SECURITY ABORT: Production pooler must connect via Session Mode on port 5432. Found port ${port}.`,
      );
    }
  } else if (!isDirectAllowed && !customAllowlist.includes(host)) {
    throw new Error(
      `SECURITY ABORT: Host "${host}" is not permitted. Only production session pooler (*.pooler.supabase.com:5432 with user "postgres.${expectedRef}") or direct host (${expectedDirectHost}:5432) is allowed.`,
    );
  }

  // 6. TLS Certificate Configuration (always strict for production)
  if (process.env.DB_ALLOW_INSECURE_TLS === 'true') {
    throw new Error('FATAL: DB_ALLOW_INSECURE_TLS is forbidden in production.');
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

export async function runProductionBootstrap(
  options: ProductionBootstrapOptions = {},
): Promise<void> {
  const isDryRun = options.dryRun ?? process.argv.includes('--dry-run');

  // Parse --confirm-project-ref <ref> from command line args if present
  let cliConfirmedRef = options.confirmedProjectRef;
  const confirmArgIdx = process.argv.indexOf('--confirm-project-ref');
  if (confirmArgIdx !== -1 && process.argv[confirmArgIdx + 1]) {
    cliConfirmedRef = process.argv[confirmArgIdx + 1];
  }

  const connectionString =
    options.connectionString ?? process.env.PRODUCTION_DATABASE_URL ?? '';

  const config = parseProductionDatabaseUrl(connectionString, {
    allowlist: options.targetUrlAllowlist,
    confirmedProjectRef: cliConfirmedRef,
    productionProjectRef: options.productionProjectRef,
    stagingProjectRef: options.stagingProjectRef,
  });

  console.log(`========================================================================`);
  console.log(`🚀 PRODUCTION DATABASE BOOTSTRAP RUNNER`);
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
        'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version ASC;',
      );
      appliedVersions = new Set(appliedRes.rows.map((r) => r.version));
    } else if (!isDryRun) {
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

    // 3. Discover local migrations in canonical supabase/migrations directory
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
      console.log('✅ Production database is already up to date. Zero migrations pending.');
      return;
    }

    // 4. Execute pending migrations sequentially
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
          [version, name, [sqlContent]],
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
    console.log(`🎉 ALL PENDING PRODUCTION MIGRATIONS APPLIED SUCCESSFULLY`);
    console.log(`========================================================================\n`);
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock_all();');
    } catch {
      // ignore unlock error on disconnect
    }
    await client.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith('bootstrap-production-db.ts')) {
  runProductionBootstrap().catch((err: unknown) => {
    console.error('\n❌ Production bootstrap runner failed with error:');
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
