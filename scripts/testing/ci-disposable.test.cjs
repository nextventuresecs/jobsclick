const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const workflow=fs.readFileSync(path.resolve(__dirname,'../../.github/workflows/ci.yml'),'utf8');
test('AUTH CI runs a dedicated disposable migration contract job',()=>{
  assert.match(workflow,/\n  auth-disposable:/);
  assert.match(workflow,/pnpm test:auth-migration/);
  assert.doesNotMatch(workflow,/supabase\s+(?:start|db reset)/);
});
test('AUTH CI contains no shared database targets, credentials or secret expressions',()=>{
  assert.doesNotMatch(workflow,/(?:DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY|JWT_SECRET|OTP_PEPPER|REDIS_URL):/);
  assert.doesNotMatch(workflow,/\$\{\{\s*secrets\./);
});
for(const job of ['deploy-staging','deploy-production'])test(job+' cannot report success from a placeholder',()=>{
  const begin=workflow.indexOf('\n  '+job+':');assert.ok(begin>=0);
  const next=workflow.slice(begin+1).search(/\n  [a-z][a-z-]+:/);
  const block=next<0?workflow.slice(begin):workflow.slice(begin,begin+1+next);
  assert.match(block,/# TODO human-approved deploy/);
  assert.match(block,/\bexit 1\b/);
});

test('full-suite CI produces the production artifact before startup integration assertions',()=>{
  const begin=workflow.indexOf('\n  verify:');
  const end=workflow.indexOf('\n  auth-disposable:',begin);
  const block=workflow.slice(begin,end);
  const build=block.indexOf('run: pnpm build');
  const tests=block.indexOf('run: pnpm test\n');
  assert.ok(build>=0&&tests>build,'production build must precede the full test command');
  assert.match(block.slice(build,tests),/NODE_ENV: production/);
});

test('native database security verification fails on advisor ERROR findings',()=>{
  const runner=fs.readFileSync(path.resolve(__dirname,'run-disposable.cjs'),'utf8');
  assert.match(runner,/'security-advisors'/);
  assert.match(runner,/'--fail-on',\s*'error'/);
  const gate=workflow.slice(workflow.indexOf('\n  db-security-gate:'),workflow.indexOf('\n  container-build:'));
  assert.match(gate,/--db-tools/);
});

test('stacked review pull requests run verification without permitting deployment',()=>{
  const events=workflow.slice(0,workflow.indexOf('\npermissions:'));
  const pullRequest=events.slice(events.indexOf('  pull_request:'));
  assert.ok(events.includes('  pull_request:'),'pull request verification is required');
  assert.doesNotMatch(pullRequest,/branches(?:-ignore)?:/,'stacked bases need the same verification');
  for(const job of ['deploy-staging','deploy-production']){
    const begin=workflow.indexOf('\n  '+job+':');
    const next=workflow.slice(begin+1).search(/\n  [a-z][a-z-]+:/);
    const block=next<0?workflow.slice(begin):workflow.slice(begin,begin+1+next);
    assert.ok(block.includes("if: github.ref == 'refs/heads/main' && github.event_name == 'push'"));
  }
});

for(const job of ['auth-disposable','db-security-gate','auth-native-otp'])test(job+' builds runtime shared exports before selected native tests',()=>{
  const begin=workflow.indexOf('\n  '+job+':');assert.ok(begin>=0,'native job is required: '+job);
  const next=workflow.slice(begin+1).search(/\n  [a-z][a-z-]+:/);
  const block=next<0?workflow.slice(begin):workflow.slice(begin,begin+1+next);
  const build=block.indexOf('pnpm --filter @indian-job-portal/database --filter @indian-job-portal/validation run build');
  const tests=block.indexOf('run: pnpm test');
  assert.ok(build>=0&&tests>build,'cold runtime exports must be built before selected tests');
  if(job==='auth-native-otp'){
    assert.ok(block.includes('--native-otp --auth-contracts apps/api/test/supabase-sms-hook.local.spec.ts'));
    assert.ok(block.includes('--native-otp apps/api/test/otp-fallback-native.local.spec.ts'));
    assert.ok(block.includes('--native-otp --captcha-reject --auth-contracts apps/api/test/supabase-sms-hook.local.spec.ts'));
  }
});
