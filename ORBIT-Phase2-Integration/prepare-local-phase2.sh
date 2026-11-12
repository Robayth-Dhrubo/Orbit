#!/usr/bin/env bash
# Non-destructive local integration: creates a NEW branch; never pushes or merges main.
set -euo pipefail
PACKAGE="$(cd "$(dirname "$0")" && pwd)"
REPO="${1:-}"
if [[ -z "$REPO" ]]; then echo "Usage: bash prepare-local-phase2.sh /absolute/path/to/Orbit" >&2; exit 2; fi
REPO="$(cd "$REPO" && pwd)"
if [[ ! -d "$REPO/.git" ]]; then echo "Not a Git checkout: $REPO" >&2; exit 2; fi
if [[ -n "$(git -C "$REPO" status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or stash your changes first; no files modified." >&2
  exit 2
fi
BRANCH="integration/phase2-$(date +%Y%m%d)"
if git -C "$REPO" show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "Branch $BRANCH already exists. Review it instead of overwriting." >&2
  exit 2
fi
git -C "$REPO" fetch origin
git -C "$REPO" switch -c "$BRANCH" origin/feature/8-postgresql-data-layer
# #8 is based on Yousef's #5. Incorporate Mehjabin's #11 only once.
git -C "$REPO" merge --no-ff origin/feature/core-booking-api -m "Integrate Mehjabin's Phase 2 API onto booking and database layers"
bash "$PACKAGE/apply-integration.sh" "$REPO"
cd "$REPO/apps/api"
npm install
npm run typecheck
npm run test:auth
cat <<'MESSAGE'
Local integration source prepared and authentication checks executed.
Next: configure PostgreSQL TEST_DATABASE_URL and run:
  npm run test:phase2
Run the 8-endpoint demo through `npm run dev` before approving a PR.
Review git diff/status; do not push or merge into main until tests pass.
MESSAGE
