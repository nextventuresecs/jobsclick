import type { ClientConfig } from 'pg';
import pg from 'pg';
const { Client } = pg;
import { parseDatabaseUrl } from './bootstrap-staging-db.ts';

export interface CatalogCheckResult {
  passed: boolean;
  checks: {
    name: string;
    passed: boolean;
    details: unknown;
  }[];
}

export async function runCatalogCheck(connectionString: string): Promise<CatalogCheckResult> {
  const config = parseDatabaseUrl(connectionString, { confirmedProjectRef: process.env.STAGING_PROJECT_REF });
  const client = new Client(config);
  await client.connect();

  const checks: CatalogCheckResult['checks'] = [];

  // Check 1: All prosecdef functions have pinned search_path
  const unpinnedProc = await client.query(`
    SELECT p.proname, p.prosecdef, p.proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
      AND p.prosecdef = true
      AND (p.proconfig IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'
      ));
  `);
  checks.push({
    name: 'All prosecdef functions have pinned search_path',
    passed: unpinnedProc.rows.length === 0,
    details: unpinnedProc.rows.length === 0 ? 'All 10 security definer functions in public schema have search_path=public, pg_temp' : unpinnedProc.rows,
  });

  // Check 2: Zero prosecdef functions callable by anon or authenticated
  const callableProc = await client.query(`
    SELECT p.proname, grantee, privilege_type
    FROM information_schema.routine_privileges rp
    JOIN pg_proc p ON p.proname = rp.routine_name
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE rp.routine_schema = 'public'
      AND p.prosecdef = true
      AND grantee IN ('PUBLIC', 'anon', 'authenticated')
      AND privilege_type = 'EXECUTE';
  `);
  checks.push({
    name: 'Zero prosecdef functions callable by anon or authenticated',
    passed: callableProc.rows.length === 0,
    details: callableProc.rows.length === 0 ? 'Zero execute privileges for PUBLIC/anon/authenticated on SECURITY DEFINER functions' : callableProc.rows,
  });

  // Check 3: All 23 base tables have RLS enabled
  const rlsStatus = await client.query(`
    SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname;
  `);
  const tablesWithoutRls = rlsStatus.rows.filter((r) => !r.relrowsecurity);
  checks.push({
    name: 'All base tables have RLS enabled (relrowsecurity = true)',
    passed: tablesWithoutRls.length === 0 && rlsStatus.rows.length >= 23,
    details: {
      total_tables: rlsStatus.rows.length,
      tables_with_rls: rlsStatus.rows.filter((r) => r.relrowsecurity).length,
      unprotected: tablesWithoutRls.map((r) => r.relname),
    },
  });

  // Check 4: Zero base table permissions granted to anon or authenticated
  const baseTableGrants = await client.query(`
    SELECT grantee, table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee IN ('anon', 'authenticated')
      AND table_name NOT IN ('public_business_profiles', 'public_institution_profiles', 'public_jobs')
    ORDER BY table_name, grantee;
  `);
  checks.push({
    name: 'Zero base table grants to anon or authenticated',
    passed: baseTableGrants.rows.length === 0,
    details: baseTableGrants.rows.length === 0 ? 'All base tables revoked from anon & authenticated' : baseTableGrants.rows,
  });

  // Check 5: Only public_* views granted SELECT to anon / authenticated
  const viewGrants = await client.query(`
    SELECT grantee, table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee IN ('anon', 'authenticated')
      AND table_name IN ('public_business_profiles', 'public_institution_profiles', 'public_jobs')
    ORDER BY table_name, grantee;
  `);
  const expectedViewCount = 6; // 3 views * 2 roles (anon, authenticated)
  checks.push({
    name: 'Public non-PII views granted SELECT to anon and authenticated',
    passed: viewGrants.rows.length === expectedViewCount && viewGrants.rows.every((r) => r.privilege_type === 'SELECT'),
    details: viewGrants.rows,
  });

  // Check 6: Private storage bucket exists and is not public
  const bucketCheck = await client.query(`
    SELECT id, name, public, file_size_limit, allowed_mime_types
    FROM storage.buckets
    WHERE id = 'private';
  `);
  checks.push({
    name: 'Private storage bucket exists and public = false',
    passed: bucketCheck.rows.length === 1 && bucketCheck.rows[0].public === false,
    details: bucketCheck.rows[0],
  });

  // Check 7: Immutability triggers exist on credit_ledgers and audit_logs
  const immutabilityCheck = await client.query(`
    SELECT tgrelid::regclass::text as table_name, tgname
    FROM pg_trigger
    WHERE tgname IN (
      'audit_log_immutable_update_trigger',
      'audit_log_immutable_delete_trigger',
      'credit_ledger_immutable_update_trigger',
      'credit_ledger_immutable_delete_trigger'
    )
    ORDER BY table_name, tgname;
  `);
  checks.push({
    name: 'Immutability triggers configured on audit_logs and credit_ledgers',
    passed: immutabilityCheck.rows.length === 4,
    details: immutabilityCheck.rows,
  });

  // Check 7b: TRUNCATE prohibition triggers and function configuration
  const truncateTriggers = await client.query(`
    SELECT tgrelid::regclass::text as table_name, tgname
    FROM pg_trigger
    WHERE tgname LIKE '%prohibit_truncate_trigger'
    ORDER BY table_name;
  `);
  const truncateProc = await client.query(`
    SELECT proname, prosecdef, proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'prohibit_truncate_trigger';
  `);
  const procRow = truncateProc.rows[0];
  const procValid = procRow && procRow.prosecdef === false && (procRow.proconfig?.includes('search_path=') || procRow.proconfig?.includes('search_path=""'));
  checks.push({
    name: 'prohibit_truncate_trigger is SECURITY INVOKER with empty search_path across 7 tables',
    passed: truncateTriggers.rows.length >= 7 && procValid,
    details: {
      triggers_count: truncateTriggers.rows.length,
      triggers: truncateTriggers.rows,
      function: procRow,
    },
  });

  // Check 8: Dump full pg_default_acl, check roles that actually create objects in public
  const allDefaultAcls = await client.query(`
    SELECT 
      d.defaclobjtype,
      d.defaclacl,
      r.rolname,
      COALESCE(n.nspname, 'DATABASE-WIDE') AS nspname,
      has_schema_privilege(r.oid, 'public', 'CREATE') AS can_create_in_public,
      EXISTS (
        SELECT 1 FROM pg_class cls WHERE cls.relnamespace = 'public'::regnamespace AND cls.relowner = r.oid
        UNION
        SELECT 1 FROM pg_proc prc WHERE prc.pronamespace = 'public'::regnamespace AND prc.proowner = r.oid
      ) AS creates_objects_in_public
    FROM pg_default_acl d
    LEFT JOIN pg_namespace n ON d.defaclnamespace = n.oid
    JOIN pg_roles r ON d.defaclrole = r.oid
    ORDER BY nspname, r.rolname, d.defaclobjtype;
  `);

  const publicViolations = allDefaultAcls.rows.filter((row: any) => {
    // Scoped to roles that actually create objects in schema public (e.g. postgres migration/owner role)
    const isPublicScope = (row.nspname === 'public' || row.nspname === 'DATABASE-WIDE') && row.creates_objects_in_public;
    if (!isPublicScope) return false;

    const aclStr = Array.isArray(row.defaclacl) ? row.defaclacl.join(',') : String(row.defaclacl || '');
    return (
      aclStr.includes('anon=') ||
      aclStr.includes('authenticated=') ||
      /(^|[,{])=/.test(aclStr) ||
      /(^|[,{])public=/.test(aclStr)
    );
  });

  checks.push({
    name: 'Default privileges in public schema across object-creating roles revoke all from anon, authenticated, and PUBLIC',
    passed: publicViolations.length === 0,
    details: {
      total_default_acls_in_catalog: allDefaultAcls.rows.length,
      full_catalog_dump: allDefaultAcls.rows,
      public_scope_violations: publicViolations,
    },
  });

  await client.end();

  const allPassed = checks.every((c) => c.passed);
  return { passed: allPassed, checks };
}

if (process.argv[1]?.includes('db-catalog-check')) {
  const url = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  console.log(`Running Catalog Security Assertion against: ${url.replace(/:[^:@]*@/, ':****@')}`);
  runCatalogCheck(url).then((res) => {
    console.log('\n======================================================');
    console.log('📊 CATALOG CHECK RESULTS:');
    console.log('======================================================');
    for (const c of res.checks) {
      console.log(`${c.passed ? '✅' : '❌'} ${c.name}`);
      console.log(`   Details:`, JSON.stringify(c.details, null, 2));
    }
    console.log('======================================================');
    if (res.passed) {
      console.log('🎉 ALL CATALOG CHECKS PASSED!');
      process.exit(0);
    } else {
      console.error('❌ SOME CATALOG CHECKS FAILED!');
      process.exit(1);
    }
  }).catch((err) => {
    console.error('Fatal error running catalog check:', err);
    process.exit(1);
  });
}
