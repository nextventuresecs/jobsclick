# Runbook: Zero-Downtime Credential & JWT Key Rotation (ADR 0002 / AUTHZ-05 & AUTHZ-09)

## 1. API & Web Session Signing Key (`JWT_SECRET` / `JWT_PREVIOUS_SECRET`)

`JwtService` (`apps/api`) and `auth-session.ts` (`apps/web`) support dual-key verification for zero-downtime `HS256` key rotation without signing out active users:

1. Generate a new 64-hex-character (256-bit) key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Set `JWT_PREVIOUS_SECRET` to the **current** active `JWT_SECRET` across both Railway `api` and `web` services, and set `JWT_SECRET` to the **new** key (`JWT_PREVIOUS_SECRET !== JWT_SECRET`, both `>= 32` chars).
3. Deploy/restart `api` and `web`. New tokens immediately sign with the new `JWT_SECRET`, while in-flight tokens signed with `JWT_PREVIOUS_SECRET` continue verifying until their TTL (`<= 60` minutes API access token, `<= 7` days BFF cookie) expires.
4. Once `max(cookieTTL)` has elapsed (or immediately on emergency compromise), remove `JWT_PREVIOUS_SECRET` and call `POST /auth/sign-out-all` (or increment `users.token_version`) for affected sessions.

## 2. Admin Queue Guard (`ADMIN_DASHBOARD_SECRET`)

1. Generate a new >= 32-char random secret distinct from `JWT_SECRET` and `OTP_PEPPER`.
2. Update `ADMIN_DASHBOARD_SECRET` on the `api` Railway service (and staging CI secrets if configured).
3. Immediately invalidates old `/admin/queues*` bearer tokens on restart.

## 3. Supabase Privileged Keys & Early-2027 Legacy Key Deprecation

- Never set `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, or `DIRECT_URL` on `apps/web` build/runtime environments or any `NEXT_PUBLIC_*` variable (`scripts/ci/check-web-secrets.mjs` enforces this in CI).
- **Emergency Rotation (`SUPABASE_SERVICE_ROLE_KEY`):**
  1. Rotate the service secret in the Supabase project dashboard (or revoke the compromised Secret API Key).
  2. Update `SUPABASE_SERVICE_ROLE_KEY` simultaneously in `api`, `worker`, and GitHub Actions deployment secrets (`STAGING_*` / `PROD_*`).
  3. Re-deploy `api` and `worker` and verify `GET /health/ready` returns `200`.
- **Legacy `anon` / `service_role` Key Migration (Pre-2027 Roadmap):** Migrate Railway and GitHub Actions secrets to Supabase Publishable (`sb_publishable_*`) and Secret (`sb_secret_*`) keys, followed by Option 3 workload role cutover ([`db-privilege-matrix.md`](../verification/db-privilege-matrix.md)).
