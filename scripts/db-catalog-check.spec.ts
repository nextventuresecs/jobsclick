import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

interface QueryResult {
  rows: Array<Record<string, unknown>>;
}

const mockQuery = vi.fn<(sql: string) => Promise<QueryResult>>();
const mockConnect = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockEnd = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

vi.mock('pg', () => {
  class MockClient {
    connect = mockConnect;
    query = mockQuery;
    end = mockEnd;
  }
  return { default: { Client: MockClient } };
});

import { runCatalogCheck } from './db-catalog-check.js';

function createBaselineQueryResponder(overrides?: {
  unpinnedProc?: Array<{ schema_name: string; proname: string; prosecdef: boolean; proconfig: unknown }>;
  callableProc?: Array<{ schema_name: string; proname: string; grantee: string; privilege_type: string }>;
  rlsTables?: Array<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>;
  baseTableGrants?: Array<{ grantee: string; table_name: string; privilege_type: string }>;
  viewGrants?: Array<{ grantee: string; table_name: string; privilege_type: string }>;
}) {
  const defaultRlsTables = Array.from({ length: 23 }, (_, idx) => ({
    relname: `table_${idx + 1}`,
    relrowsecurity: true,
    relforcerowsecurity: false,
  }));

  const defaultViewGrants = [
    { grantee: 'anon', table_name: 'public_business_profiles', privilege_type: 'SELECT' },
    { grantee: 'authenticated', table_name: 'public_business_profiles', privilege_type: 'SELECT' },
    { grantee: 'anon', table_name: 'public_jobs', privilege_type: 'SELECT' },
    { grantee: 'authenticated', table_name: 'public_jobs', privilege_type: 'SELECT' },
  ];

  return async (sql: string): Promise<QueryResult> => {
    if (sql.includes('p.proconfig') && !sql.includes('prohibit_truncate_trigger')) {
      return { rows: overrides?.unpinnedProc ?? [] };
    }
    if (sql.includes('information_schema.routine_privileges')) {
      return { rows: overrides?.callableProc ?? [] };
    }
    if (sql.includes("c.relkind = 'r'") && sql.includes('c.relrowsecurity')) {
      return { rows: overrides?.rlsTables ?? defaultRlsTables };
    }
    if (sql.includes("c.relkind = 'r'") && sql.includes('role_table_grants')) {
      return { rows: overrides?.baseTableGrants ?? [] };
    }
    if (sql.includes("c.relkind IN ('v', 'm')") && sql.includes('role_table_grants')) {
      return { rows: overrides?.viewGrants ?? defaultViewGrants };
    }
    if (sql.includes('FROM storage.buckets')) {
      return { rows: [{ id: 'private', name: 'private', public: false }] };
    }
    if (sql.includes('audit_log_immutable_update_trigger')) {
      return {
        rows: [
          { table_name: 'audit_logs', tgname: 'audit_log_immutable_update_trigger' },
          { table_name: 'audit_logs', tgname: 'audit_log_immutable_delete_trigger' },
          { table_name: 'credit_ledgers', tgname: 'credit_ledger_immutable_update_trigger' },
          { table_name: 'credit_ledgers', tgname: 'credit_ledger_immutable_delete_trigger' },
        ],
      };
    }
    if (sql.includes('%prohibit_truncate_trigger')) {
      return {
        rows: Array.from({ length: 7 }, (_, idx) => ({
          table_name: `t_${idx}`,
          tgname: `t_${idx}_prohibit_truncate_trigger`,
        })),
      };
    }
    if (sql.includes("p.proname = 'prohibit_truncate_trigger'")) {
      return { rows: [{ proname: 'prohibit_truncate_trigger', prosecdef: false, proconfig: ['search_path='] }] };
    }
    if (sql.includes('FROM pg_default_acl')) {
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL query in db-catalog-check test: ${sql}`);
  };
}

describe('ADR 0002 / #131 (AUTHZ-08): Deny-all RLS & Zero Table Grants Backstop (db:catalog:check)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes when all base tables have RLS enabled, anon/authenticated have zero base table grants, and only approved views are readable', async () => {
    mockQuery.mockImplementation(createBaselineQueryResponder());
    const result = await runCatalogCheck('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
    expect(result.passed).toBe(true);

    const grantsCheck = result.checks.find((c) => c.name === 'Zero base table grants to anon or authenticated');
    const rlsCheck = result.checks.find((c) => c.name === 'All base tables have RLS enabled (relrowsecurity = true)');
    const viewCheck = result.checks.find((c) => c.name === 'Public non-PII views granted SELECT to anon and authenticated');
    expect(grantsCheck?.passed).toBe(true);
    expect(rlsCheck?.passed).toBe(true);
    expect(viewCheck?.passed).toBe(true);
  });

  it('fails Check 4 when PUBLIC, anon, or authenticated is granted privileges on any base table', async () => {
    mockQuery.mockImplementation(
      createBaselineQueryResponder({
        baseTableGrants: [
          { grantee: 'anon', table_name: 'users', privilege_type: 'SELECT' },
          { grantee: 'authenticated', table_name: 'payments', privilege_type: 'INSERT' },
        ],
      }),
    );

    const result = await runCatalogCheck('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
    expect(result.passed).toBe(false);

    const grantsCheck = result.checks.find((c) => c.name === 'Zero base table grants to anon or authenticated');
    expect(grantsCheck?.passed).toBe(false);
    expect(grantsCheck?.details).toEqual([
      { grantee: 'anon', table_name: 'users', privilege_type: 'SELECT' },
      { grantee: 'authenticated', table_name: 'payments', privilege_type: 'INSERT' },
    ]);
  });

  it('fails Check 3 when any base table disables RLS', async () => {
    const tables = Array.from({ length: 23 }, (_, idx) => ({
      relname: idx === 0 ? 'job_seeker_profiles' : `table_${idx + 1}`,
      relrowsecurity: idx !== 0,
      relforcerowsecurity: false,
    }));

    mockQuery.mockImplementation(createBaselineQueryResponder({ rlsTables: tables }));
    const result = await runCatalogCheck('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
    expect(result.passed).toBe(false);

    const rlsCheck = result.checks.find((c) => c.name === 'All base tables have RLS enabled (relrowsecurity = true)');
    expect(rlsCheck?.passed).toBe(false);
  });

  it('fails Check 2 when a SECURITY DEFINER function in public or private_payments is callable by anon/authenticated/PUBLIC', async () => {
    mockQuery.mockImplementation(
      createBaselineQueryResponder({
        callableProc: [
          { schema_name: 'private_payments', proname: 'settle_payment', grantee: 'authenticated', privilege_type: 'EXECUTE' },
        ],
      }),
    );

    const result = await runCatalogCheck('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
    expect(result.passed).toBe(false);

    const procCheck = result.checks.find((c) => c.name === 'Zero prosecdef functions callable by anon or authenticated');
    expect(procCheck?.passed).toBe(false);
  });

  it('fails Check 5 when an unapproved view or write privilege is exposed to anon/authenticated', async () => {
    mockQuery.mockImplementation(
      createBaselineQueryResponder({
        viewGrants: [
          { grantee: 'anon', table_name: 'public_business_profiles', privilege_type: 'SELECT' },
          { grantee: 'authenticated', table_name: 'public_business_profiles', privilege_type: 'SELECT' },
          { grantee: 'anon', table_name: 'public_jobs', privilege_type: 'SELECT' },
          { grantee: 'authenticated', table_name: 'public_jobs', privilege_type: 'SELECT' },
          { grantee: 'anon', table_name: 'public_institution_profiles', privilege_type: 'SELECT' },
        ],
      }),
    );

    const result = await runCatalogCheck('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
    expect(result.passed).toBe(false);

    const viewCheck = result.checks.find((c) => c.name === 'Public non-PII views granted SELECT to anon and authenticated');
    expect(viewCheck?.passed).toBe(false);
  });

  it('keeps db:catalog:check and db:smoke:postgrest wired in CI workflow', () => {
    const ciPath = path.resolve(process.cwd(), '.github/workflows/ci.yml');
    const ciContent = fs.readFileSync(ciPath, 'utf8');
    expect(ciContent).toContain('pnpm db:catalog:check');
    expect(ciContent).toContain('pnpm db:smoke:postgrest');
  });
});
