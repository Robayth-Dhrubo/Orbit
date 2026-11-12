import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import SwaggerParser from "@apidevtools/swagger-parser";
import { Ajv } from "ajv";
import addFormats from "ajv-formats";
import { createOrbitApp } from "../src/app.js";
import { DEMO_IDS, seedDemo } from "../src/database/seed.js";
import { startDatabaseFixture } from "./database-fixture.js";

const contractPath = fileURLToPath(new URL("../../../openapi.yaml", import.meta.url));
const secret = "contract-test-only-secret-with-more-than-32-bytes";
const password = "Orbit-contract-demo-2026!";

test("published OpenAPI validates and all eight application operations conform over HTTP", { timeout: 120_000 }, async () => {
  const document = await SwaggerParser.validate(contractPath, { resolve: { external: false } });
  // SwaggerParser dereferences schemas; validate the actual received JSON, not fixtures.
  const paths = document.paths as Record<string, any>;
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats.default(ajv);
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("Set TEST_DATABASE_URL to an isolated PostgreSQL database before running test:contract.");
  const fixture = await startDatabaseFixture(databaseUrl);
  let server: import("node:http").Server | undefined;
  try {
    await seedDemo(fixture.pool, { password });
    server = createOrbitApp(fixture.pool, secret).listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const observed = new Set<string>();
    async function check(path: string, template: string, method: string, expected: number, init: RequestInit = {}): Promise<any> {
      const response = await fetch(base + path, { ...init, method: method.toUpperCase() });
      const text = await response.text();
      assert.equal(response.status, expected, `${method} ${path}: ${text}`);
      const operation = paths[template]?.[method];
      assert.ok(operation, `Operation is documented: ${method} ${template}`);
      const declared = operation.responses[String(response.status)];
      assert.ok(declared, `Status ${response.status} is documented: ${method} ${template}`);
      observed.add(`${method} ${template}`);
      assert.match(response.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/i);
      if (expected === 204) { assert.equal(text, ""); return undefined; }
      assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
      const body = JSON.parse(text);
      const validate = ajv.compile(declared.content["application/json"].schema);
      assert.equal(validate(body), true, JSON.stringify(validate.errors));
      if (body.error) assert.equal(body.error.correlationId, response.headers.get("x-request-id"));
      return body;
    }
    const json = (body: unknown, token?: string, key?: string): RequestInit => ({
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { "Idempotency-Key": key } : {}) },
      body: JSON.stringify(body),
    });
    const auth = (token: string): RequestInit => ({ headers: { Authorization: `Bearer ${token}` } });
    const registration = { email: "contract.student@orbit.test", password, role: "student" };
    const student = await check("/auth/register", "/auth/register", "post", 201, json(registration));
    await check("/auth/register", "/auth/register", "post", 409, json(registration));
    const tutor = await check("/auth/login", "/auth/login", "post", 200, json({ email: "tutor@orbit.test", password }));
    await check("/auth/login", "/auth/login", "post", 401, json({ email: registration.email, password: "wrong" }));
    await check("/auth/login", "/auth/login", "post", 400, json({ email: "bad", password }));
    await check("/auth/login", "/auth/login", "post", 400, { headers: { "Content-Type": "application/json" }, body: "{" });
    await check("/auth/login", "/auth/login", "post", 413, json({ email: registration.email, password: "x".repeat(40_000) }));
    await check("/auth/login", "/auth/login", "post", 415, { headers: { "Content-Type": "application/json; charset=iso-8859-1" }, body: "{}" });
    const tutors = await check("/tutors", "/tutors", "get", 200);
    assert.ok(tutors.some((item: { id: string }) => item.id === DEMO_IDS.tutorProfile));
    const slotPath = `/tutors/${DEMO_IDS.tutorProfile}/slots`;
    await check(slotPath, "/tutors/{tutorId}/slots", "get", 200);
    await check("/tutors/not-a-uuid/slots", "/tutors/{tutorId}/slots", "get", 400);
    await check("/tutors/10000000-0000-4000-8000-999999999999/slots", "/tutors/{tutorId}/slots", "get", 404);
    const start = new Date(Date.now() + 10 * 86_400_000);
    const slotBody = { startTime: start.toISOString(), endTime: new Date(start.getTime() + 3_600_000).toISOString() };
    const slot = await check(slotPath, "/tutors/{tutorId}/slots", "post", 201, json(slotBody, tutor.token));
    await check(slotPath, "/tutors/{tutorId}/slots", "post", 409, json(slotBody, tutor.token));
    await check(slotPath, "/tutors/{tutorId}/slots", "post", 403, json(slotBody, student.token));
    await check(slotPath, "/tutors/{tutorId}/slots", "post", 401, json(slotBody));
    await check("/appointments", "/appointments", "get", 401);
    await check("/appointments", "/appointments", "get", 403, auth(tutor.token));
    const booking = { slotId: slot.id, topic: "Contract verification", notes: "" };
    const receipt = await check("/appointments", "/appointments", "post", 201, json(booking, student.token, "contract-booking"));
    const replay = await check("/appointments", "/appointments", "post", 201, json(booking, student.token, "contract-booking"));
    assert.deepEqual(replay, receipt);
    await check("/appointments", "/appointments", "post", 409, json(booking, student.token, "different-key"));
    await check("/appointments", "/appointments", "post", 400, json(booking, student.token));
    await check("/appointments", "/appointments", "post", 403, json(booking, tutor.token, "tutor-cannot-book"));
    await check("/appointments", "/appointments", "get", 200, auth(student.token));
    await check(`/appointments/${receipt.appointmentId}`, "/appointments/{appointmentId}", "delete", 204, auth(student.token));
    await check(`/appointments/${receipt.appointmentId}`, "/appointments/{appointmentId}", "delete", 204, auth(student.token));
    await check("/appointments/10000000-0000-4000-8000-999999999999", "/appointments/{appointmentId}", "delete", 404, auth(student.token));
    assert.equal(observed.size, 8);
    await check("/health", "/health", "get", 200);
    const published = await fetch(base + "/openapi.yaml");
    assert.equal(published.status, 200);
    assert.equal(await published.text(), await readFile(contractPath, "utf8"));
    const docs = await fetch(base + "/docs");
    assert.equal(docs.status, 200);
    assert.match(await docs.text(), /ORBIT Phase 2 API contract/);
    const missing = await fetch(base + "/missing");
    assert.equal(missing.status, 404);
    const missingBody = await missing.json() as { error: { correlationId: string } };
    assert.equal(missingBody.error.correlationId, missing.headers.get("x-request-id"));
  } finally {
    if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    await fixture.close();
  }
});
