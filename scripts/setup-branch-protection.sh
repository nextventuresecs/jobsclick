#!/usr/bin/env bash
# scripts/setup-branch-protection.sh
# Sets up GitHub branch protection for main and integration/launch using gh api.
# Usage: ./scripts/setup-branch-protection.sh [--dry-run]
set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

REPO="${GITHUB_REPOSITORY:-nextventuresecs/jobsclick}"
BRANCHES=("main" "integration/launch")

# Construct protection payload JSON
PAYLOAD_JSON=$(cat <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "build",
      "typecheck",
      "lint",
      "unit",
      "audit",
      "gitleaks",
      "e2e"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1,
    "require_last_push_approval": true,
    "bypass_pull_request_allowances": {
      "users": [],
      "teams": [],
      "apps": []
    }
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": false
}
EOF
)

if [[ "$DRY_RUN" == "true" ]]; then
  # Output a valid combined JSON object mapping each branch to its protection rule
  cat <<EOF
{
  "main": ${PAYLOAD_JSON},
  "integration/launch": ${PAYLOAD_JSON}
}
EOF
  exit 0
fi

for branch in "${BRANCHES[@]}"; do
  echo "Applying branch protection to ${branch} on ${REPO}..."
  # gh api requires PUT /repos/{owner}/{repo}/branches/{branch}/protection
  gh api \
    --method PUT \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "/repos/${REPO}/branches/${branch}/protection" \
    --input - <<< "$PAYLOAD_JSON"
  echo "Branch protection successfully applied to ${branch}."
done
