import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { compare } from "bcryptjs";

import { migrate } from "../src/database/migrate.js";
import { DEMO_IDS, resetDemo, seedDemo } from "../src/database/seed.js";
import { inTransaction } from "../src/database/transaction.js";
import {
  createUser,
  findUserByEmail,
  findUserById,
  findUserCredentialsByEmail,
  type UserRole,
} from "../src/users/repository.js";
import {
  createOwnedSlot,
  createSlot,
  createTutorProfile,
  findOwnedSlot,
  findSlotForUpdate,
  findTutorById,
  findTutorOwnerById,
  findTutorByUserId,
  listAvailableSlots,
  listTutors,
} from "../src/tutors/repository.js";
import {
  cancelOwnedAppointment,
  findConfirmedAppointment,
  findOwnedAppointment,
  insertBooking,
  listOwnedAppointments,
  saveBookingResponse,
} from "../src/appointments/repository.js";
import { startDatabaseFixture } from "./database-fixture.js";

function databaseError(code: string, constraint?: string) {
  return (error: unknown) => {
    assert.ok(typeof error === "object" && error !== null && "code" in error);
    assert.equal(error.code, code);
    if (constraint) {
      assert.ok("constraint" in error);
      assert.equal(error.constraint, constraint);
    }
    return true;
  };
}

