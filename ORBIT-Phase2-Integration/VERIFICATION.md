# Verification record — 2026-11-12

## Reviewed against actual GitHub branches

- Issue #6 specifies registration/login, password hashing, JWT, role authorization, OpenAPI and a demo.
- PR #9 includes the atomic booking router and race tests (`apps/api`).
- PR #10 is based on PR #9 and provides PostgreSQL schema, migrations, repositories and seed/test helpers.
- PR #11 provides tutor and appointment routes under a different `backend/` directory.
- The overlay preserves original team code and joins these into one `apps/api` server.

## Checks completed in the packaging environment

- Syntax-checked all six TypeScript source/test files using TypeScript's transpiler (no parse diagnostics).
- Parsed OpenAPI YAML; checked internal component references and eight expected operations.
- Checked shell script syntax with `bash -n` and parsed the new CI workflow YAML.
- Dry-ran installation into a simulated clean Git checkout and confirmed the expected files, scripts, and dependencies are created.
- Did not push anything to GitHub or merge any team's PR.

## Checks that MUST be run locally before a merge

- `npm install` in `apps/api`, generating the lockfile for the production JWT runtime dependency.
- `npm run typecheck` with original teammates' source trees and actual installed node modules.
- `npm run test:auth` with the authentication unit test suite.
- `npm run test:booking`, `npm run test:database`, `npm run test:race` with a disposable PostgreSQL instance.
- **NEW:** `npm run test:integration`, exercising real JWT, registration/login, tutor/slot authorization, PostgreSQL, idempotency, cancellation and a 20-way race through the unified app.
- Confirm `npm run dev` and the demo instructions match the OpenAPI response shapes.

The package is a **source integration candidate**, not a proven fully tested and merged build. GitHub rejected write access with a 403 in this chat; the user must push/create the PR using their local account.
