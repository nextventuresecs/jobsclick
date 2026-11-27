import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAuditReport } from './dependency-audit.mjs';

test('passes when high/critical advisories are in documented allowlist and ignores moderate/low', () => {
  const result = evaluateAuditReport(
    {
      advisories: {
        1: { github_advisory_id: 'GHSA-known-1', module_name: 'next', severity: 'critical', title: 'Known' },
        2: { github_advisory_id: 'GHSA-mod-1', module_name: 'foo', severity: 'moderate', title: 'Mod' },
      },
    },
    { 'GHSA-known-1': 'documented waiver' },
  );

  assert.equal(result.waived.length, 1);
  assert.equal(result.unwaived.length, 0);
});

test('flags newly introduced unwaived high or critical advisories', () => {
  const result = evaluateAuditReport(
    {
      advisories: {
        1: { github_advisory_id: 'GHSA-new-crit', module_name: 'bar', severity: 'critical', title: 'New RCE' },
        2: { github_advisory_id: 'GHSA-new-high', module_name: 'baz', severity: 'high', title: 'New Auth Bypass' },
      },
    },
    {},
  );

  assert.equal(result.unwaived.length, 2);
  assert.deepEqual(
    result.unwaived.map((a) => a.id),
    ['GHSA-new-crit', 'GHSA-new-high'],
  );
});

test('fails closed when pnpm audit returns an error payload or omits advisories', () => {
  assert.throws(
    () =>
      evaluateAuditReport({
        error: { code: 'ERR_PNPM_AUDIT_FAILED', summary: 'registry unreachable' },
      }),
    /Invalid pnpm audit report: registry unreachable/,
  );

  assert.throws(() => evaluateAuditReport({}), /Invalid pnpm audit report: missing advisories map/);
});
