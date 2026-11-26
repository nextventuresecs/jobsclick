# Runbook: Authorization Audit Logging & Denial Monitoring (ADR 0002 / AUTHZ-11)

## Event Schema (`AuthorizationAuditRecord`)
Emitted as structured JSON with prefix `AUTHZ_AUDIT` by [`authorization-audit.service.ts`](../../apps/api/src/auth/authorization-audit.service.ts) and HTTP exception filter [`http-exception.filter.ts`](../../apps/api/src/common/http-exception.filter.ts):

- `eventId`: UUID v4 per event
- `timestamp`: UTC ISO-8601 timestamp
- `requestId`: Correlation ID propagated from `X-Request-Id` (or generated) and returned on `401`/`403` responses
- `actorId` / `actorType`: Authenticated user UUID (`user`), workload identity (`worker:<name>`), or `anonymous`
- `role`, `tenantId`, `tenantType`: Derived strictly from validated server session/`AuthorizationContext`
- `action`: HTTP `<METHOD> <path>` (query string stripped) or policy operation (`tenant:ownership_check`, `permission:<name>`)
- `decision`: `'allow' | 'deny'`
- `reasonCode`: Machine-readable code (`CROSS_TENANT_ACCESS_DENIED`, `MISSING_REQUIRED_PERMISSION`, `HTTP_401_UNAUTHORIZED`, `HTTP_403_FORBIDDEN`)
- `policyId`: Policy identifier (e.g. `ADR-0002-TENANCY`, `ADR-0002-RBAC`)

## PII & Secret Scrubbing Guarantee
- Never logs `Authorization` headers, JWTs, `phone`, `email`, Aadhaar fragments, or request/response bodies.
- Any accidental bearer token, JWT pattern, email, or 10-digit Indian mobile number in exception strings is automatically replaced with `[REDACTED]` / `[JWT_REDACTED]` / `[EMAIL_REDACTED]` / `[PHONE_REDACTED]`.

## Retention & Alerting
- **API Application Logs (Railway Log Drain / SIEM):** Retain structured security logs for **180 days minimum** (**365 days** for financial/admin mutation audit rows in immutable `public.audit_logs`).
- **Burst Detection:** When `>= 10` denials occur for the same `(actorId, action)` within `60s`, the service emits an `AUTHZ_DENY_BURST` error log entry for automated alerting.
- **On-Call Action on Cross-Tenant / Burst Alerts:**
  1. Correlate `requestId` across API logs and Sentry without querying raw PII.
  2. If compromised session or brute-force probing is suspected, call `POST /auth/sign-out-all` or disable the offending user via admin console (`token_version` bump takes immediate effect across instances).
