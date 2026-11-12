#!/usr/bin/env bash
# Apply ORBIT Phase 2 integration files to a local checkout combining PR #10 and #11.
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="${1:-$(pwd)}"
DEST="$(cd "$DEST" && pwd)"
if [[ ! -d "$DEST/.git" || ! -f "$DEST/apps/api/src/database/transaction.ts" || ! -f "$DEST/apps/api/src/appointments/service.ts" ]]; then
  echo "ERROR: target must be an ORBIT checkout with Azmain's branch (including Yousef's files)." >&2
  exit 1
fi
if [[ ! -f "$DEST/backend/src/services/tutors.service.ts" || ! -f "$DEST/backend/src/controllers/appointments.controller.ts" ]]; then
  echo "ERROR: target is missing Mehjabin's backend/src. Merge feature/core-booking-api first." >&2
  exit 1
fi
mkdir -p "$DEST/.github/workflows"
mkdir -p "$DEST/apps/api/src/team-api" "$DEST/apps/api/src/auth" "$DEST/apps/api/src/integration" "$DEST/apps/api/test" "$DEST/docs"
# Keep Mehjabin's complete original backend/ in git. Copy the code into the app's
# TypeScript build so Node's package resolution works from apps/api/node_modules.
cp -R "$DEST/backend/src/." "$DEST/apps/api/src/team-api/"
cp "$SRC/apps/api/src/auth/auth.ts" "$DEST/apps/api/src/auth/auth.ts"
cp "$SRC/apps/api/src/integration/team-adapters.ts" "$DEST/apps/api/src/integration/team-adapters.ts"
cp "$SRC/apps/api/src/app.ts" "$DEST/apps/api/src/app.ts"
cp "$SRC/apps/api/src/server.ts" "$DEST/apps/api/src/server.ts"
cp "$SRC/apps/api/test/auth.test.ts" "$DEST/apps/api/test/auth.test.ts"
cp "$SRC/apps/api/test/integration.test.ts" "$DEST/apps/api/test/integration.test.ts"
cp "$SRC/apps/api/.env.example" "$DEST/apps/api/.env.example"
cp "$SRC/openapi.yaml" "$DEST/openapi.yaml"
cp "$SRC/.github/workflows/orbit-phase2-integration.yml" "$DEST/.github/workflows/orbit-phase2-integration.yml"
cp "$SRC/docs/PHASE2-INTEGRATION.md" "$DEST/docs/PHASE2-INTEGRATION.md"
cp "$SRC/docs/AI-COLLABORATION.md" "$DEST/docs/robayth-ai-collaboration.md"
# Preserve Azmain's existing scripts and dependencies while moving the JWT
# runtime library from devDependencies to dependencies.
node - "$DEST/apps/api/package.json" <<'NODE'
const fs = require('node:fs');
const path = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
pkg.dependencies ??= {};
pkg.devDependencies ??= {};
pkg.scripts ??= {};
pkg.dependencies.jsonwebtoken = pkg.devDependencies.jsonwebtoken || '^9.0.2';
delete pkg.devDependencies.jsonwebtoken;
pkg.scripts.dev = 'node --env-file=.env --import tsx src/server.ts';
pkg.scripts.start = 'node --env-file=.env --import tsx src/server.ts';
pkg.scripts['test:auth'] = 'tsx --test test/auth.test.ts';
pkg.scripts['test:integration'] = 'tsx --test test/integration.test.ts';
pkg.scripts['test:phase2'] = 'npm run typecheck && npm run test:auth && npm run test:booking && npm run test:database && npm run test:race && npm run test:integration';
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
NODE
# Appendix only: do not replace the team's README.
if [[ -f "$DEST/README.md" ]] && ! grep -q 'Phase 2 integrated API' "$DEST/README.md"; then
  cat >> "$DEST/README.md" <<'MARKDOWN'

## Phase 2 integrated API

For unified startup, authentication, database seed, OpenAPI, and milestone verification, see [`docs/PHASE2-INTEGRATION.md`](docs/PHASE2-INTEGRATION.md).
MARKDOWN
fi
cat <<'MESSAGE'
ORBIT integration source copied. Next (from apps/api):
  npm install              # updates package-lock.json for runtime jsonwebtoken
  cp .env.example .env     # enter actual local credentials and random JWT secret
  npm run typecheck
  npm run test:auth
  npm run test:phase2      # includes integrated HTTP/JWT/DB/20-student race tests; requires TEST_DATABASE_URL
Do not commit .env, passwords, or JWT signing secrets.
MESSAGE
