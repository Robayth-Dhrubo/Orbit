# ORBIT — AI collaboration log

Records of AI-assisted work on ORBIT, one section per contributor. Each section was written by or for that contributor and describes their own work.

## Robayth — AI collaboration and Phase 2 integration

Date: **2026-11-12**. Repository: `Robayth-Dhrubo/Orbit`. AI assistant: OpenAI Codex. Authorized task: finish Phase 2 authentication, API documentation and integration; review teammate branches; run the complete milestone checks; merge only verified work while preserving the architecture and assignment scope.

### Contributions retained

| Contributor | Source branch / PR | Responsibility |
|---|---|---|
| Yousef | `feature/5-atomic-booking`, PR #9 | Atomic booking/cancellation, idempotency, locking and race tests |
| Azmain | `feature/8-postgresql-data-layer`, PR #10 | PostgreSQL schema, migrations, repositories and seed/setup; builds on #9 |
| Mehjabin | `feature/core-booking-api`, PR #11 | Core routes/controllers, domain services and unit/HTTP tests |
| Robayth, with Codex assistance | `6-authentication`, `integration/phase2-20261112` | Authentication, authorization, contract, adapters, complete verification and documentation |

At the start of this continuation, the Desktop checkout's integration branch already contained Yousef's, Azmain's and Mehjabin's source history through commits `d2c6b08` and `0ea2149`. Robayth's `6-authentication` branch held an integration package under a nested directory rather than a standalone runnable service. A separate older worktree contained unfinished edits. Both were inspected as sources; the older worktree's uncommitted work was preserved.

The active integration work used a local clone inside the task workspace. No teammate author identity was substituted and no history was rewritten. During the initial preparation, teammate branches were retained. The user subsequently requested cleanup of current `main` and deletion of completed old branches after verification; the final execution record distinguishes branch deletion from source-history preservation.

### Earlier ChatGPT package preparation

Before this continuation, Robayth asked ChatGPT to inspect issues #5–#8 and PRs #9–#11 and prepare the assigned authentication, authorization, OpenAPI and demo work. That assistant produced an integration overlay, TypeScript JWT routes/middleware, an application entry point, adapters, a contract and authentication tests. The package was prepared without direct GitHub write access and was only syntax-checked; it was not proof of a working integrated database service.

The overlay copied the original `backend/src` modules into `apps/api/src/team-api`, connected their time fields to the PostgreSQL repositories, and kept Yousef's transaction-safe booking/cancellation paths. It used bcrypt and one-hour HS256 JWTs with issuer/audience validation, a current database role check and trusted request identity. Its separate AI collaboration record has been consolidated here so the original assistance and verification limits remain documented.

### Assistance and corrections

Codex inspected repository history, live issues #4–8, source modules, test coverage and earlier integration material. Parallel reviews examined authentication/contract, domain/data behavior, and documentation/requirements. The work addressed:

- password hashing, credential validation, JWT issuance/verification and current database identity/role checks;
- the connection between core controllers/services and concrete repositories/atomic operations;
- missing runnable scripts and documentation, and duplicated core code that could diverge;
- a published OpenAPI contract aligned with actual responses and meaningful contract checks;
- migrations, repeatable setup/seed/reset, database constraints, persistence and concurrency verification;
- a complete test command, continuous integration checks and a reproducible presentation procedure.

After current `main` incorporated the earlier integration and nested package, the user requested a controlled cleanup. The final layout retains one runnable package under `apps/api`: the reviewed core modules in `src/team-api`, original core tests in `test/core`, one lockfile and one complete check command. Redundant `backend/`, `ORBIT-Phase2-Integration/`, the obsolete package-application guide, and the duplicate integration workflow were removed. These changes consolidate the same layered design rather than replacing it.

The prior documentation described planned architecture and pending module integration. It was replaced with current setup instructions and an explicit separation between Phase 2 and final-project scope. The earlier demo used `accessToken`; the current auth response uses `token`, so the instructions were corrected. The current `/docs` page is an offline contract viewer; the demo uses HTTP commands rather than assuming an interactive Swagger console.

The operative requirement source for this run was the repository issues. No original instructor handout was present in the inspected ORBIT directories. Foreign-service email/outbox, frontend, full deployment and final-report work are not represented as completed by the backend milestone.

AI-generated changes were reviewed and exercised where recorded. This log does not itself certify passing tests or a delivered classroom presentation. Every teammate remains responsible for understanding and explaining the submitted code.

## Azmain: issue #8 implementation record

This historical record describes AI-assisted work for the PostgreSQL/schema/repository task before full team integration. The handoff notes below describe the state at the original contribution.
It is not a claim that Azmain independently wrote or has already reviewed every
line. The implementation and explanations should be reviewed before the team
submits its individual contribution statement.

### Scope and existing work

The baseline is Yousef's PR #9, commit
`809d04de84fbb1814ef6aa82cc3f9054d64bb1fb`. Its booking/cancellation service,
router, race script, and original tests remain Yousef's contribution. This task
adds the migration, user/tutor repositories, owner-scoped appointment reads,
shared database setup, demo seed/reset commands, and database acceptance tests.
The existing transaction helper was extracted into a shared module with a
compatibility re-export. The booking fixture now uses the real migration.

### Representative AI collaboration

#### 1. Fit the data layer to the existing booking implementation

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

#### 2. Review the repeatable demo reset

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

#### 3. Test the migration that teammates will actually use

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

### Original team integration handoff

- Robayth: wire credential lookup/bcrypt comparison into authentication and align
  the published API/error contract; incorporate tested setup instructions.
- Mehjabin: use the tutor/slot and appointment repositories in the real routes.
- Yousef: review compatibility and rerun the race through the combined team API.
- Azmain: review these files and the explanation, and record the verified branch
  and tests accurately in the contribution statement.
