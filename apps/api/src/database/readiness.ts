import type { Express } from "express";
import type { Pool } from "pg";

/** Liveness is /health. Readiness also proves PostgreSQL and required migrations work. */
export function registerReadinessRoute(app: Express, pool: Pool): void {
  app.get("/ready", async (_request, response) => {
    try {
      // to_regclass resolves through the connection's active search_path.
      // A single query fails closed if PostgreSQL is unreachable or the
      // migration history table does not exist yet.
      const { rows } = await pool.query<{ ready: boolean }>(`
        SELECT (
          EXISTS (SELECT 1 FROM schema_migrations WHERE version = 1 AND name = '001_initial.sql')
          AND EXISTS (SELECT 1 FROM schema_migrations WHERE version = 2 AND name = '002_booking_payload_bounds.sql')
          AND to_regclass('users') IS NOT NULL
          AND to_regclass('tutor_profiles') IS NOT NULL
          AND to_regclass('availability_slots') IS NOT NULL
          AND to_regclass('appointments') IS NOT NULL
          AND to_regclass('idempotency_records') IS NOT NULL
        ) AS ready
      `);
      if (rows[0]?.ready === true) {
        response.status(200).json({ status: "ready" });
        return;
      }
    } catch {
      // Never expose SQL text, DB URLs, credentials or exception details.
    }
    response.status(503).json({ status: "not_ready" });
  });
}
