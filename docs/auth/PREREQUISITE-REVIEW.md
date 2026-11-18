# Prerequisite review note

Branch: `codex/remediation-prerequisite`; commit `e91f5e285880dbb0656f2a54233adaf40a19bfbe`; parent `65c5f4c`. This is a preservation baseline of earlier dirty remediation work, not a new merge-ready AUTH slice. 63 changed files; 37 production-source files; 1167 added+deleted production-source lines (tests, docs, message JSON and SQL excluded from that count).

| File | Requirement IDs | Added | Deleted |
| --- | --- | --- | --- |
| apps/api/src/auth/auth.controller.ts | AUTH-01/AUTH-05/AUTH-06 | 44 | 1 |
| apps/api/src/auth/guards/jwt-auth.guard.ts | AUTH-01/AUTH-05/AUTH-06 | 10 | 0 |
| apps/api/src/auth/otp-redis.service.ts | AUTH-01/AUTH-05/AUTH-06 | 9 | 0 |
| apps/api/src/bulk/bulk.controller.ts | BULK-01/BULK-02/BULK-03 | 24 | 21 |
| apps/api/src/bulk/bulk.service.ts | BULK-01/BULK-02/BULK-03 | 78 | 45 |
| apps/api/src/profiles/profiles.service.ts | AUTH-01/AUTH-05/AUTH-06 | 2 | 2 |
| apps/api/test/authenticated-flows.spec.ts | AUTH-01/AUTH-05/AUTH-06 | 63 | 0 |
| apps/api/test/browser-auth-pipeline.spec.ts | AUTH-01/AUTH-05/AUTH-06 | 54 | 0 |
| apps/api/test/bulk-local-supabase.spec.ts | BULK-01/BULK-02/BULK-03 | 135 | 0 |
| apps/api/test/bulk-ownership.e2e-spec.ts | BULK-01/BULK-02/BULK-03 | 118 | 0 |
| apps/api/test/bulk.e2e-spec.ts | BULK-01/BULK-02/BULK-03 | 1 | 1 |
| apps/api/test/fixtures/browser-pipeline.module.ts | AUTH-01/AUTH-05/AUTH-06 | 45 | 0 |
| apps/api/test/session-revocation.spec.ts | AUTH-01/AUTH-05/AUTH-06 | 31 | 0 |
| apps/api/test/workspace-profile-uuid.spec.ts | AUTH-01/AUTH-05/AUTH-06 | 26 | 0 |
| apps/web/messages/en.json | AUTH-01/AUTH-05/AUTH-06 | 2 | 0 |
| apps/web/messages/hi.json | AUTH-01/AUTH-05/AUTH-06 | 2 | 0 |
| apps/web/src/app/api/auth/session/route.ts | AUTH-01/AUTH-05/AUTH-06 | 16 | 98 |
| apps/web/src/app/api/backend/[...path]/route.ts | AUTH-01/AUTH-05/AUTH-06 | 11 | 0 |
| apps/web/src/app/api/bulk/batches/[id]/error-report/route.ts | BULK-01/BULK-02/BULK-03 | 6 | 65 |
| apps/web/src/app/api/bulk/batches/[id]/route.ts | BULK-01/BULK-02/BULK-03 | 4 | 59 |
| apps/web/src/app/api/bulk/batches/route.ts | BULK-01/BULK-02/BULK-03 | 18 | 82 |
| apps/web/src/app/api/bulk/signed-url/route.ts | BULK-01/BULK-02/BULK-03 | 3 | 59 |
| apps/web/src/app/auth/callback/page.tsx | AUTH-01/AUTH-05/AUTH-06 | 7 | 15 |
| apps/web/src/app/layout.tsx | AUTH-01/AUTH-05/AUTH-06 | 3 | 3 |
| apps/web/src/components/ClientProviders.tsx | AUTH-01/AUTH-05/AUTH-06 | 4 | 4 |
| apps/web/src/components/auth/AuthModal.tsx | AUTH-01/AUTH-05/AUTH-06 | 11 | 20 |
| apps/web/src/components/jobs/JobApplyButton.tsx | AUTH-05/JOB-03 | 2 | 10 |
| apps/web/src/components/jobs/SaveSearchAlertModal.tsx | AUTH-05/JOB-03 | 1 | 4 |
| apps/web/src/components/wallet/RechargeModal.tsx | AUTH-01/AUTH-05/AUTH-06 | 2 | 2 |
| apps/web/src/components/workspaces/AdminWorkspace.tsx | AUTH-01/AUTH-05/AUTH-06 | 5 | 7 |
| apps/web/src/components/workspaces/EmployerWorkspace.tsx | AUTH-01/AUTH-05/AUTH-06 | 2 | 2 |
| apps/web/src/components/workspaces/InstitutionWorkspace.tsx | AUTH-01/AUTH-05/AUTH-06 | 2 | 2 |
| apps/web/src/components/workspaces/admin/MsmeBroadcastConsole.tsx | AUTH-01/AUTH-05/AUTH-06 | 4 | 6 |
| apps/web/src/components/workspaces/employer/PromoteJobModal.tsx | AUTH-01/AUTH-05/AUTH-06 | 3 | 4 |
| apps/web/src/components/workspaces/employer/employerApi.ts | AUTH-01/AUTH-05/AUTH-06 | 18 | 18 |
| apps/web/src/components/workspaces/employer/useEmployerWorkspace.ts | AUTH-01/AUTH-05/AUTH-06 | 5 | 5 |
| apps/web/src/components/workspaces/institution/InstitutionCmsEditor.tsx | AUTH-01/AUTH-05/AUTH-06 | 8 | 8 |
| apps/web/src/components/workspaces/institution/SponsorshipCard.tsx | AUTH-01/AUTH-05/AUTH-06 | 1 | 3 |
| apps/web/src/components/workspaces/institution/institutionApi.ts | AUTH-01/AUTH-05/AUTH-06 | 3 | 6 |
| apps/web/src/components/workspaces/institution/useInstitutionWorkspace.ts | AUTH-01/AUTH-05/AUTH-06 | 11 | 20 |
| apps/web/src/components/workspaces/seeker/seekerApi.ts | AUTH-01/AUTH-05/AUTH-06 | 10 | 16 |
| apps/web/src/components/workspaces/seeker/useSeekerWorkspace.ts | AUTH-01/AUTH-05/AUTH-06 | 9 | 13 |
| apps/web/src/context/AppContext.tsx | AUTH-01/AUTH-05/AUTH-06 | 27 | 26 |
| apps/web/src/lib/origin-policy.ts | AUTH-01/AUTH-05/AUTH-06 | 9 | 0 |
| apps/web/src/lib/server-api.ts | AUTH-01/AUTH-05/AUTH-06 | 75 | 0 |
| apps/web/src/middleware.ts | AUTH-01/AUTH-05/AUTH-06 | 21 | 0 |
| apps/web/test/bulk-onboard.spec.ts | BULK-01/BULK-02/BULK-03 | 6 | 4 |
| apps/web/test/no-fake-success.test.ts | AUTH-01/AUTH-05/AUTH-06 | 2 | 2 |
| apps/web/test/session-boundary.spec.ts | AUTH-01/AUTH-05/AUTH-06 | 118 | 0 |
| apps/worker/src/processors/invite.processor.ts | BULK-01/BULK-02/BULK-03 | 15 | 58 |
| apps/worker/test/fixtures/import-supabase.ts | BULK-01/BULK-02/BULK-03 | 186 | 0 |
| apps/worker/test/import.processor.spec.ts | BULK-01/BULK-02/BULK-03 | 1 | 185 |
| apps/worker/test/invite-isolation.spec.ts | BULK-01/BULK-02/BULK-03 | 23 | 0 |
| apps/worker/test/processors.spec.ts | BULK-01/BULK-02/BULK-03 | 29 | 10 |
| docs/auth/AUTH_MIGRATION_PLAN_V2.md | AUTH-01/AUTH-05/AUTH-06 | 189 | 0 |
| docs/auth/CODEX_AUTH_MASTER_PROMPT.md | AUTH-01/AUTH-05/AUTH-06 | 93 | 0 |
| docs/db/drafts/auth-user-links.sql | AUTH-01/AUTH-05/AUTH-06 | 64 | 0 |
| docs/decisions/001-client-decisions.md | AUTH-01/AUTH-05/AUTH-06 | 35 | 0 |
| docs/decisions/002-supabase-auth-migration-plan.md | AUTH-01/AUTH-05/AUTH-06 | 128 | 0 |
| docs/security/auth-session-review.md | AUTH-01/AUTH-05/AUTH-06 | 59 | 0 |
| docs/security/bulk-ownership-verification.md | BULK-01/BULK-02/BULK-03 | 68 | 0 |
| docs/security/supabase-auth-slice-1.md | AUTH-01/AUTH-05/AUTH-06 | 51 | 0 |
| packages/database/test/auth-identity.local.test.ts | AUTH-01/AUTH-05/AUTH-06 | 167 | 0 |

Requirement mapping is a review index, not proof of complete coverage or release readiness. Existing auth, bulk, browser/API and SQL drafts remain subject to their own review gates.
