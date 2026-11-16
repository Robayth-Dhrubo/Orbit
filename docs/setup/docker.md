# ORBIT Docker Compose setup

The API and PostgreSQL 17 run together in Docker Compose. [PR #14](https://github.com/Robayth-Dhrubo/Orbit/pull/14) added readiness and restart verification.

## Health checks and migrations

- `database/migrations/001_initial.sql` and `002_booking_payload_bounds.sql` both exist, and tests verify a clean install and upgrade.
- Migration checksums are immutable. Do **not** edit migration 001 or 002.
- `GET /health` is *liveness*: it only means Express is running.
- New `GET /ready` is *readiness*: it returns 200 only if PostgreSQL is reachable and schema versions 001/002 and the five core tables exist; otherwise 503 without disclosing credentials.

## Run both services locally

From the repository root, copy `.env.example` to `.env` if needed. Replace `POSTGRES_PASSWORD` and `JWT_SECRET` with fresh hexadecimal strings generated using `openssl rand -hex 24` and `openssl rand -hex 32`. Change `ORBIT_DB_PORT` or `ORBIT_API_PORT` if a default host port is occupied.

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
