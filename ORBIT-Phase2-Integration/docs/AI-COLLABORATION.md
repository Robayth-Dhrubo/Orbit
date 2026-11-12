# AI collaboration record — Robayth's integration contribution

Course: SOEN 387, Fall 2026. Project: ORBIT. Phase 2 integration.

## Assistance received

I asked ChatGPT to read the team's GitHub issues (#5–#8) and open pull requests (#9–#11), investigate integration differences, and produce my assigned authentication, authorization, OpenAPI and demo work. The assistant inspected the reported booking, persistence, and API implementations, created a source integration overlay for a local checkout, drafted new TypeScript JWT routes/middleware, a shared server, API adapters, the OpenAPI document, and authentication tests.

## Technical decisions and review points

1. Teammates' implementations were in `apps/api/` and `backend/`; the overlay copies the `backend/src` controller/service sources into the TypeScript build under `apps/api/src/team-api` while preserving their originals.
2. Booking and cancellation keep Yousef's transaction-safe paths, which already have race-test coverage. Mehjabin's tutor routes/domain logic and appointment listing use adapters into Azmain's repositories.
3. The API reconciles Mehjabin's `startTime` / `endTime` with Azmain's `startsAt` / `endsAt`; it documents the current absence of subject metadata.
4. Authentication uses bcrypt password verification, a one-hour HS256 JWT with issuer/audience validation, a database-backed role recheck, and trusted `req.auth` / `res.locals.auth` identities.
5. This package was generated without direct GitHub write access. Files were syntax-checked locally; full integrated npm/PostgreSQL verification must be performed in the team's checkout before merging. Do not represent it as independently verified end-to-end or merged.

## Human verification required

Review the code, resolve any integration conflicts, run the complete suite with an isolated PostgreSQL database, compare actual responses to `openapi.yaml`, and approve/commit only after validation. Preserve each teammate's attribution.
