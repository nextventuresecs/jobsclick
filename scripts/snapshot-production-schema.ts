import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseProductionDatabaseUrl } from './bootstrap-production-db.ts';
import { sanitizeErrorMessage } from './common/db-url.ts';

export interface SnapshotOptions {
  outputFile: string;
  connectionString?: string;
  productionProjectRef?: string;
  stagingProjectRef?: string;
  confirmedProjectRef?: string;
  runner?: (file: string, args: string[], env: NodeJS.ProcessEnv) => void;
}

export function snapshotProductionSchema(options: SnapshotOptions): void {
  const connectionString = options.connectionString ?? process.env.PRODUCTION_DATABASE_URL ?? '';
  const confirmedRef =
    options.confirmedProjectRef ??
    options.productionProjectRef ??
    process.env.PRODUCTION_PROJECT_REF ??
    '';

  const config = parseProductionDatabaseUrl(connectionString, {
    confirmedProjectRef: confirmedRef,
    productionProjectRef: options.productionProjectRef,
    stagingProjectRef: options.stagingProjectRef,
  });

  const ssl = config.ssl;
  if (typeof ssl !== 'object' || ssl === null || ssl.rejectUnauthorized !== true || !ssl.ca) {
    throw new Error('SECURITY ABORT: Strict TLS with valid CA certificate is required for schema snapshot.');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prod-schema-ca-'));
  const caFile = path.join(tempDir, 'supabase-ca.crt');

  try {
    fs.writeFileSync(caFile, String(ssl.ca), { mode: 0o600 });

    const dumpEnv: NodeJS.ProcessEnv = {
      ...process.env,
      PGSSLMODE: 'verify-full',
      PGSSLROOTCERT: caFile,
    };
    delete dumpEnv.NODE_TLS_REJECT_UNAUTHORIZED;

    const runner =
      options.runner ??
      ((file, args, env) => {
        execFileSync(file, args, { env, stdio: 'inherit' });
      });

    runner('supabase', ['db', 'dump', '--db-url', config.connectionString ?? connectionString, '-f', options.outputFile], dumpEnv);

    if (!fs.existsSync(options.outputFile) || fs.statSync(options.outputFile).size === 0) {
      throw new Error(`Snapshot output file "${options.outputFile}" was not created or is empty.`);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && process.argv[1].endsWith('snapshot-production-schema.ts')) {
  const outIdx = process.argv.indexOf('-f');
  const outputFile = outIdx !== -1 && process.argv[outIdx + 1] ? process.argv[outIdx + 1] : '';
  if (!outputFile) {
    console.error('Usage: snapshot-production-schema.ts -f <output-file>');
    process.exit(1);
  }

  try {
    snapshotProductionSchema({ outputFile });
    console.log(`✅ Production schema snapshot written to ${outputFile} with strict TLS (verify-full).`);
  } catch (err: unknown) {
    console.error('❌ Production schema snapshot failed:', sanitizeErrorMessage(err));
    process.exit(1);
  }
}
