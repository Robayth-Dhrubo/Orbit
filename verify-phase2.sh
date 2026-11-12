#!/usr/bin/env bash
set -euo pipefail
TARGET="${1:-${PWD}}"
cd "${TARGET}"
if [[ ! -f apps/api/package.json ]]; then
  echo "Run from ORBIT repository root or pass its absolute path." >&2
  exit 1
fi
if [[ -z "${TEST_DATABASE_URL:-}" ]]; then
  echo "Set TEST_DATABASE_URL to an isolated PostgreSQL test database first." >&2
  exit 1
fi
npm --prefix apps/api ci
npm --prefix apps/api run test:phase2
git diff --check
