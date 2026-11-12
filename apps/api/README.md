# ORBIT API

The runnable Phase 2 service lives here. Start with the [repository setup guide](../../README.md) and [database instructions](../../docs/database-setup.md). Node.js 22+ and PostgreSQL are required. Install the locked dependencies once in `apps/api`. The API uses a layered Express and TypeScript architecture with centralized error handling and correlation IDs; its entrypoint serves `GET /health` and `GET /openapi.yaml`.

The original core API modules now live in `src/team-api`, and their tests live in `test/core`.

```sh
npm ci
cp .env.example .env
# Edit .env with your database URLs, signing secret and demo password.
npm run db:migrate
npm run db:seed
npm run dev
```

`dev` and `start` load `.env` and start `src/server.ts`. The database commands also load `.env`. Test commands use the shell's `TEST_DATABASE_URL`; the tests must use a separate disposable database:

```sh
export TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/orbit_test'
npm run test:phase2
```

| Command | Purpose |
|---|---|
| `typecheck` | API TypeScript validation |
| `test:auth` | Credentials, tokens and public auth response checks |
| `validate:openapi` | Published OpenAPI validity |
| `test:contract` | Contract and response conformance |
| `test:database` | Real migrations, seed/reset, constraints and repositories |
| `test:booking` | Atomic booking, cancellation, replay and rollback |
| `test:integration` | Full application against real PostgreSQL and JWT middleware |
| `test:race` | Twenty distinct students compete for a fresh slot |
| `test:team` | Core service and HTTP tests in `test/core` |
| `test:phase2` | All milestone checks from this single package, including two fresh race runs |

The [verification record](../../docs/phase2-verification.md) records actual execution results. The [demo](../../docs/phase2-demo.md) exercises the service manually. API documentation is available at `/docs`; the source is [`../../openapi.yaml`](../../openapi.yaml), served at `/openapi.yaml`.

## Booking transaction contract

`src/appointments/service.ts` is the single transaction-sensitive booking/cancellation implementation. Routers call it with identity taken from verified auth middleware, never an owner ID supplied by the client.

Booking first serializes the `(authenticated student, operation, idempotency key)` scope, then locks the availability slot. The availability check, appointment insertion and stored successful response use the same database connection and transaction. The response is returned only after commit. Slot row locking coordinates competing requests across API instances; the `one_confirmed_appointment_per_slot` partial unique index is an independent safeguard.

The same user/key/canonical input returns the original `201` and appointment ID. Different input with that key returns `409 IDEMPOTENCY_CONFLICT`. Idempotency records are not shared between users. A new key for an occupied slot returns `409 SLOT_ALREADY_BOOKED`.

Cancellation looks up the owned appointment and takes the same slot lock before changing its status. Owner retries return `204`; unknown and other-owned appointments return `404`. Cancelled rows remain in history and the slot can be rebooked. Replaying a successful original booking key after cancellation still returns the original stored receipt; fetch the owner's appointment list for current state.

Slot publication uses PostgreSQL's exclusion constraint to reject overlapping tutor availability. Intervals use `[start, end)`, allowing adjacent slots. Published slot times are not edited while bookings rely on them.

## Layer boundaries

- `src/app.ts` assembles middleware, routes, documentation and error handling.
- `src/auth/` hashes and verifies passwords, issues and verifies JWTs, and validates current database identity and role.
- `src/team-api/` contains canonical core controllers, routes and domain service interfaces.
- `src/integration/` adapts these interfaces to concrete repository and atomic booking functions.
- `src/users/`, `src/tutors/` and `src/appointments/repository.ts` contain parameterized SQL; `src/appointments/` implements atomic booking and cancellation.
- `src/database/` owns the PostgreSQL connection pool, shared transactions, advisory locks, migrations and demo data.

No external HTTP service runs inside a booking transaction. Resend/outbox integration belongs to the later project phase.
