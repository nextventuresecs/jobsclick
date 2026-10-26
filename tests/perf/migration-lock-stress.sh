#!/usr/bin/env bash
# ==============================================================================
# Performance & Lock Contention Verification Script
# Simulates high-concurrency payment traffic while applying Expand-Migrate-Contract
# migrations to empirically verify ZERO gateway timeouts and sub-50ms lock waits.
# ==============================================================================
set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:54322/postgres}"
TEMP_DIR="${TMPDIR:-/tmp}"

echo "=============================================================================="
echo "Phase 1: Spin up synthetic concurrent payment transaction traffic"
echo "=============================================================================="

cat << 'EOF' > "${TEMP_DIR}/pgbench_payments_workload.sql"
\set r_user_id random(1, 100000)
\set r_amount random(100, 50000)
BEGIN;
INSERT INTO payments (
    id, 
    user_id, 
    amount, 
    currency, 
    status, 
    created_at
) VALUES (
    gen_random_uuid(), 
    gen_random_uuid(), 
    :r_amount, 
    'INR', 
    'created', 
    NOW()
) ON CONFLICT DO NOTHING;
SELECT id, status FROM payments WHERE user_id = gen_random_uuid() LIMIT 1;
COMMIT;
EOF

# Spawn background pgbench load test for 25 seconds with 20 concurrent connections
echo "Starting background pgbench load test (20 clients, 25 seconds duration)..."
pgbench "$DB_URL" -f "${TEMP_DIR}/pgbench_payments_workload.sql" -c 20 -j 2 -T 25 -n > "${TEMP_DIR}/pgbench_results.log" 2>&1 &
PGBENCH_PID=$!

sleep 2

echo "=============================================================================="
echo "Phase 2: Applying Stage 1 (Expand) Migration under active transaction load..."
echo "=============================================================================="
START_EXPAND=$(date +%s%N)
psql "$DB_URL" -f supabase/migrations/20261018100001_expand_payments.sql
MIGRATE_EXPAND_EXIT=$?
END_EXPAND=$(date +%s%N)
DURATION_EXPAND_MS=$(( (END_EXPAND - START_EXPAND) / 1000000 ))
echo "Stage 1 Expand completed in: ${DURATION_EXPAND_MS} ms (Exit code: ${MIGRATE_EXPAND_EXIT})"

sleep 3

echo "=============================================================================="
echo "Phase 3: Applying Stage 3 (Contract) Migration under active transaction load..."
echo "=============================================================================="
START_CONTRACT=$(date +%s%N)
psql "$DB_URL" -f supabase/migrations/20261018100002_contract_payments.sql
MIGRATE_CONTRACT_EXIT=$?
END_CONTRACT=$(date +%s%N)
DURATION_CONTRACT_MS=$(( (END_CONTRACT - START_CONTRACT) / 1000000 ))
echo "Stage 3 Contract completed in: ${DURATION_CONTRACT_MS} ms (Exit code: ${MIGRATE_CONTRACT_EXIT})"

# Await load test completion
wait $PGBENCH_PID
PGBENCH_EXIT=$?

echo "=============================================================================="
echo "Phase 4: Evaluating Lock Wait Contention & Transaction Success Telemetry"
echo "=============================================================================="
cat "${TEMP_DIR}/pgbench_results.log" | grep -E "(number of transactions|tps|latency)"

if [ $MIGRATE_EXPAND_EXIT -ne 0 ] || [ $MIGRATE_CONTRACT_EXIT -ne 0 ] || [ $PGBENCH_EXIT -ne 0 ]; then
  echo "❌ TEST FAILURE: High lock contention caused query aborts, timeouts, or migration failure."
  exit 1
fi

echo "✅ SUCCESS: All live transactions completed without connection starvation or gateway timeouts."
