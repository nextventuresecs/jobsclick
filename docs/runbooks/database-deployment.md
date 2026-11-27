# Database Deployment & Migration Safety Runbook

This runbook covers TLS enforcement, environment isolation, migration integrity, and recovery procedures for **JobsClick** staging and production Supabase PostgreSQL deployments.

## 1. TLS & Connection Security

- Both `scripts/bootstrap-staging-db.ts` and `scripts/bootstrap-production-db.ts` (via `scripts/common/db-tls.ts` and `scripts/common/db-url.ts`) enforce `rejectUnauthorized: true` with strict hostname verification (`servername`).
- `SUPABASE_CA_CERT` (PEM certificate or file path) is **mandatory** for all remote database connections and is validated with `crypto.X509Certificate`.
- `NODE_TLS_REJECT_UNAUTHORIZED=0`, `DB_ALLOW_INSECURE_TLS=true`, and insecure `PGSSLMODE` (`disable`, `allow`, `prefer`, `no-verify`) are rejected.
- Connection-string query parameters (`sslmode=disable|no-verify|prefer|allow`, `ssl`, `sslrootcert`, `options`, `statement_timeout`, `lock_timeout`) are rejected; `pg.Client` is constructed from validated explicit fields.
- Production schema snapshots (`scripts/snapshot-production-schema.ts`) write `SUPABASE_CA_CERT` to a `0600` temp file and invoke `supabase db dump` with `PGSSLMODE=verify-full` and `PGSSLROOTCERT`.

## 2. Environment Isolation

- **Staging** requires `STAGING_DATABASE_URL` and `STAGING_PROJECT_REF` (`afxgvtfaofpnlhdsexnp`) with `--confirm-project-ref`. Silent fallback to `DATABASE_URL` or `127.0.0.1` is disabled.
- **Production** requires `PRODUCTION_DATABASE_URL` and `PRODUCTION_PROJECT_REF` with `--confirm-project-ref`. Localhost and staging refs are rejected.
- Deprecated project ref `aspahsnclunutwiqliau` is unconditionally blocked.
- Port `6543` (transaction pooler) is rejected everywhere. Only direct (`db.<ref>.supabase.co:5432`) or Session Mode pooler (`*.pooler.supabase.com:5432` with `postgres.<ref>`) connections are allowed.

## 3. Migration Safety & Baseline Strategy

- **Preflight**: CI runs `--dry-run` before live execution in both staging and production. Dry-run performs zero writes.
- **Locking & Timeouts**: Runners acquire `pg_try_advisory_lock(742941842)` with a bounded timeout (`15s`), `lock_timeout = '10s'`, and `statement_timeout = '60s'`.
- **Integrity**: All `.sql` files in `supabase/migrations/` must match `<14-digit-version>_<name>.sql` with unique versions. SHA-256 checksums are stored in `supabase_migrations.schema_migrations.checksum` atomically with DDL changes.
- **History Drift**: Unknown versions in DB, name mismatches, or checksum mismatches abort deployment.
- **Non-Destructive Baseline**: If an existing database has `schema_migrations` rows without `checksum` or single-statement `statements`, verify history manually and run once with `--baseline-checksums` to backfill `checksum` where `NULL` without modifying `statements`.
- **Non-Transactional SQL**: Statements such as `CREATE INDEX CONCURRENTLY` or `VACUUM` are rejected unless the migration includes `-- migration-strategy: non-transactional` and the runner is invoked with `--allow-non-transactional`.
- **Post-Migration Verification**: Live runs verify `SECURITY DEFINER` `search_path` pinning and `public` table RLS enablement before completing.

## 4. Required GitHub Environment Secrets & Variables

### `staging` Environment
| Kind | Name | Purpose |
| :--- | :--- | :--- |
| Secret | `STAGING_DATABASE_URL` | Session pooler/direct Postgres URL (`:5432`) |
| Secret | `STAGING_PROJECT_REF` | `afxgvtfaofpnlhdsexnp` |
| Secret | `SUPABASE_CA_CERT` | Supabase root/intermediate CA PEM |
| Secret | `RAILWAY_STAGING_TOKEN` | Staging Railway project token |
| Variable | `STAGING_API_URL` | `https://api-staging.jobsclick.live` |
| Variable | `STAGING_WEB_URL` | `https://staging.jobsclick.live` |

### `production` Environment
| Kind | Name | Purpose |
| :--- | :--- | :--- |
| Secret | `PRODUCTION_DATABASE_URL` | Session pooler/direct Postgres URL (`:5432`) |
| Secret | `PRODUCTION_PROJECT_REF` | Production Supabase project ref |
| Secret | `SUPABASE_CA_CERT` | Supabase root/intermediate CA PEM |
| Secret | `RAILWAY_PROD_TOKEN` | Production Railway project token |
| Variable | `PRODUCTION_API_URL` | `https://api.jobsclick.live` |
| Variable | `PRODUCTION_WEB_URL` | `https://jobsclick.live` |
| Variable | `STAGING_PROJECT_REF` | `afxgvtfaofpnlhdsexnp` (cross-target guard) |
| Variable | `PRODUCTION_PITR_VERIFIED` | `'true'` once Supabase PITR is verified active |

## 5. Forward-Fix & Recovery Procedures

1. **Forward-Fix (Default)**: Never edit an already-applied migration file. Author a new timestamped migration in `supabase/migrations/`, merge to `main`, validate on staging, and promote to production.
2. **Application Rollback**: Re-deploy the previous verified commit SHA on Railway while keeping backward-compatible (Expand-Migrate-Contract) schema changes.
3. **PITR Restore (Last Resort)**: If a destructive data incident occurs, pause writes, use the uploaded `prod-schema-<sha>.sql` artifact for schema reference, and restore via Supabase Dashboard > Database > Backups (Point-in-Time Recovery).
