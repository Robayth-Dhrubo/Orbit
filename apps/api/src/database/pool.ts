import { Pool } from "pg";

/** Share this pool across repositories; use a checked-out client inside transactions. */
export function createDatabasePool(connectionString = process.env.DATABASE_URL): Pool {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required. See apps/api/.env.example.");
  }
  try {
    const url = new URL(connectionString);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      throw new Error("Invalid protocol");
    }
  } catch {
    // A connection URL can contain credentials, so never include it in this error.
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  const pool = new Pool({ connectionString, max: 20, connectionTimeoutMillis: 5000 });
  // During PostgreSQL container restarts, idle clients can emit an error event.
  // A listener prevents this from terminating Node. Queries reconnect as needed.
  pool.on("error", () => {
    console.error("Idle PostgreSQL connection was lost; reconnecting on the next query.");
  });
  return pool;
}

