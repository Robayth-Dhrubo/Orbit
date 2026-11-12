# Phase 2 requirements and traceability

The operative repository requirements were checked on **November 12, 2026** against [parent issue #4](https://github.com/Robayth-Dhrubo/Orbit/issues/4) and [#5](https://github.com/Robayth-Dhrubo/Orbit/issues/5), [#6](https://github.com/Robayth-Dhrubo/Orbit/issues/6), [#7](https://github.com/Robayth-Dhrubo/Orbit/issues/7), and [#8](https://github.com/Robayth-Dhrubo/Orbit/issues/8). No course handout was present in the inspected ORBIT checkouts, so this document does not independently certify requirements in any separate instructor-issued brief.

| Requirement | Implementation/evidence location |
|---|---|
| Eight documented domain/auth operations, bearer security, error schema | Root `openapi.yaml`, `/docs`, `/openapi.yaml`, contract tests |
| Working route → service → repository → PostgreSQL layers | `apps/api/src/team-api`, `apps/api/src/integration`, concrete repositories |
| Password hashing, registration/login and expiring JWTs | `apps/api/src/auth/auth.ts`, authentication and integration tests |
| Trusted identity, tutor ownership, student appointment isolation | Auth middleware, core tutor/appointment services, integration tests |
| Persistent accounts, profiles, availability, appointments and idempotency records | Ordered SQL migrations and database tests |
| Unique email, foreign keys, roles/statuses, valid windows, confirmed-slot uniqueness | Migration constraints, direct database rejection tests |
| Repeatable seed and explicit scoped reset | `src/database/seed.ts`, setup guide, database tests |
| Shared transaction, rollback, row locking and original-response replay | Appointment service/repository, booking and database tests |
| Availability overlap protection under concurrency | PostgreSQL exclusion constraint, integration/database tests |
| Twenty students racing for one slot: one 201, nineteen 409, one confirmed row | Standalone race script and integrated HTTP test |
| Booking survives API restart | Integrated persistence check and demo procedure |
| Tested local startup and viewable contract | README, database setup, demo and verification record |
| Individual source contributions and understandable integration | Git history, branch/PR mapping and collaboration logs |
| Live team demonstration | Procedure in `phase2-demo.md`; the team performs/presents it |

A listed implementation or test is not itself proof of a passing run. See [`phase2-verification.md`](phase2-verification.md) for actual commands, results and merge state.

## Scope boundary

Issue #4 explicitly excludes Phase 3 UI polish, SmartMatch/waitlist, email/outbox automation, full deployment/observability, final report/oral-defense materials, and non-milestone production hardening. Issue #8 states that a second ordered migration is a full-project requirement rather than a Phase 2-specific requirement. Additional migration fixes may nevertheless be included to preserve append-only migration history.

Foreign-service integration therefore remains final-phase work: the planned Resend worker, timeout/retry/backoff, outbox persistence and failure-recovery tests are not implemented or verified by this backend milestone. Keeping them outside the booking transaction remains an architectural constraint.
