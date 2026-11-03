#!/usr/bin/env bash
# scripts/test-migration-cycle.sh
# Automated idempotency test: Apply -> Rollback -> Apply
set -euo pipefail

MIGRATION_FILE="packages/database/supabase/migrations/20261102100000_user_mutations_and_starter_credits.sql"
ROLLBACK_FILE="packages/database/supabase/rollbacks/20261102100000_user_mutations_and_starter_credits.rollback.sql"

echo "=== 1. Applying Forward Migration ==="
psql "${DATABASE_URL}" -f "${MIGRATION_FILE}"

echo "=== 2. Applying Rollback (Down-Migration) ==="
psql "${DATABASE_URL}" -f "${ROLLBACK_FILE}"

echo "=== 3. Re-Applying Forward Migration (Idempotency Check) ==="
psql "${DATABASE_URL}" -f "${MIGRATION_FILE}"

echo "=== Migration Cycle PASSED Cleanly ==="
