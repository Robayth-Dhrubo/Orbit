# ORBIT — Phase 2

ORBIT is a tutoring appointment REST service for **SOEN 387, Fall 2026**. The November 12 milestone covers a running Express/TypeScript API, JWT authentication, PostgreSQL persistence, a published OpenAPI contract, and concurrency-safe booking.

The milestone scope is recorded in [issue #4](https://github.com/Robayth-Dhrubo/Orbit/issues/4) and its four implementation tasks. See [the requirements checklist](docs/phase2-requirements.md), [the demonstration guide](docs/phase2-demo.md), and [the verification record](docs/phase2-verification.md) for scope and execution evidence.

## Quick start

Prerequisites: **Node.js 22+**, npm, and **PostgreSQL 17** (or Docker Compose for the supplied database configuration). PostgreSQL must provide `btree_gist`. Run from the repository root:

```sh
npm --prefix apps/api ci
cp apps/api/.env.example apps/api/.env
```

Create development and test databases, either using your PostgreSQL installation or the database-only Compose service described in [database setup](docs/database-setup.md). Edit `apps/api/.env` with your local values:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Development PostgreSQL connection URL |
| `TEST_DATABASE_URL` | Separate disposable test database URL |
| `JWT_SECRET` | Random signing secret of at least 32 UTF-8 bytes |
| `DEMO_PASSWORD` | Demo password: at least 12 characters, at most 72 UTF-8 bytes |
| `PORT` | API port; default `3000` |
| `NODE_ENV` | `development` for demo seeding |

Generate a signing secret with `openssl rand -hex 32`. Replace the example values; keep your `.env` local.

```sh
cd apps/api
npm run db:migrate
npm run db:seed
npm run dev
```

The seed creates Student A, Student B, a tutor, twenty race students, and two future slots. Accounts use your `DEMO_PASSWORD`:

- `student.a@orbit.test`
- `student.b@orbit.test`
- `tutor@orbit.test`
- `race.01@orbit.test` through `race.20@orbit.test`

Open [API documentation](http://localhost:3000/docs) or [OpenAPI YAML](http://localhost:3000/openapi.yaml). The source contract is [`openapi.yaml`](openapi.yaml). `GET /health` confirms that the API process is running. The API start commands and database commands load `apps/api/.env`.

Normal seeding preserves bookings. To refresh the demo slots, stop the API and run `npm run db:reset -- --confirm` from `apps/api`. Reset removes records belonging to the demo fixture, including other users' bookings on its two slots; see the exact scope in [database setup](docs/database-setup.md).

## Run the complete milestone checks

From the repository root, provide a separate disposable database:

```sh
export TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/orbit_test'
npm --prefix apps/api run test:phase2
```

The aggregate runs TypeScript checks, authentication, OpenAPI validation/conformance, database/repository, booking, integrated HTTP, race, and Mehjabin's core service and HTTP tests. All checks use the single `apps/api` package. Test commands read `TEST_DATABASE_URL` from the shell. Fixtures create isolated schemas and remove them afterward; the role must be allowed to create schemas and install `btree_gist` if it is not already available.

For a repeatable standalone concurrency demonstration:

```sh
npm --prefix apps/api run test:race
```

Each run creates a fresh slot and twenty distinct students. It succeeds only with **one HTTP 201, nineteen HTTP 409 responses, and exactly one confirmed PostgreSQL appointment matching the winner**. This module harness uses test JWTs; the integration suite additionally exercises the real authentication and application wiring. Actual results and limitations belong in [the verification record](docs/phase2-verification.md).

## API

| Method | Route | Access / result |
|---|---|---|
| POST | `/auth/register` | Student or tutor registration; tutors include `displayName` |
| POST | `/auth/login` | Credentials produce a signed, expiring JWT |
| GET | `/tutors` | Public tutor directory |
| GET | `/tutors/{tutorId}/slots` | Public future, unoccupied slots |
| POST | `/tutors/{tutorId}/slots` | Owning tutor only; rejects past/overlapping intervals |
| POST | `/appointments` | Student JWT and `Idempotency-Key`; confirms an available slot |
| GET | `/appointments` | Authenticated student's own appointment history |
| DELETE | `/appointments/{appointmentId}` | Owner only; safe to repeat |

Tutor IDs are **profile IDs**, distinct from user IDs. Requests and responses use camelCase, UUIDs and timezone-aware ISO 8601 timestamps; returned times are UTC. Protected operations use `Authorization: Bearer <token>`. Error responses use `{ "error": { "code", "message", "correlationId" } }`; `X-Request-Id` provides the request identifier.

Booking returns `201` with `appointmentId`, `slotId` and `status`. The same user/key/input replays the original response. Reusing a key for different input returns `409 IDEMPOTENCY_CONFLICT`; another student booking an occupied slot receives `409 SLOT_ALREADY_BOOKED`. Cancellation returns `204`, including an owner's retry. Unknown or other-owned appointment IDs return `404` without revealing ownership. A cancelled slot is available again, while its historical appointment remains in PostgreSQL.

Use [the short demo](docs/phase2-demo.md) for registration, login, tutor discovery, booking, ownership, cancellation, persistence and concurrency.

## Architecture

```text
HTTP routes/controllers → domain services → repositories → PostgreSQL
                                ↓
                      atomic booking transaction
```

- `apps/api/src/team-api/`: Mehjabin's canonical tutor/appointment controllers, routes, and service interfaces.
- `apps/api/src/auth/`: registration/login, password hashing, JWT verification and trusted identity.
- `apps/api/src/integration/`: adapters connecting the core services to concrete repositories and atomic operations.
- `apps/api/src/appointments/`: Yousef's atomic booking/cancellation, idempotency and PostgreSQL repository.
- `apps/api/src/users/`, `src/tutors/`, `src/database/`: Azmain's data layer, migration/seed support and shared transactions.
- `database/migrations/`: ordered, checksum-checked schema migrations.
- `apps/api/test/`: integrated, database and security checks; `test/core/` retains the core service and HTTP tests.
- `openapi.yaml`: published API contract.

No controller contains SQL. Booking serializes the authenticated user/operation/key, locks the requested slot using `SELECT … FOR UPDATE`, rechecks availability, inserts the appointment and stored response, then commits on the same connection. Cancellation takes the same slot lock. A partial unique index independently enforces one confirmed appointment per slot. A PostgreSQL exclusion constraint prevents overlapping availability, including concurrent publication from separate API instances. External services are not called while a booking lock is held.

## Team and integration

| Contributor | Phase 2 responsibility | Source branch |
|---|---|---|
| Robayth | Authentication, authorization, OpenAPI, documentation, integration | `6-authentication`, `integration/phase2-20261112` |
| Mehjabin | Core REST controllers and domain services | `feature/core-booking-api` |
| Azmain | PostgreSQL schema, repositories, migrations and seed/setup | `feature/8-postgresql-data-layer` |
| Yousef | Atomic booking, locking, idempotency and race tests | `feature/5-atomic-booking` |

The integration retains the teammates' source history and layered architecture. The branch names above identify source contributions; merged branches may be deleted after verification. The runnable code is consolidated under `apps/api`, with one dependency lockfile and no overlay-copy step. Branch integration, verification and GitHub merge status are recorded separately in [the verification record](docs/phase2-verification.md). AI-assisted work is documented in [Robayth's collaboration log](docs/robayth-ai-collaboration.md) and [Azmain's existing log](docs/azmain-ai-collaboration.md). Each teammate remains responsible for explaining their contribution during the milestone demonstration.

## Later project work

The issue-defined Phase 2 milestone does not include the React frontend, SmartMatch/waitlist, Resend email integration, transactional outbox/background retries, full application deployment/observability, final report or oral-defense materials. These remain Phase 3/final-project work. The database-only Compose service assists local setup; it is not a complete production deployment. No external-service integration is claimed by this milestone.
