You are working in the jobsclick monorepo (pnpm workspaces: apps/api NestJS+Fastify, apps/web Next 14, apps/worker, packages/validation, packages/database).

HARD RULES

1. Scope: change only files the step lists or that the step's tests require. If you need to touch anything else, stop and ask.
2. Tests first: write acceptance tests, run them, confirm they FAIL on current code, then implement until they pass. Show both outputs.
3. No test-mode escape hatches in production code. Never branch on NODE_ENV=test, phone prefixes, or special ids in app code. Test seams are injected providers or separate test modules.
4. Fail closed. Missing config, Redis outage, DB error => reject (401/503), never allow, never fall back to mock data.
5. No fabricated data or fake success. Errors must surface to the caller and to Sentry.
6. Never log OTPs, tokens, full phone numbers, or Aadhaar.
7. Never commit secrets. Do not edit .env files that are not .env.example.
8. Two migration trees exist (supabase/ and packages/database/supabase/). Add every migration to both using the existing sync script. Do not let them diverge.
9. One conventional commit per logical change. Do not push. Do not rewrite history.
10. Before finishing run: pnpm build, pnpm -r exec tsc --noEmit (or the repo equivalent), pnpm lint, and the step's tests. Report exact commands and results.
11. Final report must list: files changed, tests added (names), commands run with pass/fail, anything you could not verify, and any rule you had to bend (there should be none).
