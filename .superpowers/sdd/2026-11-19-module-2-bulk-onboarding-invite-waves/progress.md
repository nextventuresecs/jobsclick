# SDD ledger — plan: docs/superpowers/plans/2026-11-19-module-2-bulk-onboarding-invite-waves.md

## Pre-flight interface scan
- Task 1 produces DB schema: invitations(batch_id, phone NULL, email VARCHAR, status) + idx_invitations_batch_status.
- Task 2 produces: parseSharedCsv, normalizeIndianPhone, normalizeEmail.
- Task 3 consumes Task 1 & 2: streams CSV, extracts email or phone, inserts users & invitations, sends onboarding email.
- Task 4 consumes Task 1 & 3: queries invitations scoped to batch_id & pending, sends 1:1 SMS, updates status.
- Task 5 consumes Task 2, 3, 4: isolates storage namespaces, enforces assertOwner, drops QStash duplicate invocation.
- Task 6 consumes Task 2 & 5: updates web employer & institution onboarding with contact-only CSV instructions.
- Pre-flight: all interfaces aligned with spec and PRD.
Task 1: complete (commit 263f729, tests: pnpm test packages/database/test/invitations-schema.test.ts -> PASS)
Task 2: complete (commit da02cf6, tests: pnpm test packages/validation/test/ -> 8 passed, 35 passed)
Task 3: complete (commit 93d3d9c, tests: import-contacts.spec.ts -> 2 passed, processors.spec.ts -> 7 passed)
Task 4: complete (commit e713ef2, tests: invite-isolation.spec.ts -> 2 passed, processors.spec.ts -> 7 passed)
Task 5: complete (commit 78ce22f, tests: pnpm test apps/api/test/bulk-ownership.e2e-spec.ts -> 6 passed)
Task 6: complete (commit cb23447, tests: pnpm test apps/web/test/bulk-onboard.spec.ts -> 2 passed)
Task 7: complete (commit bab226a, verification: pnpm test across 8 suites -> 25 passed, pnpm typecheck -> 0 errors, pnpm lint -> 0 errors)
