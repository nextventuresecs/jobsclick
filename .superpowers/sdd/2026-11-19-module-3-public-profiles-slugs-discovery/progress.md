# SDD ledger — plan: docs/superpowers/plans/2026-11-19-module-3-public-profiles-slugs-discovery.md

## Pre-flight interface scan
- Task 1 produces: DB migration 20261118085644_public_api_projection_reads.sql (service_role projections, search_public_jobs, read_public_institution_cms) and allows 'application/pdf' in storage.
- Task 2 consumes Task 1: PublicDiscoveryRepository queries projection views and RPCs with Crockford Base32 opaque slugs.
- Task 3 consumes Task 1: ProfilesController exposes authenticated GET /profiles/seeker/me/pdf backed by worker @react-pdf/renderer service and private storage.
- Task 4 consumes Task 3: Seeker UI components (SeekerProfileForm, SeekerDigitalCvPreview) invoke downloadSeekerPdfApi.
- Task 5 produces: POST /jobs/applications/:appId/interview-invite resolving candidate phone internally via UserRepository and dispatching DLT SMS with zero phone/email leakage.
- Task 6 consumes Tasks 1-5: Full monorepo typecheck, linting, and test verification.
- Pre-flight: all interfaces cleanly aligned with PRD, ID-02, and Hard Invariants #1 & #8a.
Task 1: complete (commit 25b4e5f, tests: vitest packages/database/test/public-projections-migration.test.ts -> 3 passed)
Task 2: complete (commit 9d88964, tests: vitest apps/api/test/public-discovery.spec.ts -> 2 passed)
Task 3: complete (commit ae6896f, tests: vitest apps/api/test/seeker-pdf-download.spec.ts -> 1 passed)
Task 4: complete (commit f283625, tests: vitest apps/web/test/seeker-pdf-download.test.ts -> 1 passed, typecheck & lint clean)
Task 5: complete (commit 7d5900f, tests: vitest apps/api/test/interview-invite-sms.spec.ts -> 4 passed, vitest apps/web/test/applicant-interview-invite.test.ts -> 2 passed, typecheck & lint clean)
Task 6: complete (monorepo verification: pnpm -r typecheck 6/6 packages 0 errors, pnpm -r lint 6/6 packages 0 errors, 8/8 test suites 24/24 tests passed)
