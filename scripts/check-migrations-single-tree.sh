#!/usr/bin/env bash
set -euo pipefail

node "$(dirname "$0")/ci/check-migrations-single-tree.js"

