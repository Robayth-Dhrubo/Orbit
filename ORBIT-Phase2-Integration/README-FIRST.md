# ORBIT Phase 2 — Integration Package

**For:** SOEN 387 (Fall 2026), `Robayth-Dhrubo/Orbit`

**What it is:** A code overlay and safe local integration script prepared after reviewing [issue #5](https://github.com/Robayth-Dhrubo/Orbit/issues/5), [#6](https://github.com/Robayth-Dhrubo/Orbit/issues/6), [#7](https://github.com/Robayth-Dhrubo/Orbit/issues/7), [#8](https://github.com/Robayth-Dhrubo/Orbit/issues/8) and PRs [#9](https://github.com/Robayth-Dhrubo/Orbit/pull/9), [#10](https://github.com/Robayth-Dhrubo/Orbit/pull/10), [#11](https://github.com/Robayth-Dhrubo/Orbit/pull/11).

**Important:** The GitHub connector denied a branch-creation write (403). This package is not an already-merged GitHub commit or a complete copy of the team's repository. It is meant to be applied **to your actual local Git checkout**. Source syntax and YAML references have been checked, but PostgreSQL-backed integration tests have not been run here.

## Fast setup on macOS

1. Fetch the latest branches in GitHub Desktop and ensure your local ORBIT repository has no uncommitted changes.
2. Extract this ZIP outside the ORBIT repository (for example into Downloads).
3. Open Terminal, then run:

```sh
bash ~/Downloads/ORBIT-Phase2-Integration/prepare-local-phase2.sh /absolute/path/to/Orbit
```

The script fetches origin, creates a **new** `integration/phase2-YYYYMMDD` branch based on Azmain's branch (which already contains Yousef's booking code), merges Mehjabin's core API branch into this new branch, copies Robayth's auth/OpenAPI/integration files, runs npm install, TypeScript checks and authentication tests. An additional database-backed end-to-end test is included, and should be run with `TEST_DATABASE_URL` before merging. It will **never force-push or modify `main`**.

If you prefer to do the Git operations yourself, see `docs/PHASE2-INTEGRATION.md` and run `apply-integration.sh` after merging the code locally.

Next, configure a real PostgreSQL test database and run `npm run test:phase2`, then check the eight-endpoint HTTP demo and the spec. If all pass, commit the new integration files on the integration branch and create a PR to `main`. Do not upload the overlay ZIP directly onto `main`; the script first combines the teammates' source branches. Do not merge into main while tests are failing.

## New/modified code

- `apps/api/src/auth/auth.ts` — account registration, password hashing, login, signing/verifying JWT, DB role recheck
- `apps/api/src/integration/team-adapters.ts` — connects Mehjabin's service interfaces to Azmain and Yousef
- `apps/api/src/app.ts`, `server.ts` — unified server and centralized error responses
- `apps/api/test/auth.test.ts` — authentication cases
- `apps/api/test/integration.test.ts` — full HTTP integration against a disposable PostgreSQL schema, including real JWT roles, ownership, idempotency and a 20-student race
- `openapi.yaml` — eight operations, schemas, auth rules, errors and idempotency
- `.github/workflows/orbit-phase2-integration.yml` — CI verifies TypeScript, JWT, database, booking and 20-way HTTP race on PRs
- `docs/PHASE2-INTEGRATION.md` — integration decisions, run/test instructions, smoke demo, acceptance checklist
- `docs/AI-COLLABORATION.md` — transparent AI assistance documentation
- `.env.example` — safe placeholder names; never includes actual secrets

**Out of scope here:** final UI, email provider, outbox, full deployment, smart matching and waitlists. Whether an external-service demonstration is required in Phase 2 must be checked against the actual grading rubric; no such integration is claimed complete here.

## Review note

This ZIP is not a complete standalone ORBIT repository: it requires the original `feature/8-postgresql-data-layer` and `feature/core-booking-api` Git branches. A successful archive integrity check does **not** mean the integrated program passes TypeScript, database, contract, or race tests. Check GitHub Actions and the manual demo before merging.
