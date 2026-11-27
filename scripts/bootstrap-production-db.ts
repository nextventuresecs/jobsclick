import type { ClientConfig } from 'pg';
import {
  FORBIDDEN_OLD_PROJECT_REF,
  TARGET_STAGING_PROJECT_REF,
  createValidatedPgClient,
  parseAndValidateDbUrl,
  sanitizeErrorMessage,
} from './common/db-url.ts';
import { runMigrationRunner } from './common/migration-runner.ts';

export interface ProductionBootstrapOptions {
  dryRun?: boolean;
  targetUrlAllowlist?: string[];
  connectionString?: string;
  confirmedProjectRef?: string;
  productionProjectRef?: string;
  stagingProjectRef?: string;
  baselineChecksums?: boolean;
  allowNonTransactional?: boolean;
  verifySecurityInvariants?: boolean;
  migrationsDir?: string;
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

  const expectedRef = getExpectedProductionRef({
    productionProjectRef: options.productionProjectRef,
    stagingProjectRef: options.stagingProjectRef,
  });

  const forbiddenRefs = [
    TARGET_STAGING_PROJECT_REF,
    FORBIDDEN_OLD_PROJECT_REF,
    (options.stagingProjectRef ?? process.env.STAGING_PROJECT_REF ?? '').trim(),
  ].filter(Boolean);

  return parseAndValidateDbUrl(trimmed, {
    environment: 'production',
    expectedProjectRef: expectedRef,
    confirmedProjectRef: options.confirmedProjectRef,
    forbiddenProjectRefs: forbiddenRefs,
    allowlist: options.allowlist,
    allowLocalhost: false,
  });
}

function getCliArgValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return undefined;
}

export async function runProductionBootstrap(
  options: ProductionBootstrapOptions = {},
): Promise<void> {
  const isDryRun = options.dryRun ?? process.argv.includes('--dry-run');
  const baselineChecksums = options.baselineChecksums ?? process.argv.includes('--baseline-checksums');
  const allowNonTransactional =
    options.allowNonTransactional ?? process.argv.includes('--allow-non-transactional');
  const cliConfirmedRef = options.confirmedProjectRef ?? getCliArgValue('--confirm-project-ref');

  const connectionString = options.connectionString ?? process.env.PRODUCTION_DATABASE_URL ?? '';

  const config = parseProductionDatabaseUrl(connectionString, {
    allowlist: options.targetUrlAllowlist,
    confirmedProjectRef: cliConfirmedRef,
    productionProjectRef: options.productionProjectRef,
    stagingProjectRef: options.stagingProjectRef,
  });

  console.log('========================================================================');
  console.log('🚀 PRODUCTION DATABASE BOOTSTRAP RUNNER');
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
      label: 'production',
    });

    if (summary.pendingCount === 0) {
      console.log('✅ Production database is already up to date. Zero migrations pending.');
    } else if (isDryRun) {
      console.log('\n✅ Production dry-run preflight completed with zero writes.');
    } else {
      console.log('\n========================================================================');
      console.log('🎉 ALL PENDING PRODUCTION MIGRATIONS APPLIED & VERIFIED');
      console.log('========================================================================\n');
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith('bootstrap-production-db.ts')) {
  runProductionBootstrap().catch((err: unknown) => {
    console.error('\n❌ Production bootstrap runner failed with error:');
    console.error(sanitizeErrorMessage(err));
    process.exit(1);
  });
}
