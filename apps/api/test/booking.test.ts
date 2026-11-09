import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { startBookingFixture } from "./booking-fixture.js";

test("appointment router and transactions on PostgreSQL", async (t) => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(databaseUrl, "Set TEST_DATABASE_URL to a disposable PostgreSQL database.");
  const { pool, baseUrl, tokenFor, close } = await startBookingFixture({ databaseUrl });
  t.after(close);

  async function user(role: "student" | "tutor") {
    const { rows: [row] } = await pool.query<{ id: string }>(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, 'fixture-only', $2) RETURNING id",
      [randomUUID() + "@orbit.test", role],
    );
    return { id: row.id, token: tokenFor(row.id, role) };
  }

  const student = await user("student");
  const other = await user("student");
  const tutor = await user("tutor");
  const { rows: [profile] } = await pool.query<{ id: string }>(
    "INSERT INTO tutor_profiles (user_id, display_name) VALUES ($1, 'Test Tutor') RETURNING id",
    [tutor.id],
  );

  let slotOffset = 0;
  async function slot(future = true) {
    const { rows: [row] } = await pool.query<{ id: string }>(
      "INSERT INTO availability_slots (tutor_id, starts_at, ends_at) " +
        "SELECT $1, starts_at, starts_at + interval '30 minutes' " +
        "FROM (SELECT clock_timestamp() + $2 * interval '1 hour' AS starts_at) s RETURNING id",
      [profile.id, future ? ++slotOffset : -2],
    );
    return row.id;
  }

  function book(body: unknown, key?: string, token = student.token) {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (token) headers.set("Authorization", "Bearer " + token);
    if (key !== undefined) headers.set("Idempotency-Key", key);
    return fetch(baseUrl + "/appointments", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  }

  function cancel(id: string, token: string) {
    return fetch(baseUrl + "/appointments/" + id, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
      signal: AbortSignal.timeout(10_000),
    });
  }

  async function expectError(response: Response, status: number, code: string) {
    assert.equal(response.status, status);
    const { error } = await response.json();
    assert.equal(error.code, code);
    assert.equal(typeof error.correlationId, "string");
  }

  async function countBookings(slotId: string) {
    const { rows: [row] } = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM appointments WHERE slot_id = $1",
      [slotId],
    );
    return row.count;
  }

  await t.test("simultaneous identical requests and reordered JSON replay one receipt", async () => {
    const slotId = await slot();
    const request = { slotId, topic: "Algebra", notes: "Bring notes" };
    const key = "retry-same-request";
    const responses = await Promise.all(Array.from({ length: 8 }, () => book(request, key)));
    assert.deepEqual(responses.map((response) => response.status), Array(8).fill(201));

    const receipts = await Promise.all(responses.map((response) => response.json()));
    const receipt = receipts[0];
    assert.equal(receipt.slotId, slotId);
    assert.equal(receipt.status, "confirmed");
    assert.match(receipt.appointmentId, /^[0-9a-f-]{36}$/);
    for (const replay of receipts) assert.deepEqual(replay, receipt);

    const reordered = await book({ notes: request.notes, topic: request.topic, slotId: slotId.toUpperCase() }, key);
    assert.equal(reordered.status, 201);
    assert.deepEqual(await reordered.json(), receipt);
    assert.equal(await countBookings(slotId), 1);

    await expectError(await book({ ...request, notes: "Different" }, key), 409, "IDEMPOTENCY_CONFLICT");
    assert.equal(await countBookings(slotId), 1);
  });

  await t.test("same key belongs independently to each authenticated student", async () => {
    const slotId = await slot();
    const key = "student-scoped";
    const first = await book({ slotId, topic: "Calculus" }, key);
    assert.equal(first.status, 201);
    await expectError(await book({ slotId, topic: "Calculus" }, key, other.token), 409, "SLOT_ALREADY_BOOKED");
    const another = await book({ slotId: await slot(), topic: "Physics" }, key, other.token);
    assert.equal(another.status, 201);
    assert.notEqual((await another.json()).appointmentId, (await first.json()).appointmentId);
    const { rows } = await pool.query(
      "SELECT user_id FROM idempotency_records WHERE idempotency_key = $1",
      [key],
    );
    assert.deepEqual(new Set(rows.map((row) => row.user_id)), new Set([student.id, other.id]));
  });

  await t.test("only the owner can cancel, repeated cancellation preserves a new booking", async () => {
    const slotId = await slot();
    const request = { slotId, topic: "Vectors" };
    const first = await book(request, "cancel-first");
    assert.equal(first.status, 201);
    const receipt = await first.json();
    await expectError(await cancel(receipt.appointmentId, other.token), 404, "APPOINTMENT_NOT_FOUND");
    await expectError(await book(request, "still-occupied", other.token), 409, "SLOT_ALREADY_BOOKED");

    const cancels = await Promise.all([
      cancel(receipt.appointmentId, student.token),
      cancel(receipt.appointmentId, student.token),
    ]);
    assert.deepEqual(cancels.map((response) => response.status), [204, 204]);

    const rebooked = await book(request, "rebook-after-cancel", other.token);
    assert.equal(rebooked.status, 201);
    const replacement = await rebooked.json();
    assert.notEqual(replacement.appointmentId, receipt.appointmentId);
    assert.equal((await cancel(receipt.appointmentId, student.token)).status, 204);
    const replay = await book(request, "cancel-first");
    assert.equal(replay.status, 201);
    assert.deepEqual(await replay.json(), receipt);

    const { rows } = await pool.query(
      "SELECT id, status FROM appointments WHERE slot_id = $1 ORDER BY status",
      [slotId],
    );
    assert.deepEqual(rows, [
      { id: receipt.appointmentId, status: "cancelled" },
      { id: replacement.appointmentId, status: "confirmed" },
    ]);
  });

  await t.test("rejects missing/invalid auth, invalid input, and unavailable slots", async () => {
    const slotId = await slot();
    const request = { slotId, topic: "Geometry" };
    await expectError(await book(request, "missing-auth", ""), 401, "UNAUTHENTICATED");
    await expectError(await book(request, "forged", tutor.token + "tampered"), 401, "UNAUTHENTICATED");
    await expectError(await book(request, "tutor", tutor.token), 403, "STUDENT_REQUIRED");
    await expectError(await cancel("%ZZ", student.token), 400, "INVALID_APPOINTMENT_ID");
    for (const key of [undefined, "", "with space", "a,b", "x".repeat(256)]) {
      await expectError(await book(request, key), 400, "INVALID_IDEMPOTENCY_KEY");
    }
    for (const body of [
      null, [], {}, { ...request, slotId: "invalid" }, { ...request, topic: " " },
      { ...request, topic: "x".repeat(201) }, { ...request, notes: null },
      { ...request, notes: "x".repeat(4001) }, { ...request, notes: "embedded\0nul" },
      { ...request, topic: "unpaired\uD800" }, { ...request, notes: "unpaired\uDC00" },
      { ...request, studentId: other.id },
    ]) {
      await expectError(await book(body, "bad-body"), 400, "INVALID_BOOKING");
    }
    await expectError(await book({ ...request, slotId: randomUUID() }, "unknown-slot"), 404, "SLOT_NOT_FOUND");
    const pastSlot = await slot(false);
    await expectError(await book({ ...request, slotId: pastSlot }, "past-slot"), 409, "SLOT_IN_PAST");
    assert.equal(await countBookings(slotId), 0);
    assert.equal(await countBookings(pastSlot), 0);
    const boundary = await book({ slotId, topic: "x".repeat(200), notes: "x".repeat(4000) }, "k".repeat(255));
    assert.equal(boundary.status, 201);
  });

  await t.test("rejects unsupported encodings without losing valid Unicode", async () => {
    const slotId = await slot();
    const request = { slotId, topic: "Geometry 🧭", notes: "Bring a règle" };
    const unsupportedHeaders: Record<string, string>[] = [
      { "Content-Type": "application/json; charset=iso-8859-1" },
      { "Content-Type": "application/json", "Content-Encoding": "invalid" },
    ];
    for (const headers of unsupportedHeaders) {
      const response = await fetch(baseUrl + "/appointments", {
        method: "POST",
        headers: {
          ...headers,
          Authorization: "Bearer " + student.token,
          "Idempotency-Key": "encoding",
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(10_000),
      });
      await expectError(response, 415, "UNSUPPORTED_MEDIA_TYPE");
    }
    assert.equal(await countBookings(slotId), 0);
    const valid = await book(request, "encoding");
    assert.equal(valid.status, 201);
    const { rows } = await pool.query(
      "SELECT topic, notes FROM appointments WHERE slot_id = $1",
      [slotId],
    );
    assert.deepEqual(rows, [{ topic: request.topic, notes: request.notes }]);
  });

  await t.test("rolls back a booking if idempotency persistence fails and permits a retry", async () => {
    const slotId = await slot();
    const request = { slotId, topic: "Rollback" };
    const key = "rollback-request";
    await pool.query(
      "CREATE FUNCTION reject_idempotency_write() RETURNS trigger LANGUAGE plpgsql AS $$ " +
        "BEGIN RAISE EXCEPTION 'Fixture idempotency write failure'; END; $$; " +
        "CREATE TRIGGER fixture_reject_idempotency_write BEFORE INSERT ON idempotency_records " +
        "FOR EACH ROW EXECUTE FUNCTION reject_idempotency_write()",
    );

    try {
      await expectError(await book(request, key), 500, "INTERNAL_ERROR");
      assert.equal(await countBookings(slotId), 0);
      const stored = await pool.query("SELECT 1 FROM idempotency_records WHERE idempotency_key = $1", [key]);
      assert.equal(stored.rowCount, 0);
    } finally {
      await pool.query("DROP TRIGGER fixture_reject_idempotency_write ON idempotency_records");
    }
    assert.equal((await book(request, key)).status, 201);
    assert.equal(await countBookings(slotId), 1);
  });
});