test("real PostgreSQL migration, repositories, and transactions", { timeout: 90000 }, async (t) => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(databaseUrl, "Set TEST_DATABASE_URL to a disposable PostgreSQL database.");
  const fixture = await startDatabaseFixture(databaseUrl);
  t.after(fixture.close);
  const { pool } = fixture;

  async function user(role: UserRole = "student") {
    return createUser(pool, {
      email: `${randomUUID()}@orbit.test`,
      passwordHash: "fixture-only-password-hash",
      role,
    });
  }

  async function tutor() {
    const account = await user("tutor");
    const profile = await createTutorProfile(pool, {
      userId: account.id,
      displayName: "Database Test Tutor",
      bio: "Teaches algebra",
    });
    assert.ok(profile);
    return { account, profile };
  }

  function interval(hoursFromNow = 24) {
    const startsAt = new Date(Date.now() + hoursFromNow * 3600000);
    return { startsAt, endsAt: new Date(startsAt.getTime() + 1800000) };
  }

  await t.test("initializes an empty schema and safely repeats migration", async () => {
    assert.deepEqual(fixture.applied, ["001_initial.sql", "002_booking_payload_bounds.sql"]);
    assert.deepEqual(await migrate(pool), []);
    const { rows } = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name",
      [fixture.schema],
    );
    assert.deepEqual(rows.map(row => row.table_name), [
      "appointments", "availability_slots", "idempotency_records", "schema_migrations", "tutor_profiles", "users",
    ]);
    const { rows: history } = await pool.query("SELECT version, name, checksum FROM schema_migrations ORDER BY version");
    assert.equal(history.length, 2);
    assert.equal(history[0].version, 1);
    assert.equal(history[0].name, "001_initial.sql");
    assert.match(history[0].checksum, /^[0-9a-f]{64}$/);
    assert.equal(history[1].version, 2);
    assert.equal(history[1].name, "002_booking_payload_bounds.sql");
    assert.match(history[1].checksum, /^[0-9a-f]{64}$/);
  });

  await t.test("upgrades the initial schema without deleting data and rolls back invalid legacy payloads", async () => {
    // Reconstruct the exact 001 schema in this disposable fixture. No application
    // data or immutable migration file is changed outside this test schema.
    await pool.query("ALTER TABLE appointments DROP CONSTRAINT appointments_topic_bounds, DROP CONSTRAINT appointments_notes_bounds");
    await pool.query("DELETE FROM schema_migrations WHERE version = 2");
    const { profile } = await tutor();
    const student = await user();
    const slot = await createSlot(pool, { tutorId: profile.id, ...interval() });
    const receipt = await inTransaction(pool, client => insertBooking(client, student.id, {
      slotId: slot.id, topic: " ", notes: "Existing notes must survive the upgrade",
    }));
    await assert.rejects(migrate(pool), databaseError("23514", "appointments_topic_bounds"));
    assert.equal((await pool.query("SELECT version FROM schema_migrations")).rowCount, 1);
    assert.equal((await findOwnedAppointment(pool, student.id, receipt.appointmentId))?.topic, " ");
    await pool.query("UPDATE appointments SET topic = 'Legacy booking' WHERE id = $1", [receipt.appointmentId]);
    assert.deepEqual(await migrate(pool), ["002_booking_payload_bounds.sql"]);
    const preserved = await findOwnedAppointment(pool, student.id, receipt.appointmentId);
    assert.equal(preserved?.topic, "Legacy booking");
    assert.equal(preserved?.notes, "Existing notes must survive the upgrade");
    assert.deepEqual(await migrate(pool), []);

    for (const topic of ["", "  ", "\t\n", "x".repeat(201)]) {
      await assert.rejects(pool.query("UPDATE appointments SET topic = $1 WHERE id = $2", [topic, receipt.appointmentId]),
        databaseError("23514", "appointments_topic_bounds"));
    }
    await assert.rejects(pool.query("UPDATE appointments SET notes = $1 WHERE id = $2", ["x".repeat(4001), receipt.appointmentId]),
      databaseError("23514", "appointments_notes_bounds"));
    await pool.query("UPDATE appointments SET topic = $1, notes = $2 WHERE id = $3", ["x".repeat(200), "x".repeat(4000), receipt.appointmentId]);
  });

  await t.test("normalizes email and keeps password hashes out of public user/tutor results", async () => {
    const email = `${randomUUID()}@orbit.test`;
    const passwordHash = "stored-hash-visible-only-to-auth";
    const created = await createUser(pool, { email: ` ${email.toUpperCase()} `, passwordHash, role: "tutor" });
    assert.deepEqual(Object.keys(created).sort(), ["email", "id", "role"]);
    assert.equal(created.email, email);
    assert.deepEqual(await findUserById(pool, created.id), created);
    assert.deepEqual(await findUserByEmail(pool, email.toUpperCase()), created);
    assert.equal((await findUserCredentialsByEmail(pool, ` ${email} `))?.passwordHash, passwordHash);
    assert.equal(await findUserById(pool, randomUUID()), undefined);
    assert.equal(await findUserByEmail(pool, `${randomUUID()}@orbit.test`), undefined);
    await assert.rejects(createUser(pool, { email, passwordHash, role: "student" }), databaseError("23505", "users_email_key"));

    const profile = await createTutorProfile(pool, { userId: created.id, displayName: "Visible Tutor", bio: "Math" });
    assert.ok(profile);
    assert.deepEqual(Object.keys(profile).sort(), ["bio", "displayName", "id"]);
    assert.deepEqual(await findTutorById(pool, profile.id), profile);
    assert.deepEqual(await findTutorByUserId(pool, created.id), profile);
    assert.equal(await findTutorOwnerById(pool, profile.id), created.id);
    assert.equal(await findTutorOwnerById(pool, randomUUID()), undefined);
    assert.ok((await listTutors(pool)).some(row => row.id === profile.id));
    const student = await user();
    assert.equal(await createTutorProfile(pool, { userId: student.id, displayName: "Not a tutor" }), undefined);
  });

  await t.test("enforces roles, normalized email, foreign keys, time windows, and appointment status", async () => {
    const { profile } = await tutor();
    const student = await user();
    const time = interval();
    const slot = await createSlot(pool, { tutorId: profile.id, ...time });
    await assert.rejects(pool.query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, 'fixture', 'administrator')",
      [`${randomUUID()}@orbit.test`],
    ), databaseError("23514"));
    await assert.rejects(pool.query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, 'fixture', 'student')",
      [`UPPERCASE-${randomUUID()}@orbit.test`],
    ), databaseError("23514", "users_email_normalized"));
    await assert.rejects(createSlot(pool, { tutorId: randomUUID(), ...time }), databaseError("23503"));
    await assert.rejects(createSlot(pool, {
      tutorId: profile.id, startsAt: time.endsAt, endsAt: time.startsAt,
    }), databaseError("23514", "availability_slots_ends_after_starts"));
    await assert.rejects(pool.query(
      "INSERT INTO appointments (student_id, slot_id, topic, status) VALUES ($1, $2, 'Math', 'unknown')",
      [student.id, slot.id],
    ), databaseError("23514"));
    await assert.rejects(pool.query(
      "INSERT INTO appointments (student_id, slot_id, topic) VALUES ($1, $2, 'Math')",
      [randomUUID(), slot.id],
    ), databaseError("23503"));
  });

  await t.test("concurrent overlapping slots cannot both commit; adjacent slots and another tutor can", async () => {
    const firstTutor = await tutor();
    const secondTutor = await tutor();
    const time = interval();
    const outcomes = await Promise.allSettled([
      createSlot(pool, { tutorId: firstTutor.profile.id, ...time }),
      createSlot(pool, {
        tutorId: firstTutor.profile.id,
        startsAt: new Date(time.startsAt.getTime() + 900000),
        endsAt: new Date(time.endsAt.getTime() + 900000),
      }),
    ]);
    assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
    const failure = outcomes.find(result => result.status === "rejected");
    assert.ok(failure?.status === "rejected");
    databaseError("23P01", "availability_slots_no_overlap")(failure.reason);
    const winner = outcomes.find(result => result.status === "fulfilled");
    assert.ok(winner?.status === "fulfilled");
    const adjacentStart = new Date(winner.value.endsAt);
    await createSlot(pool, {
      tutorId: firstTutor.profile.id,
      startsAt: adjacentStart,
      endsAt: new Date(adjacentStart.getTime() + 1800000),
    });
    await createSlot(pool, { tutorId: secondTutor.profile.id, ...time });
    const { rows: [count] } = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM availability_slots WHERE tutor_id = $1",
      [firstTutor.profile.id],
    );
    assert.equal(count.count, 2);
  });

  await t.test("slot repositories enforce ownership and expose only future unoccupied slots in UTC", async () => {
    const { profile, account } = await tutor();
    const otherTutor = await tutor();
    const input = { tutorId: profile.id, ...interval() };
    assert.equal(await createOwnedSlot(pool, otherTutor.account.id, input), undefined);
    const available = await createOwnedSlot(pool, account.id, input);
    assert.ok(available);
    assert.equal(available.startsAt, input.startsAt.toISOString());
    assert.equal(available.endsAt, input.endsAt.toISOString());
    assert.deepEqual(await findOwnedSlot(pool, account.id, available.id), available);
    assert.equal(await findOwnedSlot(pool, otherTutor.account.id, available.id), undefined);
    await createSlot(pool, { tutorId: profile.id, ...interval(-24) });
    const occupied = await createSlot(pool, { tutorId: profile.id, ...interval(25) });
    const student = await user();
    await inTransaction(pool, client => insertBooking(client, student.id, { slotId: occupied.id, topic: "Algebra" }));
    assert.deepEqual(await listAvailableSlots(pool, profile.id), [available]);
    assert.deepEqual(await listAvailableSlots(pool, randomUUID()), []);
  });

  await t.test("appointment reads/cancellation are owner-scoped and the confirmed-slot constraint survives rebooking", async () => {
    const { profile } = await tutor();
    const student = await user();
    const other = await user();
    const slot = await createSlot(pool, { tutorId: profile.id, ...interval() });
    const receipt = await inTransaction(pool, client => insertBooking(client, student.id, { slotId: slot.id, topic: "Vectors" }));
    const owned = await findOwnedAppointment(pool, student.id, receipt.appointmentId);
    assert.ok(owned);
    assert.equal(owned.studentId, student.id);
    assert.equal(owned.status, "confirmed");
    assert.deepEqual(await findConfirmedAppointment(pool, slot.id), owned);
    assert.deepEqual(await listOwnedAppointments(pool, student.id), [owned]);
    assert.deepEqual(await listOwnedAppointments(pool, other.id), []);
    assert.equal(await findOwnedAppointment(pool, other.id, receipt.appointmentId), undefined);
    await assert.rejects(inTransaction(pool, client => insertBooking(client, other.id, {
      slotId: slot.id, topic: "Duplicate",
    })), databaseError("23505", "one_confirmed_appointment_per_slot"));

    await inTransaction(pool, async client => {
      await findSlotForUpdate(client, slot.id);
      await cancelOwnedAppointment(client, other.id, receipt.appointmentId);
    });
    assert.equal((await findConfirmedAppointment(pool, slot.id))?.appointmentId, receipt.appointmentId);
    await inTransaction(pool, async client => {
      await findSlotForUpdate(client, slot.id);
      await cancelOwnedAppointment(client, student.id, receipt.appointmentId);
    });
    const replacement = await inTransaction(pool, client => insertBooking(client, other.id, { slotId: slot.id, topic: "Rebooked" }));
    assert.notEqual(replacement.appointmentId, receipt.appointmentId);
    assert.equal((await findOwnedAppointment(pool, student.id, receipt.appointmentId))?.status, "cancelled");
    assert.equal((await findConfirmedAppointment(pool, slot.id))?.appointmentId, replacement.appointmentId);
  });

  await t.test("idempotency uniqueness includes the user and operation", async () => {
    const student = await user();
    const other = await user();
    const key = "same-key";
    const insert = (userId: string, operation: string) => pool.query(
      "INSERT INTO idempotency_records (user_id, operation, idempotency_key, request_hash, response_status, response_body) " +
        "VALUES ($1, $2, $3, $4, 201, $5)",
      [userId, operation, key, "a".repeat(64), { appointmentId: randomUUID() }],
    );
    await insert(student.id, "POST /appointments");
    await assert.rejects(insert(student.id, "POST /appointments"), databaseError("23505", "idempotency_records_user_operation_key_unique"));
    await insert(other.id, "POST /appointments");
    await insert(student.id, "different-operation");
    const { rows: [count] } = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM idempotency_records WHERE idempotency_key = $1",
      [key],
    );
    assert.equal(count.count, 3);
  });

  await t.test("failed shared transactions roll back appointment and idempotency together and release the client", async () => {
    const { profile } = await tutor();
    const student = await user();
    const slot = await createSlot(pool, { tutorId: profile.id, ...interval() });
    const key = "rollback-both";
    const failure = new Error("Deliberate failure after both writes");
    await assert.rejects(inTransaction(pool, async client => {
      await findSlotForUpdate(client, slot.id);
      const body = await insertBooking(client, student.id, { slotId: slot.id, topic: "Rollback" });
      await saveBookingResponse(client, student.id, key, "b".repeat(64), { status: 201, body });
      throw failure;
    }), error => error === failure);
    assert.equal(await findConfirmedAppointment(pool, slot.id), undefined);
    assert.equal((await pool.query("SELECT 1 FROM idempotency_records WHERE user_id = $1 AND idempotency_key = $2", [student.id, key])).rowCount, 0);
    await inTransaction(pool, client => insertBooking(client, student.id, { slotId: slot.id, topic: "Retry succeeds" }));
    assert.equal(pool.waitingCount, 0);
    assert.equal(pool.totalCount, pool.idleCount);
  });

  await t.test("findSlotForUpdate holds its row lock on the caller's transaction until commit", async () => {
    const { profile } = await tutor();
    const slot = await createSlot(pool, { tutorId: profile.id, ...interval() });
    const competing = await pool.connect();
    try {
      await inTransaction(pool, async client => {
        assert.equal((await findSlotForUpdate(client, slot.id))?.id, slot.id);
        await competing.query("BEGIN");
        await assert.rejects(competing.query(
          "SELECT id FROM availability_slots WHERE id = $1 FOR UPDATE NOWAIT",
          [slot.id],
        ), databaseError("55P03"));
        await competing.query("ROLLBACK");
      });
      await competing.query("BEGIN");
      assert.equal((await competing.query(
        "SELECT id FROM availability_slots WHERE id = $1 FOR UPDATE NOWAIT", [slot.id],
      )).rowCount, 1);
      await competing.query("ROLLBACK");
    } finally {
      try {
        await competing.query("ROLLBACK");
      } finally {
        competing.release();
      }
    }
  });

  await t.test("committed data survives closing every application connection and reopening the pool", async () => {
    const { profile } = await tutor();
    const student = await user();
    const slot = await createSlot(pool, { tutorId: profile.id, ...interval() });
    const receipt = await inTransaction(pool, client => insertBooking(client, student.id, { slotId: slot.id, topic: "Persistent booking" }));
    const reopened = await fixture.reconnect();
    assert.equal((await findOwnedAppointment(reopened, student.id, receipt.appointmentId))?.topic, "Persistent booking");
    assert.deepEqual(await migrate(reopened), []);
  });
});

