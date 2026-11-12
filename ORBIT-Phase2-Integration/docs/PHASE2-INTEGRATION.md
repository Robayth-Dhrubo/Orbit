# ORBIT — SOEN 387 Phase 2 integrated API

**Integration status:** Source-level integration prepared from issues #5–#8 and PRs #9–#11. Not yet merged to GitHub; full PostgreSQL-backed end-to-end tests must run on the resulting checkout before calling Phase 2 complete.

## Source ownership and integration decisions

| Issue | Owner | Original code | Integration decision |
|---|---|---|---|
| #5 atomic booking, idempotency | Yousef | `apps/api/src/appointments/*` | Preserve the original `POST /appointments` and `DELETE /appointments/:id` router/service/repository; no duplicate booking algorithm |
| #8 PostgreSQL persistence | Azmain | `apps/api/src/database/*`, `src/users/*`, `src/tutors/*`, migration, seed | Preserve original schema and repository, reuse its transaction and database queries |
| #7 domain/API | Mehjabin | `backend/src/controllers/*`, `backend/src/services/*`, `backend/src/routes/*` | Preserve `backend/`; copy its sources to `apps/api/src/team-api/` at integration time. Use tutor routes/services and appointment listing controller/service with real adapters |
| #6 JWT, authorization, OpenAPI, demo | Robayth | This integration package | Implement auth/register, auth/login, JWT verification, role and ownership enforcement, full contract, demo steps, auth tests |

**Why two backend trees?** PR #11 uses `backend/` but #5/#8 use `apps/api/`. Simply merging those PRs does not produce one executable backend. This overlay makes `apps/api` the runtime entrypoint while preserving the contributors' source code.

**Priority of booking validation:** Use Yousef's original request validation (`topic` 1–200 chars, `notes` max 4,000, UUID slot ID, visible-ASCII idempotency key of length 1–255). This avoids a separate HTTP validation path in Mehjabin's earlier service with stricter, incompatible limits. Mehjabin's appointment listing controller and domain service remain wired; atomic booking/cancellation are reachable from its service adapter but route via Yousef's more extensively race-tested handler.

**Time-field compatibility:** Mehjabin's client API uses `startTime`/`endTime`. Azmain stores/exposes `startsAt`/`endsAt`. The adapter maps those fields in both directions; PostgreSQL `timestamptz` is returned as UTC ISO strings. Availability overlap is protected by Azmain's PostgreSQL GiST exclusion constraint, not a race-prone check in Express.

**Tutor profile limitation:** Mehjabin's API expects `name` and `subject` but Azmain's schema has `display_name` and `bio`, no course/subject field. The adapter maps `display_name` to `name` and returns an empty `subject` until course metadata is designed for Phase 3. Do not claim matching-by-subject works yet.

## Local integration (do not merge to main before verification)

In GitHub Desktop, fetch the remote branches. Or use these equivalent commands in a clean local clone:

```sh
git fetch origin
git switch feature/8-postgresql-data-layer
git switch -c integration/phase2
git merge --no-ff origin/feature/core-booking-api -m "Integrate Phase 2 API branch"
```

PR #10 is based on PR #9, so its branch already includes Yousef's files; do **not** merge PR #9 into #10 again. Merge #11 into the local integration branch once. If conflicts arise, examine and resolve them; do not force a merge or overwrite contributions.

Unzip this package elsewhere, then run from the extracted package:

```sh
bash apply-integration.sh /absolute/path/to/your/Orbit
```

The script checks that both teammates' code trees exist, copies the new source, preserves `backend/` and the root README, and updates package scripts/dependencies. It never changes a git ref and never edits `.env`.

## Requirements and setup

- Node.js 22+
- PostgreSQL 13+; a database user permitted to create `btree_gist` extension and schemas
- Do not use the production database for tests, races or demo resets

```sh
cd apps/api
npm install                 # regenerates package-lock.json for runtime jsonwebtoken
cp .env.example .env
```

Set the following local variables in `.env`:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/orbit
DEMO_PASSWORD=your-own-12-character-plus-demo-password
JWT_SECRET=a-random-secret-at-least-32-bytes-long
PORT=3000
TEST_DATABASE_URL=postgresql://TEST_USER:PASSWORD@localhost:5432/orbit_test
```

Generate a random local JWT secret rather than copying the placeholder. Never commit `.env`.

```sh
npm run db:migrate
npm run db:seed
npm run typecheck
npm run test:auth
npm run dev
```

`GET http://localhost:3000/openapi.yaml` exposes the committed OpenAPI contract. You can also upload the root `openapi.yaml` to [Swagger Editor](https://editor.swagger.io/) for interactive inspection. All routes use the same JSON error envelope `{ "error": { "code", "message", "correlationId" } }` except No Content 204.

