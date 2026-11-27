import type { ClientConfig } from 'pg';
import {
  FORBIDDEN_OLD_PROJECT_REF,
  TARGET_STAGING_PROJECT_REF,
  createValidatedPgClient,
  parseAndValidateDbUrl,
  sanitizeErrorMessage,
} from './common/db-url.ts';
import { runMigrationRunner } from './common/migration-runner.ts';

export { TARGET_STAGING_PROJECT_REF, FORBIDDEN_OLD_PROJECT_REF };

export interface BootstrapOptions {
  dryRun?: boolean;
  targetUrlAllowlist?: string[];
  connectionString?: string;
  confirmedProjectRef?: string;
  stagingProjectRef?: string;
  productionProjectRef?: string;
  baselineChecksums?: boolean;
  allowNonTransactional?: boolean;
  verifySecurityInvariants?: boolean;
  migrationsDir?: string;
}

export function getExpectedStagingRef(options: {
  stagingProjectRef?: string;
  productionProjectRef?: string;
} = {}): string {
  const ref = (options.stagingProjectRef ?? process.env.STAGING_PROJECT_REF ?? TARGET_STAGING_PROJECT_REF).trim();
  if (!ref) {
    throw new Error('CONFIGURATION ERROR: STAGING_PROJECT_REF cannot be empty.');
  }

  const prodRef = (options.productionProjectRef ?? process.env.PRODUCTION_PROJECT_REF ?? '').trim();
  if (ref === FORBIDDEN_OLD_PROJECT_REF || (prodRef && ref === prodRef)) {
    throw new Error(
      `SECURITY ABORT: STAGING_PROJECT_REF "${ref}" matches a forbidden or production project ref.`,
    );
  }

  return ref;
}

export function parseDatabaseUrl(
  rawUrl: string,
  options: {
    allowlist?: string[];
    confirmedProjectRef?: string;
    stagingProjectRef?: string;
    productionProjectRef?: string;
    allowLocalhost?: boolean;
  } = {},
): ClientConfig {
  const expectedRef = getExpectedStagingRef({
    stagingProjectRef: options.stagingProjectRef,
    productionProjectRef: options.productionProjectRef,
  });

  const prodRef = (options.productionProjectRef ?? process.env.PRODUCTION_PROJECT_REF ?? '').trim();
  const forbiddenRefs = [FORBIDDEN_OLD_PROJECT_REF, prodRef].filter(Boolean);

  return parseAndValidateDbUrl(rawUrl, {
    environment: 'staging',
    expectedProjectRef: expectedRef,
    confirmedProjectRef: options.confirmedProjectRef,
    forbiddenProjectRefs: forbiddenRefs,
    allowlist: options.allowlist,
    allowLocalhost: options.allowLocalhost,
  });
}

function getCliArgValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return undefined;
}

export async function runBootstrap(options: BootstrapOptions = {}): Promise<void> {
  const isDryRun = options.dryRun ?? process.argv.includes('--dry-run');
  const baselineChecksums = options.baselineChecksums ?? process.argv.includes('--baseline-checksums');
  const allowNonTransactional =
    options.allowNonTransactional ?? process.argv.includes('--allow-non-transactional');
  const cliConfirmedRef = options.confirmedProjectRef ?? getCliArgValue('--confirm-project-ref');

  const connectionString = options.connectionString ?? process.env.STAGING_DATABASE_URL ?? '';
  if (!connectionString.trim()) {
    throw new Error(
      'CONFIGURATION ERROR: STAGING_DATABASE_URL is required and cannot be empty (no fallback to DATABASE_URL or localhost).',
    );
  }

  const config = parseDatabaseUrl(connectionString, {
    allowlist: options.targetUrlAllowlist,
    confirmedProjectRef: cliConfirmedRef,
    stagingProjectRef: options.stagingProjectRef,
    productionProjectRef: options.productionProjectRef,
  });

  console.log('========================================================================');
  console.log('🚀 STAGING DATABASE BOOTSTRAP RUNNER');
  console.log(`Target: ${config.host}:${config.port}`);
  console.log(`Dry-Run: ${isDryRun ? 'YES (No writes will occur)' : 'NO (Live DDL execution)'}`);
  console.log('========================================================================\n');

  const client = createValidatedPgClient(config);
  await client.connect();

  try {
    const summary = await runMigrationRunner({
      client,
      migrationsDir: options.migrationsDir,
      dryRun: isDryRun,
      baselineChecksums,
      allowNonTransactional,
      verifySecurityInvariants: options.verifySecurityInvariants ?? true,
      label: 'staging',
    });

    if (summary.pendingCount === 0) {
      console.log('✅ Staging database is already up to date. Zero migrations pending.');
    } else if (isDryRun) {
      console.log('\n✅ Staging dry-run preflight completed with zero writes.');
    } else {
      console.log('\n========================================================================');
      console.log('🎉 ALL PENDING STAGING MIGRATIONS APPLIED & VERIFIED');
      console.log('========================================================================\n');
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith('bootstrap-staging-db.ts')) {
  runBootstrap().catch((err: unknown) => {
    console.error('\n❌ Staging bootstrap runner failed with error:');
    console.error(sanitizeErrorMessage(err));
    process.exit(1);
  });
}
