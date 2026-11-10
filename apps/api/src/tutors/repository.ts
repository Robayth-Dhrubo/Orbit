import type { Pool, PoolClient } from "pg";

type Database = Pool | PoolClient;

export type TutorProfile = {
  id: string;
  displayName: string;
  bio: string;
};

export type CreateTutorProfileInput = {
  userId: string;
  displayName: string;
  bio?: string;
};

export type AvailabilitySlot = {
  id: string;
  tutorId: string;
  startsAt: string;
  endsAt: string;
};

export type CreateSlotInput = {
  tutorId: string;
  startsAt: string | Date;
  endsAt: string | Date;
};

type SlotRow = Omit<AvailabilitySlot, "startsAt" | "endsAt"> & {
  startsAt: Date;
  endsAt: Date;
};

function toSlot(row: SlotRow): AvailabilitySlot {
  // node-postgres returns timestamptz as Date; the API boundary uses UTC ISO strings.
  return {
    id: row.id,
    tutorId: row.tutorId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
  };
}

export async function listTutors(db: Database): Promise<TutorProfile[]> {
  const { rows } = await db.query<TutorProfile>(
    'SELECT id, display_name AS "displayName", bio FROM tutor_profiles ORDER BY display_name, id',
  );
  return rows;
}

export async function findTutorById(db: Database, tutorId: string): Promise<TutorProfile | undefined> {
  const { rows } = await db.query<TutorProfile>(
    'SELECT id, display_name AS "displayName", bio FROM tutor_profiles WHERE id = $1',
    [tutorId],
  );
  return rows[0];
}

export async function findTutorByUserId(db: Database, userId: string): Promise<TutorProfile | undefined> {
  const { rows } = await db.query<TutorProfile>(
    'SELECT id, display_name AS "displayName", bio FROM tutor_profiles WHERE user_id = $1',
    [userId],
  );
  return rows[0];
}

export async function createTutorProfile(
  db: Database,
  input: CreateTutorProfileInput,
): Promise<TutorProfile | undefined> {
  const { rows } = await db.query<TutorProfile>(
    "INSERT INTO tutor_profiles (user_id, display_name, bio) " +
      "SELECT id, $2, $3 FROM users WHERE id = $1 AND role = 'tutor' " +
      'RETURNING id, display_name AS "displayName", bio',
    [input.userId, input.displayName, input.bio ?? ""],
  );
  return rows[0];
}

export async function listAvailableSlots(db: Database, tutorId: string): Promise<AvailabilitySlot[]> {
  const { rows } = await db.query<SlotRow>(
    'SELECT s.id, s.tutor_id AS "tutorId", s.starts_at AS "startsAt", s.ends_at AS "endsAt" ' +
      "FROM availability_slots s " +
      "WHERE s.tutor_id = $1 AND s.starts_at > clock_timestamp() " +
      "AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.slot_id = s.id AND a.status = 'confirmed') " +
      "ORDER BY s.starts_at, s.id",
    [tutorId],
  );
  return rows.map(toSlot);
}

export async function findSlotById(db: Database, slotId: string): Promise<AvailabilitySlot | undefined> {
  const { rows } = await db.query<SlotRow>(
    'SELECT id, tutor_id AS "tutorId", starts_at AS "startsAt", ends_at AS "endsAt" ' +
      "FROM availability_slots WHERE id = $1",
    [slotId],
  );
  return rows[0] ? toSlot(rows[0]) : undefined;
}

export async function findSlotForUpdate(
  client: PoolClient,
  slotId: string,
): Promise<AvailabilitySlot | undefined> {
  // The caller must keep this client inside a transaction until its dependent work completes.
  const { rows } = await client.query<SlotRow>(
    'SELECT id, tutor_id AS "tutorId", starts_at AS "startsAt", ends_at AS "endsAt" ' +
      "FROM availability_slots WHERE id = $1 FOR UPDATE",
    [slotId],
  );
  return rows[0] ? toSlot(rows[0]) : undefined;
}

export async function findOwnedSlot(
  db: Database,
  userId: string,
  slotId: string,
): Promise<AvailabilitySlot | undefined> {
  const { rows } = await db.query<SlotRow>(
    'SELECT s.id, s.tutor_id AS "tutorId", s.starts_at AS "startsAt", s.ends_at AS "endsAt" ' +
      "FROM availability_slots s JOIN tutor_profiles t ON t.id = s.tutor_id " +
      "WHERE s.id = $1 AND t.user_id = $2",
    [slotId, userId],
  );
  return rows[0] ? toSlot(rows[0]) : undefined;
}

export async function createSlot(db: Database, input: CreateSlotInput): Promise<AvailabilitySlot> {
  const { rows } = await db.query<SlotRow>(
    "INSERT INTO availability_slots (tutor_id, starts_at, ends_at) VALUES ($1, $2, $3) " +
      'RETURNING id, tutor_id AS "tutorId", starts_at AS "startsAt", ends_at AS "endsAt"',
    [input.tutorId, input.startsAt, input.endsAt],
  );
  return toSlot(rows[0]);
}

export async function createOwnedSlot(
  db: Database,
  userId: string,
  input: CreateSlotInput,
): Promise<AvailabilitySlot | undefined> {
  const { rows } = await db.query<SlotRow>(
    "INSERT INTO availability_slots (tutor_id, starts_at, ends_at) " +
      "SELECT id, $3, $4 FROM tutor_profiles WHERE id = $1 AND user_id = $2 " +
      'RETURNING id, tutor_id AS "tutorId", starts_at AS "startsAt", ends_at AS "endsAt"',
    [input.tutorId, userId, input.startsAt, input.endsAt],
  );
  return rows[0] ? toSlot(rows[0]) : undefined;
}
