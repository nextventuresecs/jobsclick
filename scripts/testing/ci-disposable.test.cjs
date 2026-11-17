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
