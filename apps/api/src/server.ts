import { createDatabasePool } from "./database/pool.js";
import { createOrbitApp } from "./app.js";

const secret = process.env.JWT_SECRET;
if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
  throw new Error("Set JWT_SECRET to a random value at least 32 bytes long.");
}
const port = Number(process.env.PORT ?? "3000");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT.");
const pool = createDatabasePool();
const app = createOrbitApp(pool, secret);
const server = app.listen(port, () => console.log(`ORBIT API listening on port ${port}`));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => { void pool.end().finally(() => process.exit(0)); });
  });
}
