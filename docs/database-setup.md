# Database setup — Phase 2

The integrated service uses Azmain's PostgreSQL schema/repositories and Yousef's transaction-safe booking service, connected to Robayth's authentication and Mehjabin's core API. Start the API with `npm run dev` from `apps/api` after the migration and seed steps below.

## 1. Prepare the local database

Use **Node.js 22+** and **PostgreSQL 17** (the verification target). Create a local development database and a role that can connect and create tables/indexes in the target schema.

The migration installs `btree_gist` in the `public` schema to enforce nonoverlapping tutor slots. The database role must have permission to install it, or a database administrator must install it in that database first:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;
```

If PostgreSQL reports that the extension is unavailable, install the extension package supplied with your PostgreSQL installation. Keep `public` in the connection's `search_path`; the isolated database tests use their own schema followed by `public`.

### Option A: local PostgreSQL

Create separate development and test databases using your configured PostgreSQL role:

```sh
createdb orbit
createdb orbit_test
```

Use your actual role, password and port in the connection URLs. If a database already exists, keep it; do not drop it to repeat setup.

### Option B: the supplied Compose database

Run from the repository root. Choose your local database password and keep it available in this shell for subsequent Compose commands:

```sh
export POSTGRES_PASSWORD='YOUR_LOCAL_DATABASE_PASSWORD'
docker compose up -d --wait db
docker compose exec -T db createdb -U orbit orbit_test
```

The service creates the `orbit` development database with user `orbit`; the last command creates the separate test database. Run that command once; an "already exists" response means the test database is already present. Set `ORBIT_DB_PORT` before starting Compose if port `5432` is occupied, for example `export ORBIT_DB_PORT=55433`.

Use your chosen password and host port in both `.env` connection URLs: database `orbit` for `DATABASE_URL`, and `orbit_test` for `TEST_DATABASE_URL`. Percent-encode reserved characters in a password embedded in a URL. The Compose volume preserves database contents when the container restarts. `docker compose stop db` stops it without deleting data. This setup starts PostgreSQL only; run the Node API separately.

### Install and configure the API

From the repository root:

```sh
cd apps/api
npm ci
cp .env.example .env
```

Edit the local `.env` file:

- `DATABASE_URL`: your local PostgreSQL connection URL, including database name.
- `DEMO_PASSWORD`: your own demo password, at least 12 characters and no more than 72 UTF-8 bytes. Replace the example value.
- `NODE_ENV`: keep `development` for demo data. The seed command refuses production mode.
- `JWT_SECRET`: a random value of at least 32 UTF-8 bytes; generate one with `openssl rand -hex 32`.
- `TEST_DATABASE_URL`: a separate disposable database for checks.
- `PORT`: the API listening port (default `3000`).

The database commands load `apps/api/.env`. Keep that file and real credentials out of Git.

## 2. Apply the schema and create demo data

Run from `apps/api`:

```sh
npm run db:migrate
npm run db:seed
```

`db:migrate` applies the numbered SQL files in `database/migrations/` in order and records each version, filename, SHA-256 checksum, and application time in `schema_migrations`. The schema and its history record commit together. A database advisory lock serializes concurrent migration runs. Running the same unchanged migration again is a no-op. Editing an already-applied migration produces a checksum error; later schema changes belong in a new ordered migration.

The seed command prints the account and slot IDs. It creates **23 accounts**:

| Accounts | Email |
|---|---|
| Student A | `student.a@orbit.test` |
| Student B | `student.b@orbit.test` |
| Tutor | `tutor@orbit.test` |
| Twenty race students | `race.01@orbit.test` through `race.20@orbit.test` |

All use the supplied `DEMO_PASSWORD`, stored as independently salted `bcryptjs` hashes with cost 10. The login service verifies these hashes through `findUserCredentialsByEmail` and `bcryptjs.compare`. Public authentication responses exclude password hashes.

The seed also creates the tutor profile and two one-hour slots roughly two days in the future. Repeating normal seeding **preserves bookings and existing slot times** while refreshing the demo password hashes. If the slots have become occupied or old, use the explicit reset below.

### Reset the demo fixture

Stop any API process using this demo data before resetting it:

```sh
npm run db:reset -- --confirm
```

This command is destructive within the demo fixture. It removes appointments belonging to seeded student accounts **or** using either seeded slot, removes idempotency records owned by those students or referencing those slots in their saved response, and recreates the two demo slots in the future. It does not truncate the whole database or remove unrelated accounts/bookings. A non-demo account's booking on a demo slot is within the reset scope. Without `--confirm`, reset is refused.

## 3. Integrate the data layer

These imports are relative to a module directly inside `apps/api/src`:

```ts
import { createDatabasePool } from './database/pool.js';
import { inTransaction } from './database/transaction.js';
import { findUserCredentialsByEmail } from './users/repository.js';
import { listTutors, listAvailableSlots, createOwnedSlot } from './tutors/repository.js';
import { listOwnedAppointments } from './appointments/repository.js';
import { bookAppointment, cancelAppointment } from './appointments/service.js';
```

Create one shared pool with `createDatabasePool()`. Ordinary repository operations accept a `Pool` or `PoolClient`. For a multi-step operation, use `inTransaction(pool, async client => { ... })` and pass **that same client** to every repository call. The helper begins a `READ COMMITTED` transaction, commits on success, rolls back on failure, and releases the connection. A separate `pool.query()` inside the callback does not share that transaction.

| Module | Available integration points |
|---|---|
| `src/users/repository.ts` | `createUser`, `findUserById`, `findUserByEmail`, `findUserCredentialsByEmail`. Emails are trimmed and lowercased. `createUser` expects an already-hashed password. Public user results exclude the hash. |
| `src/tutors/repository.ts` | Tutor lookup/listing, `createTutorProfile`, `listAvailableSlots`, `findSlotById`, `findSlotForUpdate`, `findOwnedSlot`, `createSlot`, `createOwnedSlot`. Owner-scoped methods take the authenticated user's ID. |
| `src/appointments/repository.ts` | Existing booking/idempotency helpers plus `findConfirmedAppointment`, `findOwnedAppointment`, `listOwnedAppointments`. Owned reads filter by student ID in SQL. |
| `src/appointments/service.ts` | `bookAppointment` and `cancelAppointment` retain Yousef's locking and retry logic. Route handlers should call these services rather than directly insert or cancel bookings. |

`findSlotForUpdate` requires a checked-out `PoolClient` inside a transaction; its row lock lasts until that transaction ends. Do not replace Yousef's booking flow with this single helper: the existing service also handles idempotency, availability rechecks, ownership, and error translation.

Tutor IDs are **tutor-profile IDs**, distinct from the associated user's ID. `createOwnedSlot` checks that the requested tutor profile belongs to the supplied user. Domain services must still enforce authentication, roles, ownership, and input validation. Database repositories do not produce HTTP responses.

Slot timestamps use `timestamptz`. Supply timestamps with an explicit timezone; returned slot times are UTC ISO strings ending in `Z`. `listAvailableSlots` returns future slots without a confirmed appointment. Slot intervals use `[start, end)`, so adjacent slots are allowed while overlapping slots for one tutor are rejected.

## 4. Preserve database error mappings

Map expected failures in the domain/service layer and return the published API error shape. Do not expose raw database errors or infer the meaning of every `23505` error without checking its constraint name.

| SQLSTATE / constraint | Meaning and integration action |
|---|---|
| `23505` / `one_confirmed_appointment_per_slot` | Another confirmed appointment owns this slot. Yousef's service already maps this exact name to `409 SLOT_ALREADY_BOOKED`; preserve it. |
| `23505` / `users_email_key` | The normalized email already exists. Robayth's registration service should map this to its documented account-conflict response. |
| `23505` / `idempotency_records_user_operation_key_unique` | A user/operation/key tuple already exists. Preserve Yousef's serialization and stored-response logic; do not create a second booking. |
| `23P01` / `availability_slots_no_overlap` | Tutor availability overlaps another published interval. Mehjabin's service should return the agreed conflict response. |
| `23514` / `availability_slots_ends_after_starts` | End time is not later than start time. Reject invalid intervals in request/domain validation as well. |

The confirmed-appointment index is **partial**: it includes only rows whose status is `confirmed`. Cancelled appointments remain in history while allowing a new confirmed appointment for that slot.

## 5. Team handoff and checks

| Owner | Issue | Connection to this contribution |
|---|---|---|
| Robayth | #6 | Authentication, authorization, OpenAPI, final README/demo documentation, and application integration. Uses credential lookup, password comparison, and user IDs/roles. |
| Mehjabin | #7 | Tutor/appointment REST API and domain layer. Uses tutor, availability, and owner-scoped appointment repositories; maps expected database failures. |
| Yousef | #5 | Atomic booking, locking, idempotency, and race tests. Existing service and exact database constraint names are retained. |
| Azmain | #8 | Schema, migrations, repositories, shared transaction support, and repeatable local database/demo setup. |

For checks, set `TEST_DATABASE_URL` in the shell to a **disposable PostgreSQL database**, then run from `apps/api`:

```sh
npm run test:phase2
```

The test database role needs permission to create test schemas; the database tests also require the extension setup above. Test commands use `TEST_DATABASE_URL` from the shell. They create and remove isolated schemas. `test:database` exercises the real migrations and repositories. The standalone booking/race harness uses its own fixture schema and test JWTs; `test:integration` exercises the real authentication and complete application. The race script creates its own users and slot rather than consuming the seeded demo accounts.

Actual execution results and limitations are recorded in [`phase2-verification.md`](phase2-verification.md).

## 6. Docker Compose with the API and database (Member 2 deployment)

The earlier Compose instructions in section 1 start PostgreSQL only. For the new **two-container API + PostgreSQL setup**, health/readiness behavior, and API/database restart verification, follow [Member 2's deployment guide](member2-deployment.md). This uses an append-only migration sequence and preserves the named database volume across restarts. The new `/ready` endpoint checks PostgreSQL and migration readiness; `/health` only checks API liveness.
