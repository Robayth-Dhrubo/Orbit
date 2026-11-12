/**
 * Full-stack Phase 2 check against a disposable PostgreSQL schema.
 * The fixture migrates the REAL database schema and never modifies an existing
 * team's application schema. Set TEST_DATABASE_URL to a disposable database.
 */
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import jwt from "jsonwebtoken";

import { createOrbitApp } from "../src/app.js";
import { DEMO_IDS, seedDemo } from "../src/database/seed.js";
import { startDatabaseFixture } from "./database-fixture.js";

const secret = "only-used-by-orbit-integration-tests-not-for-deployment";
const password = "Orbit-demo-integration-2026!";

type AuthResult = { token: string; user: { id: string; email: string; role: string; passwordHash?: string } };
type BookingResult = { appointmentId: string; slotId: string; status: string };
type SlotResult = { id: string; tutorId: string; startTime: string; endTime: string };

function authorize(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

test("integrated Phase 2: JWT, authorization, PostgreSQL, booking and 20-way race", { timeout: 120_000 }, async (t) => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("Set TEST_DATABASE_URL to an isolated PostgreSQL database before running test:integration.");

  const fixture = await startDatabaseFixture(databaseUrl);
  let pool = fixture.pool;
  let server: import("node:http").Server | undefined;
  try {
    await seedDemo(fixture.pool, { password });
    const app = createOrbitApp(fixture.pool, secret);
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    let base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    async function post(path: string, body: object, token?: string, key?: string) {
      return fetch(base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? authorize(token) : {}), ...(key ? { "Idempotency-Key": key } : {}) },
        body: JSON.stringify(body),
      });
    }
    async function login(email: string, pass = password): Promise<AuthResult> {
      const response = await post("/auth/login", { email, password: pass });
      assert.equal(response.status, 200, `login for ${email}: ${await response.clone().text()}`);
      return response.json() as Promise<AuthResult>;
    }

    const studentA = await login("student.a@orbit.test");
    const studentB = await login("student.b@orbit.test");
    const tutor = await login("tutor@orbit.test");
    assert.equal(studentA.user.role, "student");
    assert.equal(studentA.user.passwordHash, undefined);
    assert.equal((await post("/auth/login", { email: "student.a@orbit.test", password: "wrong" })).status, 401);

    const registration = await post("/auth/register", {
      email: "student.extra@orbit.test", password: "New-student-pass-2026!", role: "student",
    });
    assert.equal(registration.status, 201);
    const registered = await registration.json() as AuthResult;
    assert.equal(registered.user.passwordHash, undefined);
    assert.equal((await post("/auth/register", {
      email: "student.extra@orbit.test", password: "New-student-pass-2026!", role: "student",
    })).status, 409);
    assert.equal((await login("student.extra@orbit.test", "New-student-pass-2026!")).user.id, registered.user.id);

    assert.equal((await fetch(base + "/appointments")).status, 401);
    assert.equal((await fetch(base + "/appointments", { headers: authorize("not-a-real-jwt") })).status, 401);
    const expired = jwt.sign({ role: "student" }, secret, {
      algorithm: "HS256", issuer: "orbit-api", audience: "orbit-client", subject: studentA.user.id, expiresIn: -5,
    });
    assert.equal((await fetch(base + "/appointments", { headers: authorize(expired) })).status, 401);
    const wrongRole = jwt.sign({ role: "tutor" }, secret, {
      algorithm: "HS256", issuer: "orbit-api", audience: "orbit-client", subject: studentA.user.id, expiresIn: 600,
    });
    assert.equal((await fetch(base + "/appointments", { headers: authorize(wrongRole) })).status, 401);
    assert.equal((await fetch(base + "/appointments", { headers: authorize(tutor.token) })).status, 403);

    const tutorList = await fetch(base + "/tutors");
    assert.equal(tutorList.status, 200);
    const tutors = await tutorList.json() as Array<{ id: string }>;
    assert.ok(tutors.some(item => item.id === DEMO_IDS.tutorProfile));
    assert.deepEqual(Object.keys(tutors[0]).sort(), ["bio", "displayName", "id"]);
    assert.equal((await fetch(base + "/tutors/not-a-uuid/slots")).status, 400);
    assert.equal((await fetch(base + "/tutors/00000000-0000-4000-8000-000000000001/slots")).status, 404);
    const slotsResponse = await fetch(base + `/tutors/${DEMO_IDS.tutorProfile}/slots`);
    assert.equal(slotsResponse.status, 200);
    const slots = await slotsResponse.json() as SlotResult[];
    assert.ok(slots.some(item => item.id === DEMO_IDS.slots[0]));

    const futureStart = new Date(Date.now() + 6 * 86400000);
    const futureEnd = new Date(futureStart.getTime() + 3600000);
    const newSlot = { startTime: futureStart.toISOString(), endTime: futureEnd.toISOString() };
    assert.equal((await post(`/tutors/${DEMO_IDS.tutorProfile}/slots`, newSlot)).status, 401);
    assert.equal((await post(`/tutors/${DEMO_IDS.tutorProfile}/slots`, newSlot, studentA.token)).status, 403);
    for (const body of [
      { startTime: "2030-02-30T12:00:00Z", endTime: "2030-03-01T13:00:00Z" },
      { startTime: "2030-01-01T12:00:00", endTime: "2030-01-01T13:00:00" },
      { startTime: new Date(Date.now() - 86400000).toISOString(), endTime: futureEnd.toISOString() },
      { startTime: futureEnd.toISOString(), endTime: futureStart.toISOString() },
      { ...newSlot, userId: studentA.user.id },
    ]) {
      assert.equal((await post(`/tutors/${DEMO_IDS.tutorProfile}/slots`, body, tutor.token)).status, 400);
    }
    const createdSlot = await post(`/tutors/${DEMO_IDS.tutorProfile}/slots`, newSlot, tutor.token);
    assert.equal(createdSlot.status, 201, await createdSlot.clone().text());
    const created = await createdSlot.json() as SlotResult;
    assert.equal(created.tutorId, DEMO_IDS.tutorProfile);
    assert.equal((await post(`/tutors/${DEMO_IDS.tutorProfile}/slots`, newSlot, tutor.token)).status, 409);
    const raceStart = new Date(Date.now() + 7 * 86400000);
    const slotRace = await Promise.all([0, 900000].map(offset => post(`/tutors/${DEMO_IDS.tutorProfile}/slots`, {
      startTime: new Date(raceStart.getTime() + offset).toISOString(),
      endTime: new Date(raceStart.getTime() + offset + 3600000).toISOString(),
    }, tutor.token)));
    assert.deepEqual(slotRace.map(response => response.status).sort(), [201, 409]);
    // A second legitimate tutor cannot publish slots for the first tutor's profile.
    const otherTutorResponse = await post("/auth/register", {
      email: "another.tutor@orbit.test", password: "Another-tutor-pass-2026!", role: "tutor", displayName: "Other Tutor",
    });
    assert.equal(otherTutorResponse.status, 201);
    const otherTutor = await otherTutorResponse.json() as AuthResult;
    assert.equal((await post(`/tutors/${DEMO_IDS.tutorProfile}/slots`, {
      startTime: new Date(Date.now() + 9 * 86400000).toISOString(),
      endTime: new Date(Date.now() + 9 * 86400000 + 3600000).toISOString(),
    }, otherTutor.token)).status, 403);

    const booking = { slotId: DEMO_IDS.slots[0], topic: "Calculus" };
    const booked = await post("/appointments", booking, studentA.token, "integration-single-1");
    assert.equal(booked.status, 201, await booked.clone().text());
    const receipt = await booked.json() as BookingResult;
    assert.equal(receipt.status, "confirmed");
    assert.equal((await post("/appointments", booking, studentA.token, "integration-single-1")).status, 201);
    const replay = await post("/appointments", booking, studentA.token, "integration-single-1");
    assert.equal((await replay.json() as BookingResult).appointmentId, receipt.appointmentId);
    assert.equal((await post("/appointments", { ...booking, topic: "Algebra" }, studentA.token, "integration-single-1")).status, 409);
    assert.equal((await post("/appointments", booking, studentB.token, "integration-b-1")).status, 409);
    const freeAfterBooking = await fetch(base + `/tutors/${DEMO_IDS.tutorProfile}/slots`);
    assert.ok(!(await freeAfterBooking.json() as SlotResult[]).some(slot => slot.id === booking.slotId));
    const myAppointments = await fetch(base + "/appointments", { headers: authorize(studentA.token) });
    assert.equal(myAppointments.status, 200);
    const records = await myAppointments.json() as BookingResult[];
    assert.ok(records.some(record => record.appointmentId === receipt.appointmentId));
    const otherAppointments = await fetch(base + "/appointments", { headers: authorize(studentB.token) });
    assert.equal(otherAppointments.status, 200);
    assert.ok(!(await otherAppointments.json() as BookingResult[]).some(record => record.appointmentId === receipt.appointmentId));

    // Shut down the HTTP app and every application DB connection, then recreate
    // them. Auth, appointments and persisted retry receipts must survive.
    await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    pool = await fixture.reconnect();
    server = createOrbitApp(pool, secret).listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    assert.equal((await login("student.a@orbit.test")).user.id, studentA.user.id);
    const persisted = await fetch(base + "/appointments", { headers: authorize(studentA.token) });
    assert.ok((await persisted.json() as BookingResult[]).some(record => record.appointmentId === receipt.appointmentId));
    const persistedRetry = await post("/appointments", booking, studentA.token, "integration-single-1");
    assert.equal(persistedRetry.status, 201);
    assert.deepEqual(await persistedRetry.json(), receipt);
    assert.equal((await fetch(base + "/appointments/" + receipt.appointmentId, {
      method: "DELETE", headers: authorize(studentB.token),
    })).status, 404);
    assert.equal((await fetch(base + "/appointments/" + receipt.appointmentId, {
      method: "DELETE", headers: authorize(studentA.token),
    })).status, 204);
    const freeAfterCancel = await fetch(base + `/tutors/${DEMO_IDS.tutorProfile}/slots`);
    assert.ok((await freeAfterCancel.json() as SlotResult[]).some(slot => slot.id === booking.slotId));
    assert.equal((await fetch(base + "/appointments/" + receipt.appointmentId, {
      method: "DELETE", headers: authorize(studentA.token),
    })).status, 204);
    assert.equal((await post("/appointments", booking, studentB.token, "integration-b-2")).status, 201);

    // The final race is through the real JWT middleware and unified HTTP API.
    const raceTokens = await Promise.all(Array.from({ length: 20 }, (_, index) =>
      login(`race.${String(index + 1).padStart(2, "0")}@orbit.test`).then(result => result.token)));
    const raceResponses = await Promise.all(raceTokens.map((token, index) =>
      post("/appointments", { slotId: DEMO_IDS.slots[1], topic: "20-user race" }, token, `integrated-race-${index}`)));
    const statuses = raceResponses.map(result => result.status);
    assert.equal(statuses.filter(status => status === 201).length, 1, `race statuses: ${statuses.join(",")}`);
    assert.equal(statuses.filter(status => status === 409).length, 19, `race statuses: ${statuses.join(",")}`);
    const { rows } = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM appointments WHERE slot_id = $1 AND status = 'confirmed'", [DEMO_IDS.slots[1]],
    );
    assert.equal(rows[0]?.count, "1");
    t.diagnostic("Real JWT/API race: 20 distinct students; 1 HTTP 201, 19 HTTP 409, 1 confirmed PostgreSQL row. Persistence survived HTTP app and connection-pool restart.");
  } finally {
    if (server?.listening) await new Promise<void>((resolve, reject) =>
      server!.close(error => error ? reject(error) : resolve()));
    await fixture.close();
  }
});
