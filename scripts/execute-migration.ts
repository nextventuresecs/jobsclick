import { Client, ClientConfig } from 'pg';
import fs from 'fs';
import path from 'path';

let directUrl = process.env.DIRECT_URL || '';
if ((directUrl.startsWith('"') && directUrl.endsWith('"')) || (directUrl.startsWith("'") && directUrl.endsWith("'"))) {
  directUrl = directUrl.slice(1, -1);
}

function parsePostgresUrl(urlStr: string): ClientConfig {
  const match = urlStr.match(/^postgres(?:ql)?:\/\/([^:]+):(.*)@([^:/]+)(?::(\d+))?\/([^?]+)(?:\?(.*))?$/);
  if (!match) throw new Error('Regex failed to match postgres URL structure');
  const [, user, rawPassword, host, portStr, database] = match;
  return {
    user: decodeURIComponent(user),
    password: rawPassword,
    host,
    port: portStr ? parseInt(portStr, 10) : 5432,
    database,
    ssl: { rejectUnauthorized: false }
  };
}

async function executeMigration() {
  const client = new Client(parsePostgresUrl(directUrl));
  await client.connect();

  console.log('========================================================================');
  console.log('🚀 TRANSACTIONAL MIGRATION EXECUTION: 20261026300000_get_user_credit_balance');
  console.log('========================================================================\n');

  try {
    console.log('[Step 1] Opening transactional boundary with strict timeouts...');
    await client.query('BEGIN;');
    await client.query("SET LOCAL lock_timeout = '2s';");
    await client.query("SET LOCAL statement_timeout = '30s';");

    console.log('[Step 2] Executing DDL: Creating get_user_credit_balance function...');
    const createFunctionStmt = `
CREATE OR REPLACE FUNCTION get_user_credit_balance(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT jsonb_build_object(
        'balance', COALESCE(SUM(amount), 0),
        'credits_added', COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0),
        'credits_used', COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0)
    )
    FROM credit_ledgers
    WHERE user_id = p_user_id AND p_user_id IS NOT NULL;
$$;
    `.trim();
    await client.query(createFunctionStmt);

    console.log('[Step 3] Applying security hardening and role grants...');
    const revokeStmt = `REVOKE ALL ON FUNCTION get_user_credit_balance(UUID) FROM PUBLIC;`;
    await client.query(revokeStmt);

    const grantStmt = `GRANT EXECUTE ON FUNCTION get_user_credit_balance(UUID) TO authenticated, service_role;`;
    await client.query(grantStmt);

    console.log('[Step 4] Recording migration in supabase_migrations.schema_migrations...');
    const recordMigrationStmt = `
      INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
      VALUES ($1, $2, $3)
      ON CONFLICT (version) DO UPDATE 
        SET statements = EXCLUDED.statements, name = EXCLUDED.name;
    `;
    await client.query(recordMigrationStmt, [
      '20261026300000',
      [createFunctionStmt, revokeStmt, grantStmt],
      'get_user_credit_balance'
    ]);

    await client.query('COMMIT;');
    console.log('✅ Transaction committed successfully!\n');

    console.log('========================================================================');
    console.log('🔍 INDEPENDENT VERIFICATION & CATALOG REGISTRATION PROOF');
    console.log('========================================================================\n');

    // 1. Query pg_proc & information_schema.routines
    console.log('1. Querying pg_proc catalog:');
    const pgProcRes = await client.query(`
      SELECT 
        p.proname,
        pg_get_function_identity_arguments(p.oid) as arguments,
        p.prorettype::regtype as return_type,
        p.prosecdef as security_definer,
        p.provolatile as volatility,
        p.proconfig as configuration
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = 'get_user_credit_balance' AND n.nspname = 'public';
    `);
    console.table(pgProcRes.rows);

    console.log('2. Querying information_schema.routines catalog:');
    const infoSchemaRes = await client.query(`
      SELECT routine_name, routine_type, data_type, security_type
      FROM information_schema.routines
      WHERE routine_schema = 'public' AND routine_name = 'get_user_credit_balance';
    `);
    console.table(infoSchemaRes.rows);

    console.log('3. Querying schema_migrations registration:');
    const migRes = await client.query(`
      SELECT version, name, array_length(statements, 1) as statement_count
      FROM supabase_migrations.schema_migrations
      WHERE version = '20261026300000';
    `);
    console.table(migRes.rows);

    console.log('\n========================================================================');
    console.log('⚡ PERFORMANCE PROOF: EXPLAIN (ANALYZE, BUFFERS) AGAINST FIXTURE USER');
    console.log('========================================================================\n');

    const fixtureUserId = '00000000-0000-0000-0000-000000000001';

    console.log('A. Inner aggregate query index utilization proof:');
    const explainQuery = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT jsonb_build_object(
          'balance', COALESCE(SUM(amount), 0),
          'credits_added', COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0),
          'credits_used', COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0)
      )
      FROM credit_ledgers
      WHERE user_id = $1::uuid AND $1::uuid IS NOT NULL;
    `, [fixtureUserId]);
    console.log(explainQuery.rows.map(r => r['QUERY PLAN']).join('\n'));

    console.log('\nB. RPC Function execution proof:');
    const rpcRes = await client.query(`
      SELECT get_user_credit_balance($1::uuid) as balance_output;
    `, [fixtureUserId]);
    console.log('RPC execution output:', rpcRes.rows[0].balance_output);

    console.log('\nC. Parameter NULL handling proof:');
    const nullRes = await client.query(`
      SELECT get_user_credit_balance(NULL) as null_balance_output;
    `);
    console.log('RPC NULL output:', nullRes.rows[0].null_balance_output);

  } catch (err: any) {
    console.error('❌ MIGRATION FAILED - INITIATING ROLLBACK:', err);
    await client.query('ROLLBACK;').catch(() => {});
    process.exit(1);
  } finally {
    await client.end();
  }
}

executeMigration().catch(err => {
  console.error(err);
  process.exit(1);
});
