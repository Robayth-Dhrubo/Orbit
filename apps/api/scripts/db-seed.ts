import { createDatabasePool } from "../src/database/pool.js";
import { resetDemo, seedDemo } from "../src/database/seed.js";

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some(arg => !["--reset", "--confirm"].includes(arg))) {
    throw new Error("Usage: db-seed.ts [--reset --confirm]");
  }
  const reset = args.has("--reset");
  if (process.env.NODE_ENV === "production") throw new Error("Demo data is only for local development/testing.");
  if (reset && !args.has("--confirm")) {
    throw new Error("Reset removes demo bookings. Run npm run db:reset -- --confirm to proceed.");
  }
  const password = process.env.DEMO_PASSWORD;
  if (!password || password === "replace-with-a-local-demo-password") {
    throw new Error("Set your own DEMO_PASSWORD in .env before seeding.");
  }
  const pool = createDatabasePool();
  try {
    const result = await (reset ? resetDemo : seedDemo)(pool, { password });
    console.log(JSON.stringify(result, null, 2));
    console.log(reset ? "Demo bookings reset; two future slots are free." : "Demo data ready; existing bookings were preserved.");
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Demo setup failed.");
  process.exitCode = 1;
});
