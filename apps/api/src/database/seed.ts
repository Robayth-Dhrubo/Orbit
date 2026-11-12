import { hash } from "bcryptjs";
import type { Pool, PoolClient } from "pg";
import { inTransaction } from "./transaction.js";

const id = (number: number) => `10000000-0000-4000-8000-${String(number).padStart(12, "0")}`;

export const DEMO_IDS = {
  studentA: id(1),
  studentB: id(2),
  tutorUser: id(3),
  tutorProfile: id(1001),
  slots: [id(2001), id(2002)],
} as const;

const accounts = [
  { id: DEMO_IDS.studentA, email: "student.a@orbit.test", role: "student" },
  { id: DEMO_IDS.studentB, email: "student.b@orbit.test", role: "student" },
  { id: DEMO_IDS.tutorUser, email: "tutor@orbit.test", role: "tutor" },
  ...Array.from({ length: 20 }, (_, index) => ({
    id: id(101 + index), email: `race.${String(index + 1).padStart(2, "0")}@orbit.test`, role: "student",
  })),
] as const;

async function prepareAccounts(password: string) {
  if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("DEMO_PASSWORD must contain at least 12 characters and at most 72 UTF-8 bytes.");
  }
  // Hash before taking database locks. Each account gets its own salt.
  return Promise.all(accounts.map(async account => ({ ...account, passwordHash: await hash(password, 10) })));
}

async function writeDemo(
  client: PoolClient,
  prepared: Awaited<ReturnType<typeof prepareAccounts>>,
  reset: boolean,
) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["orbit:demo-seed"]);

  for (const account of prepared) {
    const result = await client.query(
      "INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, $4) " +
      "ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = clock_timestamp() " +
      "WHERE users.email = EXCLUDED.email AND users.role = EXCLUDED.role RETURNING id",
      [account.id, account.email, account.passwordHash, account.role],
    );
    if (result.rowCount !== 1) throw new Error("A demo user ID belongs to another account; seed cancelled.");
  }
  const tutor = await client.query(
    "INSERT INTO tutor_profiles (id, user_id, display_name, bio) VALUES ($1, $2, $3, $4) " +
    "ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name " +
    "WHERE tutor_profiles.user_id = EXCLUDED.user_id RETURNING id",
    [DEMO_IDS.tutorProfile, DEMO_IDS.tutorUser, "ORBIT Demo Tutor", "Demo profile for the Phase 2 workflow."],
  );
  if (tutor.rowCount !== 1) throw new Error("The demo tutor ID belongs to another user; seed cancelled.");

  // Validate ownership before a reset can delete any dependent rows.
  const existingSlots = await client.query<{ tutor_id: string }>(
    "SELECT tutor_id FROM availability_slots WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE",
    [[...DEMO_IDS.slots]],
  );
  if (existingSlots.rows.some(slot => slot.tutor_id !== DEMO_IDS.tutorProfile)) {
    throw new Error("A demo slot ID belongs to another tutor; seed cancelled.");
  }

  if (reset) {
    // Only reset this fixture's records; never truncate the team's database.
    const studentIds = prepared.filter(account => account.role === "student").map(account => account.id);
    await client.query(
      "DELETE FROM idempotency_records WHERE user_id = ANY($1::uuid[]) " +
      "OR response_body ->> 'slotId' = ANY($2::text[])",
      [studentIds, [...DEMO_IDS.slots]],
    );
    await client.query("DELETE FROM appointments WHERE student_id = ANY($1::uuid[]) OR slot_id = ANY($2::uuid[])",
      [studentIds, [...DEMO_IDS.slots]]);
    await client.query("DELETE FROM availability_slots WHERE id = ANY($1::uuid[])", [[...DEMO_IDS.slots]]);
  }

  for (const [index, slotId] of DEMO_IDS.slots.entries()) {
    const slot = await client.query(
      "INSERT INTO availability_slots (id, tutor_id, starts_at, ends_at) " +
      "VALUES ($1, $2, date_trunc('hour', clock_timestamp()) + interval '2 days' + $3 * interval '2 hours', " +
      "date_trunc('hour', clock_timestamp()) + interval '2 days' + $3 * interval '2 hours' + interval '1 hour') " +
      "ON CONFLICT (id) DO NOTHING RETURNING id",
      [slotId, DEMO_IDS.tutorProfile, index],
    );
    if (slot.rowCount === 0) {
      const existing = await client.query("SELECT tutor_id FROM availability_slots WHERE id = $1", [slotId]);
      if (existing.rows[0]?.tutor_id !== DEMO_IDS.tutorProfile) {
        throw new Error("A demo slot ID belongs to another tutor; seed cancelled.");
      }
    }
  }

  return {
    studentA: { id: DEMO_IDS.studentA, email: "student.a@orbit.test" },
    studentB: { id: DEMO_IDS.studentB, email: "student.b@orbit.test" },
    tutor: { userId: DEMO_IDS.tutorUser, profileId: DEMO_IDS.tutorProfile, email: "tutor@orbit.test" },
    slotIds: [...DEMO_IDS.slots],
    raceStudents: prepared.filter(account => account.email.startsWith("race.")).map(({ id, email }) => ({ id, email })),
  };
}

/** Repeatable insertion preserves existing bookings; it refreshes demo password hashes. */
export async function seedDemo(pool: Pool, { password }: { password: string }) {
  const prepared = await prepareAccounts(password);
  return inTransaction(pool, client => writeDemo(client, prepared, false));
}

/** Explicit demo reset removes fixture bookings/keys and recreates two future slots. */
export async function resetDemo(pool: Pool, { password }: { password: string }) {
  const prepared = await prepareAccounts(password);
  return inTransaction(pool, client => writeDemo(client, prepared, true));
}

