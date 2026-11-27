## Summary
- **Related Issue(s):** Closes #
- **PRD Requirement ID(s):** <!-- e.g. AUTH-01, AUTH-05, BULK-03, WAL-03 -->
- **ADR(s):** <!-- e.g. ADR 0001, ADR 0002 -->

## Authorization and Security Review

Complete this section for changes affecting authentication, authorization, repositories, database access, or sensitive business operations. Mark N/A with explanation where not applicable.

- [ ] Authorization is deny-by-default.
- [ ] Required actor permissions and roles are validated from server state.
- [ ] Tenant context originates from trusted server-side state (`AuthorizationContext`).
- [ ] Tenant-sensitive database queries and mutations are explicitly scoped.
- [ ] Resource ownership and relationships are validated.
- [ ] Cross-tenant negative tests are included (and verify denied writes create no DB rows or queued jobs).
- [ ] No privileged credentials (`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`) are exposed to `apps/web` or `NEXT_PUBLIC_*`.
- [ ] No unauthorized database grants are introduced (`anon` / `authenticated` stay deny-all on base tables).
- [ ] Sensitive RPC execution privileges and `search_path` remain restricted.
- [ ] Logs and error responses exclude secrets, tokens, and raw PII.
- [ ] Verification gates pass (`pnpm typecheck`, `pnpm lint`, unit/e2e tests, `db:catalog:check`, `db:smoke:postgrest`).
- [ ] Changes comply with ADR 0002 and `AGENTS.md`.

## Security Impact
- **Risk level:**
- **Affected authorization boundary:**
- **Residual risks / follow-ups:**
- **Security reviewer (human approval if touching RLS / auth / payments / DPDP):**

## UX, Accessibility, and Bilingual Verification

Complete this section for changes affecting `apps/web`, `packages/ui`, public pages, forms, or user-facing copy. Mark N/A with explanation where not applicable.

- [ ] Keyboard navigation, focus management, and semantic landmarks/labels verified (`docs/ux/a11y-checklist.md`).
- [ ] Mobile-first responsive layout verified (360px–1280px, no horizontal overflow, ≥44px touch targets).
- [ ] Bilingual copy verified in both English (`/`) and Hindi (`/hi`) with no hardcoded user-facing strings.
- [ ] Public SSR pages / performance impact verified (no unnecessary client bundles or blocking requests).
- [ ] Visual/interaction evidence attached (screenshots or test output for UI changes).
