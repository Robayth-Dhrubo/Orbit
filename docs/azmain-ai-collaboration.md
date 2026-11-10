# Azmain: issue #8 implementation record

This record describes AI-assisted work for the PostgreSQL/schema/repository task.
It is not a claim that Azmain independently wrote or has already reviewed every
line. The implementation and explanations should be reviewed before the team
submits its individual contribution statement.

## Scope and existing work

The baseline is Yousef's PR #9, commit
`809d04de84fbb1814ef6aa82cc3f9054d64bb1fb`. Its booking/cancellation service,
router, race script, and original tests remain Yousef's contribution. This task
adds the migration, user/tutor repositories, owner-scoped appointment reads,
shared database setup, demo seed/reset commands, and database acceptance tests.
The existing transaction helper was extracted into a shared module with a
compatibility re-export. The booking fixture now uses the real migration.

## Representative AI collaboration

### 1. Fit the data layer to the existing booking implementation

Request: implement the PostgreSQL work assigned in #8 and keep it compatible
with the connected teammates' work.

AI output: an initial migration, typed repository functions, and a migration
runner. The implementation was compared with the existing booking SQL and
fixture to preserve UUIDs, timestamp types, the idempotency tuple, and the exact
`one_confirmed_appointment_per_slot` index name used by conflict handling.

Correction/decision: the broader proposal includes outbox data and multiple
migrations, but issue #8 explicitly excludes those final-phase additions.
This implementation contains only the initial Phase 2 migration. Overlap safety
uses a database exclusion constraint rather than a unique start time.

### 2. Review the repeatable demo reset

Request: create Student A, Student B, a tutor, two future slots, and 20 race
accounts, with hashed passwords and a repeatable seed/reset sequence.

Initial AI output: a targeted reset deleted known demo slot IDs and checked slot
ownership afterward. Review found that a reserved ID already owned by another
tutor could therefore be removed before the check.

Correction: lock existing reserved slot rows and validate their tutor before any
deletion, inside the same transaction. A regression test checks rejection,
rollback, and preservation of the unrelated slot, booking, and retry record.
Normal seeding preserves bookings; explicit reset removes only fixture-owned
work. Each account receives its own salted bcrypt hash.

### 3. Test the migration that teammates will actually use

Request: verify the database invariants and compatibility with Yousef's booking
work using PostgreSQL, including rollback, locking, ownership, and repeatable setup.

AI output: isolated-schema database tests and extensions to the existing booking
workflow. Review replaced the booking fixture's copied table definitions with
the actual migration, so the existing booking suite and 20-request races test
the real schema too. Tests reopen application connections to check persistence
and verify owner scoping and overlapping intervals with different start times.

Validation status must be taken from the latest CI run for this branch. A
TypeScript pass alone is not evidence that PostgreSQL behavior passed. Test JWTs
in the booking harness are not Robayth's production authentication integration.

## Remaining team integration

- Robayth: wire credential lookup/bcrypt comparison into authentication and align
  the published API/error contract; incorporate tested setup instructions.
- Mehjabin: use the tutor/slot and appointment repositories in the real routes.
- Yousef: review compatibility and rerun the race through the combined team API.
- Azmain: review these files and the explanation, and record the verified branch
  and tests accurately in the contribution statement.
