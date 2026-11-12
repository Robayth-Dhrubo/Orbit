# ORBIT — Robayth's Phase 2 Development Handoff

**Course:** SOEN 387 — Web-Based Enterprise Application Design, Fall 2026  
**Repository:** [Robayth-Dhrubo/Orbit](https://github.com/Robayth-Dhrubo/Orbit)  
**Scope:** Authentication, authorization, OpenAPI contract, integration coordination, request tracing, documentation and CI.

## 1. Delivered Phase 2 implementation

The single active API implementation is `apps/api/`. The following are implemented in the integrated service:

- Registration and login: `POST /auth/register`, `POST /auth/login`; bcrypt password hashing and signed, expiring JWTs.
- Per-user security: verified JWT identity, student/tutor roles, tutor profile ownership, and student appointment isolation.
- API contract: `openapi.yaml` documents the eight business/auth operations; `GET /openapi.yaml` and `GET /docs` expose it.
- Integration: `apps/api/src/app.ts` connects the domain controllers, authorization middleware, PostgreSQL adapters and Yousef's atomic booking router.
- Safe API errors: documented JSON error envelopes `{ "error": { "code", "message", "correlationId" } }` and `X-Request-Id`.
- Request observability: HTTP request completion/abort produces one JSON log line with UTC timestamp, method, status code, duration, outcome and the same correlation ID as the response header. To avoid logging sensitive data, URL paths, query strings, Authorization headers, passwords, JWTs, cookies and request bodies are excluded.

The existing source code remains divided by responsibility. This handoff does not claim Robayth authored another contributor's database or booking code.

## 2. Required verification after uploading the files

This handoff records implementation, **not a new passing test run**. The following verification must be performed on the final commit using a separate, disposable PostgreSQL test database:

```sh
# From the repository root:
npm --prefix apps/api ci
export TEST_DATABASE_URL='postgresql://TEST_USER:PASSWORD@127.0.0.1:5432/orbit_test'
npm --prefix apps/api run test:phase2
```

The aggregate script performs TypeScript checks, OpenAPI validation, original core controller/service tests, authentication tests, OpenAPI HTTP conformance, database tests, booking tests, full HTTP integration tests and **two** 20-student race runs. A successful race must produce one HTTP 201, nineteen HTTP 409 responses and one confirmed PostgreSQL record.

Review the GitHub Actions results for the **actual final commit on `main`**. A prior cleanup commit `e2edba49dcc3061dd38f94dfa51d6ec8c49a02bc` passed 70 tests, but that run does not certify any subsequent changes.

For the live milestone demonstration follow [`phase2-demo.md`](./phase2-demo.md), including persistence after restart, idempotent retry, access control and concurrent requests.

## 3. GitHub housekeeping

At the time this handoff was prepared, three temporary scripts had been committed at repository root:

- `apply-phase2-updates.sh`
- `apply_phase2_updates.py`
- `verify-phase2.sh`

They are distribution helpers, not part of the runtime application. **Delete them from the GitHub repository after the new code files have been uploaded and the complete workflow is green.** Do not delete any of the active `apps/api/`, `database/`, or `docs/` source and test files.

A working GitHub Action is not proof that the in-class demonstration has occurred. Close the Phase 2 parent issue only after the team confirms all required work and the short demonstration.

## 4. Ownership and later-phase work

| Contributor | Existing Phase 2 responsibility | Remaining final-project responsibility |
|---|---|---|
| Robayth | Authentication, authorization, contract, integration, CI and documentation | Coordinate integration, report, contract evolution and oral defense |
| Mehjabin | Tutor/appointment controllers and domain logic | Minimal testing frontend and frontend/API integration |
| Azmain | PostgreSQL repositories, migrations and repeatable local database setup | Application deployment and database readiness |
| Yousef | Atomic booking, idempotency, cancellation and race protection | Foreign notification integration, asynchronous worker, retries and failure handling |

The official course project also requires a backward-compatible contract change, a stability measure, a basic frontend, asynchronous foreign-service integration, liveness/readiness checks and a final report. **Those are full-project requirements, not claims of completed Phase 2 functionality.**

## 5. Record the final results

Once the files have been committed, record the final commit SHA, GitHub Actions URL, number of passing tests, and actual live demo date in the team verification record. Do not invent or copy test outcomes from older commits.
