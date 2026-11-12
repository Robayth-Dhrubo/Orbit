#!/usr/bin/env python3
"""Apply the focused Robayth-owned changes to an existing ORBIT checkout.

Safety: exact content preconditions, no teammate modules modified, idempotent,
all validation occurs before writes.
"""
from __future__ import annotations
import pathlib
import sys
import textwrap

root = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else pathlib.Path.cwd()
app_path = root / "apps/api/src/app.ts"
workflow_path = root / ".github/workflows/orbit-booking-checks.yml"
readme_path = root / "README.md"
verification_path = root / "docs/robayth-main-handoff.md"
for path in (app_path, workflow_path, readme_path):
    if not path.is_file():
        raise SystemExit(f"Cannot find expected ORBIT file: {path}")

app = app_path.read_text(encoding="utf-8")
workflow = workflow_path.read_text(encoding="utf-8")
readme = readme_path.read_text(encoding="utf-8")

marker = "  // Structured request logging (no headers, tokens, emails or request bodies)."
if marker not in app:
    needle = "  app.use(correlation);\n"
    if app.count(needle) != 1 or "const correlation: RequestHandler" not in app:
        raise SystemExit("Unexpected app.ts layout. No files changed. Review the latest main before retrying.")
    logger = textwrap.dedent("""\
      // Structured request logging (no headers, tokens, emails or request bodies).
      const structuredRequestLog: RequestHandler = (request, response, next) => {
        const started = process.hrtime.bigint();
        let logged = false;
        const log = (outcome: "completed" | "aborted") => {
          if (logged) return;
          logged = true;
          const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
          const details = {
            timestamp: new Date().toISOString(),
            level: "info",
            event: "http_request",
            correlationId: String(response.locals.correlationId),
            method: request.method,
            statusCode: response.statusCode,
            durationMs: Math.round(durationMs * 100) / 100,
            outcome,
          };
          console.info(JSON.stringify(details));
        };
        response.once("finish", () => log("completed"));
        response.once("close", () => {
          if (!response.writableEnded) log("aborted");
        });
        next();
      };
      app.use(structuredRequestLog);
""")
    # Ensure indentation is consistent with createOrbitApp's body.
    logger = "\n".join("  " + line if line else "" for line in logger.rstrip("\n").split("\n")) + "\n"
    app = app.replace(needle, needle + logger, 1)

# The latest main workflow previously ran only four test families. Run all
# original core, auth, contract and DB suites (including TWO race checks).
if "branches: [main, cleanup/phase2-submission]" in workflow:
    workflow = workflow.replace("branches: [main, cleanup/phase2-submission]", "branches: [main]", 1)
old_step = """        run: |
          npm run test:database
          npm run test:booking
          npm run test:integration
          npm run test:race
          npm run test:race"""
new_step = "        run: npm run test:phase2"
if old_step in workflow:
    workflow = workflow.replace(old_step, new_step, 1)
elif new_step not in workflow:
    raise SystemExit("Unexpected CI workflow content. No files changed. Review changes to main.")

handoff = textwrap.dedent("""\
# Robayth — Main branch verification and Phase 3 handoff

This file records Robayth's integration and observability responsibilities. It does
not represent completion of teammates' Phase 3 features or a classroom demo.

## Existing Phase 2 implementation

The integrated backend lives in `apps/api`. Registration, login, JWT checks,
OpenAPI (`openapi.yaml`), PostgreSQL persistence, booking, cancellation and the
20-student race tests are implemented. The previous tested cleanup commit
`e2edba49dcc3061dd38f94dfa51d6ec8c49a02bc` passed 70 automated tests on
November 12, 2026. It is an ancestor of the November 12 `main` merge
`9c78ddabcc7b66ff89a8ef59b7df3b76b155c18e`.

The current CI workflow must run the *complete* `npm run test:phase2` suite,
not just database, booking, integration and race checks. The updated workflow
runs on `main`, relevant pull requests and manual dispatch.

## Request tracing

`X-Request-Id` and JSON `error.correlationId` identify the same request.
The Express app now emits JSON lines on HTTP completion or abort with UTC time,
level, event, correlationId, method, response status, elapsed milliseconds and
outcome. No Authorization header, passwords, tokens, emails, request bodies or
query strings are logged. The runtime emits a separate error log for unexpected
500s with the same correlation ID.

## Required final verification before pushing

1. Use Node.js 22+ and PostgreSQL 17 (or a compatible local PostgreSQL server).
2. Configure `apps/api/.env` for development with a private strong JWT secret,
   DEMO_PASSWORD and distinct `DATABASE_URL` and `TEST_DATABASE_URL` values.
3. From the repository root run `npm --prefix apps/api ci`.
4. Export a disposable PostgreSQL `TEST_DATABASE_URL` in the shell.
5. Run `npm --prefix apps/api run test:phase2`. All suites must pass.
6. Start API on port 3000 with `npm --prefix apps/api run dev` after migrations
   and seeding, then check `/health`, `/docs`, registration/login, tutor listings,
   slot publication, booking, replay, ownership and cancellation.
7. Check the GitHub Actions run on **the actual new `main` commit** after push.

No local PostgreSQL-backed run has been performed on this additional logging/CI
patch in the patch-authoring environment: it must be checked in the checkout
where these changes are applied. Do not treat the earlier 70-test run as proof
of the new commit.

## Teammate work not changed by this patch

- **Mehjabin:** minimal test frontend and frontend/backend integration.
- **Azmain:** deployment readiness and persistence reliability. The existing
  `compose.yaml` and second ordered migration are preserved as received.
- **Yousef:** foreign-service notification, outbox/worker, retries and recovery.

Do not begin or commit these features under Robayth's patch. Each teammate should
open their own PR and provide tests and AI-collaboration records.
""")

link = "[Robayth integration and verification handoff](docs/robayth-main-handoff.md)"
if link not in readme:
    anchor = "## Later project work\n"
    if readme.count(anchor) != 1:
        raise SystemExit("Unexpected README layout. No files changed.")
    readme = readme.replace(anchor, "## Integration verification and request tracing\n\n" +
        "The API emits structured, privacy-conscious JSON request logs with the " +
        "same correlation identifier used in the `X-Request-Id` header. " +
        "The complete CI workflow runs the same `test:phase2` command as local verification. " +
        "See the " + link + " for exact checks and teammate handoff.\n\n" + anchor, 1)

changes = {
    app_path: app,
    workflow_path: workflow,
    readme_path: readme,
    verification_path: handoff,
}
for path, content in changes.items():
    old = path.read_text(encoding="utf-8") if path.exists() else None
    if old != content:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        print(f"UPDATED {path.relative_to(root)}")
    else:
        print(f"UNCHANGED {path.relative_to(root)}")
print("Changes prepared. No commits or pushes were made.")
