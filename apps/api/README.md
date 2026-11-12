# ORBIT API (`apps/api`)

The primary Express & TypeScript backend for the ORBIT Tutor Appointment Booking Service.

## Architecture

The API implements a clean layered architecture with centralized error handling and correlation IDs:

* **Entrypoint**: `src/server.ts` & `src/app.ts` (Express 5, JSON parsing limit 32kb, `GET /health`, `GET /openapi.yaml`).
* **Authentication & Authorization**: `src/auth/auth.ts` (bcryptjs, JWT HS256, database role verification).
* **Appointments & Atomic Booking**: `src/appointments/` (transaction isolation, row locks, idempotency key cache).
* **Tutors & Slots**: `src/team-api/` & `src/tutors/` (tutor profiles, non-overlapping availability slots).
* **Database Layer**: `src/database/` (PostgreSQL connection pool, advisory locks, migration runner, seed script).
* **Integration Adapters**: `src/integration/team-adapters.ts` (unifies domain services with database repositories).

## Quick Start

### 1. Configure Environment

```bash
cp .env.example .env
```

Ensure `.env` contains:
```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/orbit
DEMO_PASSWORD=your-own-12-character-plus-demo-password
JWT_SECRET=replace-with-a-random-secret-at-least-32-bytes-long
TEST_DATABASE_URL=postgresql://TEST_USER:PASSWORD@localhost:5432/orbit_test
```

### 2. Run Database Migrations & Seeds

```bash
npm run db:migrate
npm run db:seed
```

### 3. Start the Server

```bash
npm run dev     # Development mode with tsx hot reload
# or
npm start       # Production startup
```

## Available Scripts

| Script | Command | Purpose |
|---|---|---|
| `npm run typecheck` | `tsc --noEmit` | Verifies TypeScript types with zero errors |
| `npm run test:auth` | `tsx --test test/auth.test.ts` | Unit tests for password hashing, JWT signing, token expiry & forgery |
| `npm run test:booking` | `tsx --test test/booking.test.ts` | Tests atomic booking validation, idempotency & cancellation |
| `npm run test:database` | `tsx --test test/database.test.ts` | Integration tests for PostgreSQL repositories & transactions |
| `npm run test:integration` | `tsx --test test/integration.test.ts` | End-to-end HTTP tests with real JWTs and database persistence |
| `npm run test:race` | `tsx scripts/booking-race.ts` | 20-student concurrent race test against a single slot |
| `npm run test:phase2` | Full verification | Runs typecheck and all 5 test suites sequentially |
| `npm run db:migrate` | `scripts/db-migrate.ts` | Applies SQL migrations with advisory locking |
| `npm run db:seed` | `scripts/db-seed.ts` | Seeds 23 demo accounts, tutor profiles, and future slots |
| `npm run db:reset` | `scripts/db-seed.ts --reset` | Resets the demo fixtures (`--confirm` required) |
