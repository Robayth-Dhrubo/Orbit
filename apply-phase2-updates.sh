#!/usr/bin/env bash
# Apply the ready-to-review changes to an ORBIT clone, without pushing.
set -euo pipefail
KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-${HOME}/Orbit}"
if [[ ! -d "${TARGET}/.git" ]]; then
  echo "No git checkout at ${TARGET}. Cloning ORBIT..."
  git clone https://github.com/Robayth-Dhrubo/Orbit.git "${TARGET}"
fi
cd "${TARGET}"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: Working directory has uncommitted changes. Commit or stash them first." >&2
  exit 1
fi
if ! git remote get-url origin | grep -Eq '(^|[/:])Robayth-Dhrubo/Orbit(\.git)?$'; then
  echo "ERROR: This checkout does not point to Robayth-Dhrubo/Orbit." >&2
  exit 1
fi
git fetch origin main
git switch main
git merge --ff-only origin/main
if ! git merge-base --is-ancestor 9c78ddabcc7b66ff89a8ef59b7df3b76b155c18e HEAD; then
  echo "ERROR: main does not include the tested Phase 2 integration merge. Review the branch." >&2
  exit 1
fi
python3 "${KIT_DIR}/apply_phase2_updates.py" "${PWD}"
git diff --check
echo
echo "=== File changes ==="
git status --short
echo
echo "Run the test instructions from README.md. Review the diff, then commit and push yourself."
