# Authentication and authorization review — AUTH-01, AUTH-03, AUTH-06

Status: implementation draft for human review, 2026-11-16. No deployment, hosted configuration change, database migration, or real SMS delivery was performed. Worktree: `indian-job-portal-remediation`. Existing bulk-isolation changes are preserved.

## Findings and implemented boundary

The browser previously received the raw access JWT from OTP verification and posted it back to a session endpoint. The root layout also passed a session containing that token into client providers. Meanwhile, workspace callers expected a bearer token that the context did not supply. This broke authenticated workspace and application calls and exposed credentials to client JavaScript. Logout removed a cookie without revoking the current token, and the all-devices option was ignored.

The draft now uses this pipeline:

1. Browser submits OTP requests to exact same-origin Next.js routes. The verification route proxies to an API browser endpoint that sets an HttpOnly, SameSite=Lax cookie; production adds Secure and the `__Host-` prefix. The response contains user metadata only. Cookie lifetime is bounded by the issued access token's expiry.
2. Server rendering and session reads validate the cookie and call protected `auth/me`. The API supplies current role and active status. Only `{id, role, status}` crosses into client providers; the subject must match the verified token.
3. Workspace, application, and bulk browser requests use same-origin server routes. These routes attach credentials server-side to a fixed API origin, reject cross-origin writes and invalid paths, bound request bodies to 1 MiB, and disable caching. Caller-provided authorization headers cannot replace the cookie identity. Empty application POSTs carry no misleading JSON content type.
4. API JWT guards verify signature, issuer, audience, expiry, token version, revocation, current role, and account status. Role guards and resource ownership remain the authorization authority. Existing shared state caching may delay external state changes for up to its 60-second TTL; existing application-managed changes invalidate that cache.
5. Current-device logout writes a shared Redis revocation marker keyed by JWT ID until token expiry. All-device logout uses the existing database token-version invalidation. The browser clears its cookie after successful revocation or an already invalid session; an upstream outage is reported rather than presented as successful logout.

Two new-profile ID generators produced non-UUID strings rejected by the shared API schemas. Seeker and institution creation now generate UUIDs. Existing records are unchanged.

The API retains its legacy bearer OTP endpoint for compatibility. It is not exposed through the authenticated browser proxy. This draft does not convert the underlying custom OTP/JWT provider to Supabase Auth and does not implement refresh sessions. The current access session still expires after approximately 30 minutes. AUTH-06 is therefore incomplete.

## Production provider direction and migration plan

The user selected production and industry-standard practices. Follow the fixed project stack and PRD section 11: **Supabase native phone OTP with a custom MSG91 SMS hook**, with authentication credentials handled by the server. Avoid adding another custom refresh-token subsystem alongside Supabase.

Supabase models sessions with access and refresh tokens and supports refresh-token rotation and session controls. See [Supabase sessions](https://supabase.com/docs/guides/auth/sessions), [phone login](https://supabase.com/docs/guides/auth/phone-login), and [Send SMS hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook). The application must still enforce its own authorization and abuse controls. Browser rendering and server route authorization must remain separate checks; see [Next.js authentication guidance](https://nextjs.org/docs/app/guides/authentication).

The [revised migration plan](../decisions/002-supabase-auth-migration-plan.md) now defines the ordered slices, failing-test acceptance criteria, identity/RLS transition, provider revocation, verification capability gates, bulk work, and rollback. It supersedes this review's earlier five-step outline and the pasted nine-slice proposal. All product MCQs are resolved: phone-first workspace access; extra email verification for import coordinators; Google across account types with role-specific registration/linking; phone-or-email CSV rows; and email-first waves with explicitly approved scheduled SMS fallback. Individual/gig job seekers may self-register, employers use existing accounts, institutions may self-register through Google, and MSME admins remain platform-admin provisioned. These rules change current signup contracts and are planned, not implemented. The concrete auth/RLS/migration draft still requires human review.

## Open production gates

- AUTH-01/AUTH-06: reviewed provider migration, identity mapping, and long-lived refresh session lifecycle remain outstanding.
- AUTH-03/ADM-05: device-based limiting and wiring the existing SMS-spend helper into actual sends remain outstanding; verify alert delivery and fail-closed caps. Existing Turnstile, number/IP limits, OTP attempt limits, and atomic Redis operations have regression coverage.
- Deployment: prove ingress overwrites untrusted forwarded IP headers and restricts direct-origin access. Native proxy forwarding alone does not establish trustworthy client IP identity.
- Authorization: service-role repositories bypass RLS. Review scoped access before claiming API guards and RLS independently enforce every user query.
- Review the secondary-email verification page/link and append-only admin-login audit path. Google login remains disabled by default; its provider callback is not implemented by this slice.
- Review existing operational timeout, monitoring, and recovery behavior before launch. No production readiness or live delivery claim follows from these tests.

## Test evidence and limits

Red tests were observed before fixes for the browser session boundary, browser API endpoints, current-token revocation, malformed profile IDs, oversized private requests, and mismatched identity responses.

| Verification | Result |
| --- | --- |
| Combined auth/bulk regression run, 12 files | 70 passed, including real local Supabase isolation and both 50k-row import fixtures |
| Final focused boundary run, 4 files | 24 passed: browser serialization/proxy tests, bulk browser routes, authenticated flow bridge, browser auth API |
| Existing auth regression run, 9 files | 78 passed |
| Workspace/profile/jobs/OTP/validation regression run, 10 files | 77 passed |
| TypeScript checks | All six packages passed `tsc --noEmit` |
| Lint | Repository `eslint apps packages` passed |
| Builds | Shared packages, API, worker, and sanitized production Next.js build passed |
| Migration consistency and whitespace | Checks passed; no SQL changed |

Counts describe separate runs with overlapping tests, not an aggregate total. Commands invoke installed Node CLI entry points because the pnpm launcher attempted an unavailable network fetch for the pinned package-manager version. The production web build uses an ignored source copy with no real environment files and a generated disposable JWT secret. It does not validate deployment secrets or hosted configuration.

Key tests: `apps/web/test/session-boundary.spec.ts`, `apps/api/test/browser-auth-pipeline.spec.ts`, `apps/api/test/authenticated-flows.spec.ts`, `apps/api/test/session-revocation.spec.ts`, and `apps/api/test/workspace-profile-uuid.spec.ts`. The bridge uses real Nest controllers/guards and signed JWTs but stubs OTP and business services. Redis revocation and bulk PostgREST/Storage/database-role checks use disposable local infrastructure. These are not live-provider or browser-click end-to-end tests. The full repository test suite was not claimed clean.

## Review boundary

Repository `AGENTS.md` states: "Human-review-only (agent drafts, human approves)" and includes "RLS policies, auth/OTP flow, migrations touching existing data, anything with payments, DPDP consent text." This auth draft and the provider migration design require human review before merge/deployment. No consent wording, payment behavior, RLS policy, or existing-data migration was changed. Payment-related components only switch authenticated transport to the server route.
