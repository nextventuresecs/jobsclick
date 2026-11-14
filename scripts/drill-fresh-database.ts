import pg from 'pg';
const { Client } = pg;
import { runBootstrap } from './bootstrap-staging-db.ts';
import { runCatalogCheck } from './db-catalog-check.ts';
import { runSecurityDrill } from './db-security-drill.ts';
import { assertLocalhostOnly } from './common/host-guard.ts';

export async function drillFreshDatabase(customMasterConn?: string) {
  const masterConn = customMasterConn || process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  const drillDbName = 'bootstrap_drill_empty';
  
  assertLocalhostOnly(masterConn, 'Fresh Bootstrap Drill (DROP/CREATE DATABASE)');

  const drillConn = masterConn.replace(/\/[^/]*$/, `/${drillDbName}`);
  assertLocalhostOnly(drillConn, 'Fresh Bootstrap Drill (Target DB)');

  const masterClient = new Client({ connectionString: masterConn });
  await masterClient.connect();

  console.log(`\n========================================================================`);
  console.log(`🧹 STEP 1: Provisioning completely fresh empty database: ${drillDbName}`);
  console.log(`========================================================================`);
  await masterClient.query(`DROP DATABASE IF EXISTS ${drillDbName} WITH (FORCE);`);
  await masterClient.query(`CREATE DATABASE ${drillDbName};`);
  await masterClient.end();
  console.log(`✅ Database ${drillDbName} created.\n`);

  console.log(`========================================================================`);
  console.log(`🚀 STEP 2: Running Fresh Bootstrap against empty database (all 33 migrations)`);
  console.log(`========================================================================`);
  
  // Initialize Supabase platform schemas if running on scratch bare postgres
  const prepClient = new Client({ connectionString: drillConn });
  await prepClient.connect();
  await prepClient.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE TABLE IF NOT EXISTS storage.buckets (
      id text PRIMARY KEY,
      name text NOT NULL,
      owner uuid,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      public boolean DEFAULT false,
      avif_autodetection boolean DEFAULT false,
      file_size_limit bigint,
      allowed_mime_types text[],
      owner_id text
    );
  `);
  await prepClient.end();

  await runBootstrap({ connectionString: drillConn });

  console.log(`\n========================================================================`);
  console.log(`📊 STEP 3: Running Catalog Security Assertion against fresh database`);
  console.log(`========================================================================`);
  const catRes = await runCatalogCheck(drillConn);
  console.log(`Catalog Check Passed: ${catRes.passed ? 'YES ✅' : 'NO ❌'}`);
  for (const c of catRes.checks) {
    console.log(`  ${c.passed ? '✅' : '❌'} ${c.name}`);
  }
  if (!catRes.passed) {
    throw new Error('Catalog check failed on fresh database!');
  }

  console.log(`\n========================================================================`);
  console.log(`🛡️ STEP 4: Running Extended Security & Attack Suite against fresh database`);
  console.log(`========================================================================`);
  const drillRes = await runSecurityDrill(drillConn);
  console.log(`Security Drill Passed: ${drillRes.success ? 'YES ✅' : 'NO ❌'}`);
  for (const r of drillRes.results) {
    console.log(`  ${r.passed ? '✅' : '❌'} ${r.name}`);
  }
  if (!drillRes.success) {
    throw new Error('Security drill failed on fresh database!');
  }

  console.log(`\n========================================================================`);
  console.log(`🔁 STEP 5: Re-running Bootstrap Runner to verify NO-OP Idempotency`);
  console.log(`========================================================================`);
  await runBootstrap({ connectionString: drillConn });

  console.log(`\n========================================================================`);
  console.log(`🧹 STEP 6: Teardown fresh drill database`);
  console.log(`========================================================================`);
  const teardownClient = new Client({ connectionString: masterConn });
  await teardownClient.connect();
  await teardownClient.query(`DROP DATABASE IF EXISTS ${drillDbName} WITH (FORCE);`);
  await teardownClient.end();
  console.log(`✅ Database ${drillDbName} cleanly dropped.\n`);

  console.log(`========================================================================`);
  console.log(`🎉 FRESH DATABASE BOOTSTRAP DRILL COMPLETED WITH 100% SUCCESS!`);
  console.log(`========================================================================\n`);
}

drillFreshDatabase().catch((err) => {
  console.error('Fresh database drill failed:', err);
  process.exit(1);
});
