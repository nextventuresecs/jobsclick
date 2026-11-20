#!/usr/bin/env bash
set -euo pipefail

DUPLICATE_DIR="packages/database/supabase/migrations"

if [ -d "$DUPLICATE_DIR" ] && [ ! -L "$DUPLICATE_DIR" ]; then
  echo "FAIL: Duplicate migration directory detected at $DUPLICATE_DIR."
  echo "Canonical migrations must only reside in supabase/migrations/."
  exit 1
fi

echo "SUCCESS: Single migration tree verified (canonical: supabase/migrations/)."