test("demo seed preserves bookings and explicit reset preserves unrelated data", { timeout: 90000 }, async (t) => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(databaseUrl, "Set TEST_DATABASE_URL to a disposable PostgreSQL database.");
  const fixture = await startDatabaseFixture(databaseUrl);
  t.after(fixture.close);
  const { pool } = fixture;
  const password = "ORBIT demo acceptance password";

  const seeded = await seedDemo(pool, { password });
  assert.equal(seeded.raceStudents.length, 20);
  assert.equal(new Set(seeded.raceStudents.map(student => student.id)).size, 20);
  assert.equal(seeded.slotIds.length, 2);

  const { rows: users } = await pool.query<{ id: string; password_hash: string; role: string }>(
    "SELECT id, password_hash, role FROM users ORDER BY id",
  );
  assert.equal(users.length, 23);
  assert.equal(users.filter(user => user.role === "student").length, 22);
  assert.equal(users.filter(user => user.role === "tutor").length, 1);
  assert.equal(new Set(users.map(user => user.password_hash)).size, 23, "Each account needs its own salt.");
  for (const account of users) {
    assert.notEqual(account.password_hash, password);
    assert.match(account.password_hash, /^\$2[aby]\$\d{2}\$/);
  }
  const passwordMatches = await Promise.all(users.map(account => compare(password, account.password_hash)));
  assert.ok(passwordMatches.every(Boolean));
  const studentAHash = users.find(account => account.id === seeded.studentA.id)?.password_hash;
  assert.ok(studentAHash);
  assert.equal(await compare("incorrect password", studentAHash), false);

  const demoReceipt = await inTransaction(pool, async client => {
    const body = await insertBooking(client, seeded.studentA.id, { slotId: seeded.slotIds[0], topic: "Keep this on reseed" });
    await saveBookingResponse(client, seeded.studentA.id, "demo-booking", "c".repeat(64), { status: 201, body });
    return body;
  });
  const { rows: slotsBeforeReseed } = await pool.query(
    "SELECT id, starts_at, ends_at FROM availability_slots ORDER BY id",
  );

  assert.deepEqual(await seedDemo(pool, { password }), seeded);
  assert.equal((await pool.query("SELECT id FROM users")).rowCount, 23);
  assert.equal((await pool.query("SELECT id FROM tutor_profiles")).rowCount, 1);
  assert.deepEqual((await pool.query("SELECT id, starts_at, ends_at FROM availability_slots ORDER BY id")).rows, slotsBeforeReseed);
  assert.equal((await findConfirmedAppointment(pool, seeded.slotIds[0]))?.appointmentId, demoReceipt.appointmentId);
  assert.equal((await pool.query("SELECT id FROM idempotency_records WHERE user_id = $1", [seeded.studentA.id])).rowCount, 1);

  // These accounts, tutor, slot, booking, and retry result are not demo fixtures.
  const outsideStudent = await createUser(pool, {
    email: "unrelated.student@orbit.test", passwordHash: "unrelated-stored-hash", role: "student",
  });
  const outsideTutor = await createUser(pool, {
    email: "unrelated.tutor@orbit.test", passwordHash: "unrelated-stored-hash", role: "tutor",
  });
  const outsideProfile = await createTutorProfile(pool, { userId: outsideTutor.id, displayName: "Unrelated Tutor" });
  assert.ok(outsideProfile);
  const outsideSlot = await createSlot(pool, {
    tutorId: outsideProfile.id,
    startsAt: new Date(Date.now() + 86400000),
    endsAt: new Date(Date.now() + 90000000),
  });
  const outsideReceipt = await inTransaction(pool, async client => {
    const body = await insertBooking(client, outsideStudent.id, { slotId: outsideSlot.id, topic: "Preserve this booking" });
    await saveBookingResponse(client, outsideStudent.id, "outside-booking", "d".repeat(64), { status: 201, body });
    return body;
  });
  const outsideBooking = await findOwnedAppointment(pool, outsideStudent.id, outsideReceipt.appointmentId);

  // Simulate returning to an old demo on another day: reset must create future slots.
  await pool.query(
    "UPDATE availability_slots SET starts_at = starts_at - interval '14 days', ends_at = ends_at - interval '14 days' " +
      "WHERE id = ANY($1::uuid[])",
    [seeded.slotIds],
  );
  assert.deepEqual(await resetDemo(pool, { password }), seeded);
  assert.equal(await findOwnedAppointment(pool, seeded.studentA.id, demoReceipt.appointmentId), undefined);
  assert.equal((await pool.query("SELECT id FROM idempotency_records WHERE user_id = $1", [seeded.studentA.id])).rowCount, 0);
  const freeSlots = await listAvailableSlots(pool, seeded.tutor.profileId);
  assert.deepEqual(new Set(freeSlots.map(slot => slot.id)), new Set(seeded.slotIds));
  assert.ok(freeSlots.every(slot => Date.parse(slot.startsAt) > Date.now()));

  assert.deepEqual(await findUserById(pool, outsideStudent.id), outsideStudent);
  assert.deepEqual(await findUserById(pool, outsideTutor.id), outsideTutor);
  assert.deepEqual(await findTutorById(pool, outsideProfile.id), outsideProfile);
  assert.deepEqual(await findOwnedSlot(pool, outsideTutor.id, outsideSlot.id), outsideSlot);
  assert.deepEqual(await findOwnedAppointment(pool, outsideStudent.id, outsideReceipt.appointmentId), outsideBooking);
  const { rows: preservedKeys } = await pool.query(
    "SELECT user_id, idempotency_key, response_body FROM idempotency_records",
  );
  assert.deepEqual(preservedKeys, [{
    user_id: outsideStudent.id, idempotency_key: "outside-booking", response_body: outsideReceipt,
  }]);
  assert.equal((await pool.query("SELECT id FROM users")).rowCount, 25);
  assert.equal((await pool.query("SELECT id FROM appointments")).rowCount, 1);
});