## Five-minute demo

**1. Log in as seeded student:**

```sh
curl -sS -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"student.a@orbit.test","password":"YOUR_DEMO_PASSWORD"}'
```

Copy the returned `token` into a terminal variable (`TOKEN`). No password hash should appear in the response.

**2. Discover tutors and available slots:**

```sh
curl -sS http://localhost:3000/tutors
curl -sS http://localhost:3000/tutors/10000000-0000-4000-8000-000000001001/slots
```

**3. Book the first seeded slot:**

```sh
curl -i -X POST http://localhost:3000/appointments \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: phase2-demo-001' \
  -d '{"slotId":"10000000-0000-4000-8000-000000002001","topic":"Calculus"}'
```

Expected: **201** with `appointmentId`, `slotId`, `status:"confirmed"`. Repeating the **same** request and key returns the same 201 and appointment ID. A second student with a different key booking that same confirmed slot gets **409 SLOT_ALREADY_BOOKED**. Changing the body while reusing the same student's key gets **409 IDEMPOTENCY_CONFLICT**.

**4. List own appointments:**

```sh
curl -sS http://localhost:3000/appointments -H "Authorization: Bearer $TOKEN"
```

**5. Cancel** using the returned UUID; the owner receives 204. Then demonstrate rebooking with another student, and confirm a student cannot cancel someone else's appointment. Tutor login can publish a future slot only for that tutor's profile.

**6. Database race demo (disposable test DB):**

```sh
# TEST_DATABASE_URL must point to an isolated PostgreSQL database with schema-create permission.
export TEST_DATABASE_URL='postgresql://TEST_USER:PASSWORD@localhost:5432/orbit_test'
npm run test:phase2
```

`test:phase2` runs TypeScript, JWT tests, Yousef's booking suite, Azmain's DB suite, Yousef's 20-student HTTP race, and an additional unified API integration test exercising real JWTs, registration, login, slot ownership, appointment ownership, cancellation, idempotency, and a 20-student HTTP race. The test scripts create temporary test schemas. Read their setup requirements before running against shared databases.

## Phase 2 acceptance checks before merge

- [ ] `npm install` and `npm run typecheck` pass after merging the two source branches and applying the overlay
- [ ] `npm run test:auth` passes (correct/incorrect credentials; missing, forged and expired JWT; role mismatch; duplicate account)
- [ ] `npm run test:booking`, `npm run test:database`, `npm run test:race`, and `npm run test:integration` pass with isolated PostgreSQL
- [ ] Tutor routes use Postgres data, reject past and overlapping slots and enforce owner role/identity
- [ ] Student booking returns 201/409 correctly, same-key replay is stable, and cancellations release the slot
- [ ] Owner's GET `/appointments` shows only their appointments; cross-student access does not leak records
- [ ] 8 contract endpoints match `openapi.yaml` responses; review 400, 401, 403, 404, 409 cases
- [ ] Demo works through the *unified* `apps/api/src/server.ts` server, not only isolated PR test servers
- [ ] `.env` and JWT secret never committed; lockfile updated and committed
- [ ] After verified review, create integration PR targeting `main`; merge in team-approved order

## Known Phase 3 / outside current scope

Frontend polish, subject metadata, matchmaking, waitlist, email notifications/Resend/outbox, deployment pipelines, rate limiting, password reset, and production-grade monitoring. A third-party foreign-service integration is **not implemented** by this overlay and should be assessed against the official course rubric if required for Phase 2.

## Before you push your Issue #6 branch

The ZIP is **not** a replacement for the repository and should not be uploaded directly to `main`. Run the script against your clean local checkout. It creates a new integration branch based on Azmain (including Yousef), merges Mehjabin, and copies the Issue #6 files. Verify the diff, then from the ORBIT root:

```sh
git status --short
git add apps/api README.md docs openapi.yaml
git commit -m "feat(orbit): integrate JWT auth, OpenAPI and Phase 2 API"
git push -u origin "$(git branch --show-current)"
```

Create a pull request from that branch to `main`; seek team review and only merge after the full integration suite succeeds. The earlier GitHub connector returned 403 for writes, so these operations must be performed locally with your credentials.
