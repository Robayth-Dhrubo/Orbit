# Appointment booking and cancellation

This module implements the transaction-sensitive endpoints for [Orbit #5](https://github.com/Robayth-Dhrubo/Orbit/issues/5). The Express router calls the service, which keeps all booking and idempotency writes on one PostgreSQL connection and commits before returning the response.

## Run the checks

Use Node.js 22 or newer and a disposable PostgreSQL 13+ database. Set `TEST_DATABASE_URL` to its connection URL. The database user needs permission to create a schema. Each run creates a fresh schema and starts an Express server on a loopback port. The test harness creates fixture users, signs fixture JWTs and removes its schema when it finishes.

```sh
npm ci
npm run typecheck
npm run test:booking
npm run test:race
```

Run these commands from `apps/api`. The race script sends 20 simultaneous POST requests for one slot using different student accounts and keys. It exits successfully only if it sees one 201, nineteen 409 SLOT_ALREADY_BOOKED responses, and one confirmed row matching the winning appointment and student.

## Connect to the team API

- Mount `createAppointmentRouter(pool)` at the API root after verified JWT middleware populates `res.locals.auth` with `{ userId, role }`. Use this router for POST and DELETE appointments so those routes share the transaction service. The test JWT setup lives in `test/booking-fixture.ts`.
- Match the repository SQL and fixture DDL with the team's migrations. It expects UUID IDs, timezone-aware slot timestamps, appointments with confirmed/cancelled status, and JSONB idempotency responses. Preserve the unique user/operation/key tuple and `one_confirmed_appointment_per_slot` partial unique index. That index name is used to map SQLSTATE 23505 to a booking conflict.
- Booking first locks the key scope (authenticated student, operation, key), then locks the slot row. A fresh read after the slot lock checks the PostgreSQL clock and reads any booking committed by a previous lock holder. Cancellation looks up the owned appointment and takes the same slot lock before updating it.
- Slot publication needs its own database-backed overlap protection. If implemented with row locking, lock the tutor profile in the same transaction before checking for a slot with `starts_at < proposed_end AND ends_at > proposed_start` and inserting. Keep published slot times fixed for booking. Availability publication and its overlap checks belong in the team API.
- Align the following provisional details with the published OpenAPI contract. Booking takes a UUID slot ID, a nonblank topic of up to 200 characters, optional notes of up to 4,000 characters, and a single 1–255-character visible ASCII idempotency key without commas. Missing or invalid fields return 400. Unsupported JSON charset or content encoding returns 415. A missing slot returns 404. A started slot, occupied slot, or reused key with different input returns 409 with its own error code. Booking and replay return 201 with `{ appointmentId, slotId, status }`. Cancellation returns 204 for the owner, including retries. Unknown and other-owned appointments return 404.

## Contribution and verification

Codex assisted with the booking service, PostgreSQL repository, route adapter, fixture and tests. The module was exercised through HTTP and verified against PostgreSQL 17.11. The team's authentication middleware, migrations, availability routes, and published OpenAPI contract still need integration and review.
