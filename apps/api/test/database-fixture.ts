import { randomBytes } from "node:crypto";
import { Pool } from "pg";

import { migrate } from "../src/database/migrate.js";

// Each test run owns one schema. Never reset or drop the caller's other data.
export async function startDatabaseFixture(databaseUrl: string) {
  const schema = `database_fixture_${randomBytes(12).toString("hex")}`;
  const url = new URL(databaseUrl);
  url.searchParams.set("options", [
    `-c search_path=${schema},public`,
    "-c timezone=UTC",
    "-c statement_timeout=8000",
    "-c lock_timeout=4000",
  ].join(" "));

  const admin = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000 });
  const makePool = () => new Pool({ connectionString: url.href, max: 8, connectionTimeoutMillis: 5000 });
  let pool = makePool();
  let schemaCreated = false;
  let closing: Promise<void> | undefined;

  async function cleanup() {
    try {
      await pool.end();
    } finally {
      try {
        if (schemaCreated) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      } finally {
        await admin.end();
      }
    }
  }

  function close() {
    closing ??= cleanup();
    return closing;
  }

  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    schemaCreated = true;
    const { rows: [row] } = await pool.query<{ schema: string }>("SELECT current_schema() AS schema");
    if (row.schema !== schema) throw new Error("Database fixture schema isolation failed.");

    // Exercise the production migration, not a second copy of the table definitions.
    const applied = await migrate(pool);
    return {
      pool,
      schema,
      applied,
      close,
      async reconnect() {
        await pool.end();
        pool = makePool();
        return pool;
      },
    };
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Database fixture setup and cleanup failed.");
    }
    throw error;
  }
}
