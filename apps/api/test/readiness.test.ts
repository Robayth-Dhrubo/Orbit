import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { Pool } from "pg";
import { createOrbitApp } from "../src/app.js";

const secret = "only-for-orbit-readiness-test-not-for-deployment";

test("liveness and database readiness are different, and readiness fails closed", async () => {
  let state: "ready" | "missing_migrations" | "disconnected" = "ready";
  const pool = {
    async query(sql: string) {
      assert.match(sql, /schema_migrations/);
      if (state === "disconnected") throw new Error("database connection terminated");
      return { rows: [{ ready: state === "ready" }] };
    },
  } as unknown as Pool;
  const server = createOrbitApp(pool, secret).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    const good = await fetch(`${base}/ready`);
    assert.equal(good.status, 200);
    assert.deepEqual(await good.json(), { status: "ready" });

    state = "missing_migrations";
    const missing = await fetch(`${base}/ready`);
    assert.equal(missing.status, 503);
    assert.deepEqual(await missing.json(), { status: "not_ready" });

    state = "disconnected";
    assert.equal((await fetch(`${base}/health`)).status, 200);
    const down = await fetch(`${base}/ready`);
    assert.equal(down.status, 503);
    assert.deepEqual(await down.json(), { status: "not_ready" });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
