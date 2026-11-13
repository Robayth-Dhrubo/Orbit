#!/usr/bin/env node
// Run from the repository root with Node.js 22 and Docker Compose.
// Registers fresh demo-only accounts; never deletes a shared database or volume.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const base = `http://127.0.0.1:${process.env.ORBIT_API_PORT || '3000'}`;
function compose(...args) {
  console.log(`docker compose ${args.join(' ')}`);
  execFileSync("docker", ["compose", ...args], { stdio: "inherit" });
}
async function ready() {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${base}/ready`, { signal: AbortSignal.timeout(5000) });
      if (r.status === 200 && (await r.json()).status === "ready") return;
    } catch { /* API or DB can be unavailable during restart. */ }
    await delay(1000);
  }
  throw new Error("API /ready failed to return HTTP 200 within the restart check window");
}
async function request(method, path, { body, token, key } = {}) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await r.text();
  const value = raw ? JSON.parse(raw) : null;
  return { status: r.status, value };
}
function expectStatus(result, expected, operation) {
  assert.equal(result.status, expected, `${operation}: ${JSON.stringify(result.value)}`);
  return result.value;
}

try {
  if (!process.argv.includes("--already-up")) compose("up", "-d", "--build", "--wait");
  await ready();
  console.log("PASS: API is database-ready after startup");

  const suffix = randomUUID().slice(0, 8);
  const password = `Orbit-smoke-${randomUUID()}`;
  const tutorName = `Deployment Tutor ${suffix}`;
  const tutorAuth = expectStatus(await request("POST", "/auth/register", {
    body: { email: `smoke.tutor.${suffix}@orbit.test`, password, role: "tutor", displayName: tutorName },
  }), 201, "register tutor");
  const studentAuth = expectStatus(await request("POST", "/auth/register", {
    body: { email: `smoke.student.${suffix}@orbit.test`, password, role: "student" },
  }), 201, "register student");
  const tutors = expectStatus(await request("GET", "/tutors"), 200, "list tutors");
  const profile = tutors.find(x => x.displayName === tutorName);
  assert.ok(profile?.id, "Newly registered tutor profile should appear in database-backed listing");

  const start = new Date(Date.now() + 30 * 86400000);
  const end = new Date(start.getTime() + 3600000);
  const slot = expectStatus(await request("POST", `/tutors/${profile.id}/slots`, {
    token: tutorAuth.token, body: { startTime: start.toISOString(), endTime: end.toISOString() },
  }), 201, "publish tutor slot");
  const input = { slotId: slot.id, topic: `Deployment restart ${suffix}` };
  const key = `deployment-smoke-${randomUUID()}`;
  const receipt = expectStatus(await request("POST", "/appointments", {
    token: studentAuth.token, key, body: input,
  }), 201, "create appointment");
  assert.ok(receipt.appointmentId);

  async function assertPersisted() {
    const data = expectStatus(await request("GET", "/appointments", { token: studentAuth.token }), 200, "list persisted appointments");
    assert.ok(data.some(x => x.appointmentId === receipt.appointmentId && x.status === "confirmed"));
    const replay = expectStatus(await request("POST", "/appointments", {
      token: studentAuth.token, key, body: input,
    }), 201, "idempotent replay after restart");
    assert.equal(replay.appointmentId, receipt.appointmentId);
  }

  await assertPersisted();
  compose("restart", "api");
  await ready();
  await assertPersisted();
  console.log("PASS: appointment and idempotency survive API container restart");

  compose("restart", "db");
  await ready();
  await assertPersisted();
  console.log("PASS: appointment and idempotency survive PostgreSQL container restart");
  console.log("PASS: Member 2 Compose/readiness/persistence smoke check");
} catch (error) {
  console.error("FAIL:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
