import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startBookingFixture } from '../test/booking-fixture.js';

const studentCount = 20;

async function runBookingRace(databaseUrl: string) {
  const fixture = await startBookingFixture({ databaseUrl });
  try {
    const { pool, baseUrl, tokenFor } = fixture;
    const { rows: [slot] } = await pool.query<{ id: string }>(`
      WITH tutor AS (
        INSERT INTO users (email, password_hash, role)
        VALUES ('race-tutor@example.test', 'test-only', 'tutor')
        RETURNING id
      ), profile AS (
        INSERT INTO tutor_profiles (user_id, display_name)
        SELECT id, 'Race Tutor' FROM tutor
        RETURNING id
      )
      INSERT INTO availability_slots (tutor_id, starts_at, ends_at)
      SELECT id, now() + interval '24 hours', now() + interval '25 hours' FROM profile
      RETURNING id
    `);
    assert.ok(slot, 'Expected a fresh availability slot');

    const students = await Promise.all(Array.from({ length: studentCount }, async (_, index) => {
      const { rows: [student] } = await pool.query<{ id: string }>(`
        INSERT INTO users (email, password_hash, role)
        VALUES ($1, 'test-only', 'student')
        RETURNING id
      `, [`race-student-${index + 1}@example.test`]);
      assert.ok(student, 'Expected an independent student account');
      return { id: student.id, token: await tokenFor(student.id, 'student'), key: randomUUID() };
    }));
    assert.equal(new Set(students.map(({ token }) => token)).size, studentCount);
    assert.equal(new Set(students.map(({ key }) => key)).size, studentCount);

    // Prepare every account and key before starting the competing HTTP requests.
    const attempts = await Promise.allSettled(students.map(async ({ id, token, key }) => {
      const response = await fetch(`${baseUrl}/appointments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify({ slotId: slot.id, topic: 'Calculus race test' }),
        signal: AbortSignal.timeout(30_000),
      });
      const body = await response.json().catch(() => null);
      return { studentId: id, status: response.status, body };
    }));

    const responses = attempts.flatMap((attempt) =>
      attempt.status === 'fulfilled' ? [attempt.value] : [],
    );
    const successes = responses.filter(({ status }) => status === 201);
    const conflicts = responses.filter(({ status }) => status === 409);
    const otherStatuses = responses
      .filter(({ status }) => status !== 201 && status !== 409)
      .map(({ status }) => status);
    const transportErrors = studentCount - responses.length;
    const { rows: confirmed } = await pool.query<{ id: string; student_id: string }>(`
      SELECT id, student_id FROM appointments WHERE slot_id = $1 AND status = 'confirmed'
    `, [slot.id]);

    console.log(`Booking race (${studentCount} requests): ${successes.length} HTTP 201, ` +
      `${conflicts.length} HTTP 409, ${otherStatuses.length} other HTTP responses, ` +
      `${transportErrors} transport errors, ${confirmed.length} confirmed PostgreSQL rows`);

    assert.equal(transportErrors, 0, 'Every request must receive an HTTP response');
    assert.deepEqual(otherStatuses, [], 'Unexpected booking statuses');
    assert.equal(successes.length, 1, 'Exactly one booking must succeed');
    assert.equal(conflicts.length, studentCount - 1, 'Every competing booking must conflict');
    for (const conflict of conflicts) {
      assert.equal(conflict.body?.error?.code, 'SLOT_ALREADY_BOOKED');
    }
    assert.equal(confirmed.length, 1, 'Exactly one confirmed booking must persist');

    const [winner] = successes;
    const [persisted] = confirmed;
    assert.ok(winner && persisted);
    assert.equal(winner.body?.appointmentId, persisted.id);
    assert.equal(winner.body?.slotId, slot.id);
    assert.equal(winner.body?.status, 'confirmed');
    assert.equal(winner.studentId, persisted.student_id);
    console.log('PASS: the winning response matches the confirmed PostgreSQL appointment');
  } finally {
    await fixture.close();
  }
}

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) {
  runBookingRace(databaseUrl).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  console.error('Set TEST_DATABASE_URL to a PostgreSQL test database with CREATE SCHEMA access.');
  process.exitCode = 1;
}
