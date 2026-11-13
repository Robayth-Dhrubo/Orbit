# ORBIT — Phase 2

ORBIT is a tutoring appointment REST service for **SOEN 387, Fall 2026**. The November 12 milestone covers a running Express/TypeScript API, JWT authentication, PostgreSQL persistence, a published OpenAPI contract, and concurrency-safe booking.

The milestone scope is recorded in [issue #4](https://github.com/Robayth-Dhrubo/Orbit/issues/4) and its four implementation tasks. See [the requirements checklist](docs/phase2-requirements.md), [the demonstration guide](docs/phase2-demo.md), and [the verification record](docs/phase2-verification.md) for scope and execution evidence.

## Run Phase 2

Use Docker Compose to start the API and PostgreSQL together. From the repository root, copy the example environment file and replace `POSTGRES_PASSWORD` and `JWT_SECRET` in `.env` with locally generated values. Use a URL-safe password and a signing secret of at least 32 bytes.

```sh
cp .env.example .env
docker compose up --build -d --wait
curl -fsS http://localhost:3000/ready
```

The API applies the SQL migrations at startup. Open [API documentation](http://localhost:3000/docs) or [OpenAPI YAML](http://localhost:3000/openapi.yaml). If you change `ORBIT_API_PORT`, use that port in the URLs. For demo accounts, restart checks, and setup without the API container, see the [Compose guide](docs/member2-deployment.md) and [database setup](docs/database-setup.md).

## Test and demo

To run the suite from the repository root, use Node.js 22+ and a separate disposable PostgreSQL 17 database with schema-creation permission and `btree_gist` available.

```sh
npm --prefix apps/api ci
export TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/orbit_test'
npm run test:phase2
```

The suite validates TypeScript and OpenAPI and exercises authentication, role and ownership checks, real PostgreSQL persistence, idempotency, and two booking races. Run `npm run test:race` for a standalone race. Each run sends 20 concurrent requests and expects one HTTP 201, nineteen HTTP 409 responses, and one confirmed appointment in PostgreSQL.

Follow the [short demo](docs/phase2-demo.md) for the full booking workflow. See the [verification record](docs/phase2-verification.md) for test evidence and the [documentation index](docs/README.md) for implementation details.

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

The runnable API is under `apps/api`. [Robayth’s collaboration log](docs/robayth-ai-collaboration.md) and [Azmain’s collaboration log](docs/azmain-ai-collaboration.md) record AI-assisted work.