test("demo reset refuses a fixed slot ID owned by another tutor and rolls back its setup", { timeout: 90000 }, async (t) => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(databaseUrl, "Set TEST_DATABASE_URL to a disposable PostgreSQL database.");
  const fixture = await startDatabaseFixture(databaseUrl);
  t.after(fixture.close);
  const { pool } = fixture;
  const student = await createUser(pool, {
    email: "existing.student@orbit.test", passwordHash: "existing-stored-hash", role: "student",
  });
  const tutor = await createUser(pool, {
    email: "existing.tutor@orbit.test", passwordHash: "existing-stored-hash", role: "tutor",
  });
  const profile = await createTutorProfile(pool, { userId: tutor.id, displayName: "Existing Tutor" });
  assert.ok(profile);
  await pool.query(
    "INSERT INTO availability_slots (id, tutor_id, starts_at, ends_at) " +
      "VALUES ($1, $2, clock_timestamp() + interval '1 day', clock_timestamp() + interval '25 hours')",
    [DEMO_IDS.slots[0], profile.id],
  );
  const receipt = await inTransaction(pool, async client => {
    const body = await insertBooking(client, student.id, { slotId: DEMO_IDS.slots[0], topic: "Existing appointment" });
    await saveBookingResponse(client, student.id, "existing-key", "e".repeat(64), { status: 201, body });
    return body;
  });
  await assert.rejects(resetDemo(pool, { password: "ORBIT collision test password" }), /demo slot ID belongs to another tutor/);
  assert.equal((await pool.query("SELECT id FROM users")).rowCount, 2, "The failed reset must roll back newly inserted demo accounts.");
  assert.equal((await pool.query("SELECT id FROM tutor_profiles")).rowCount, 1);
  assert.equal((await findOwnedSlot(pool, tutor.id, DEMO_IDS.slots[0]))?.tutorId, profile.id);
  assert.equal((await findOwnedAppointment(pool, student.id, receipt.appointmentId))?.status, "confirmed");
  assert.equal((await pool.query("SELECT id FROM idempotency_records WHERE user_id = $1", [student.id])).rowCount, 1);
});
