# ORBIT — Member 2: full-stack Docker Compose, readiness and restart verification

This is a **proposed Phase 3 handoff** prepared against `main` at `faa9676314fa31ae8250e418764046d0db9397ee` (November 12, 2026). It adds an API container alongside the existing PostgreSQL 17 service. It does not change existing migrations, booking rules, API response bodies, or teammate modules.

## What exists already

- `database/migrations/001_initial.sql` and `002_booking_payload_bounds.sql` both exist, and tests verify a clean install and upgrade.
- Migration checksums are immutable. Do **not** edit migration 001 or 002.
- If Yousef needs outbox tables, coordinate the exact names/columns/indexes before adding **003**. The outbox and notification worker are Yousef's assigned implementation; do not duplicate them in the database branch.
- `GET /health` is *liveness*: it only means Express is running.
- New `GET /ready` is *readiness*: it returns 200 only if PostgreSQL is reachable and schema versions 001/002 and the five core tables exist; otherwise 503 without disclosing credentials.

## Run both services on your Mac (Docker Desktop required)

1. Create a new branch from the current main, e.g. `feature/8-compose-readiness`. Apply the Member 2 changes and do not overwrite your teammates' subsequent commits. Commit only after reviewing `git diff`.
2. At repository root, copy `.env.example` to `.env`. **Replace** the placeholders for `POSTGRES_PASSWORD` and `JWT_SECRET` with fresh hexadecimal strings (e.g. `openssl rand -hex 24` and `openssl rand -hex 32`). Set `ORBIT_DB_PORT=5432`, `ORBIT_API_PORT=3000` (or free alternative host ports). Never commit `.env`.
3. Run:

```sh
docker compose up -d --build --wait
curl -i http://127.0.0.1:3000/health
curl -i http://127.0.0.1:3000/ready
```

`docker compose up` automatically applies pending migrations before starting Express. Docker stores PostgreSQL data in the **existing** `postgres_data` named volume. The first build installs dependencies in the Node 22 container. Use the configured host port if different from 3000.

If you want the existing Student A/B/Tutor fixture, set a demo password in **your local shell only** and run a one-off seed container. Never seed or reset shared/production data:

```sh
export DEMO_PASSWORD='YOUR_PRIVATE_LOCAL_DEMO_PASSWORD'
docker compose run --rm -e DEMO_PASSWORD api node --import tsx scripts/db-seed.ts
```

This adds demo data without resetting existing bookings. The restart test below uses new randomly named accounts and does not depend on the seed.

## Verify real appointment persistence through both restarts

From the repository root (requires Node.js 22+ on the host):

```sh
node --env-file=.env scripts/verify-compose.mjs
```

The script builds/starts the full stack if needed, creates unique test student/tutor accounts through the **real** API, creates an availability slot, confirms a booking, restarts `api`, verifies the booking and idempotent retry, restarts `db`, and verifies both again. It does not reset or delete database volumes. The last line must be `PASS: Member 2 Compose/readiness/persistence smoke check`. The script writes test data into your local Compose database and should never target a shared/production system.

After verification:

```sh
docker compose ps
docker compose logs --tail=80 api
docker compose logs --tail=80 db
docker compose stop
```

For outage behavior, while the API is still running, stop only PostgreSQL and check that `/health` stays 200 but `/ready` returns 503; then restart `db` and check `/ready` recovers to 200. **Never** use `docker compose down -v` on a database containing work you want to keep.

## Review/merge checklist

- Node typecheck and complete Phase 2 test suite pass on the proposed branch.
- The new readiness test passes with connected, missing-schema, and disconnected database scenarios.
- A clean `docker compose up -d --build --wait` starts both containers, and `docker compose ps` shows both healthy.
- The real HTTP smoke script prints PASS for both API and database restarts and idempotent replay.
- Database readiness returns 503 while PostgreSQL is stopped and returns 200 after recovery.
- The leader and Yousef agree on outbox table requirements before any third migration; no duplicate migration filenames.
- Commit evidence (branch hash, CI logs, demo output), request review, and merge only after checks pass.

## Limitations

This bundle was prepared without access to Docker Engine or a live PostgreSQL instance in the authoring environment. Static checks can be performed here, but **do not claim the new Docker configuration or restart smoke test passed until someone executes them**. Previous Phase 2 GitHub tests passed separately on the then-current `main` branch.
