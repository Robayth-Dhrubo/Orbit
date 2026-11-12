# Database Migrations

This directory contains versioned SQL migrations for the ORBIT PostgreSQL database.

## Migrations

* **`migrations/001_initial.sql`**: Initial schema defining:
  * `users` — Authentication accounts (student / tutor) with bcrypt password hashes.
  * `tutor_profiles` — Public profile metadata for tutors.
  * `availability_slots` — Future appointment slots with `btree_gist` non-overlapping constraint per tutor.
  * `appointments` — Booked appointments with partial unique index ensuring at most one confirmed appointment per slot.
  * `idempotency_records` — Cached API responses keyed by user ID, operation, and idempotency key.
  * `schema_migrations` — Internal table tracking applied migration filenames and SHA-256 checksums.

## Applying Migrations

Run from the repository root:

```bash
npm run db:migrate
```

Or from `apps/api`:

```bash
cd apps/api
npm run db:migrate
```

