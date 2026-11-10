import type { Pool, PoolClient } from "pg";

export { inTransaction } from "../database/transaction.js";

export type BookingRequest = {
  slotId: string;
  topic: string;
  notes?: string;
};

export type BookingReceipt = {
  appointmentId: string;
  slotId: string;
  status: "confirmed";
};

type StoredBooking = {
  request_hash: string;
  response_status: 201;
  response_body: BookingReceipt;
};

const BOOK_OPERATION = "POST /appointments";

export async function findBookingForKey(client: PoolClient, studentId: string, key: string) {
  // A transaction-scoped advisory lock also covers the first request, when no record exists.
  const scope = JSON.stringify([studentId, BOOK_OPERATION, key]);
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [scope]);
  const { rows } = await client.query<StoredBooking>(
    "SELECT request_hash, response_status, response_body FROM idempotency_records " +
      "WHERE user_id = $1 AND operation = $2 AND idempotency_key = $3",
    [studentId, BOOK_OPERATION, key],
  );
  return rows[0];
}

export async function lockSlot(client: PoolClient, slotId: string) {
  // Booking and cancellation share this lock across clients and API processes.
  const result = await client.query("SELECT id FROM availability_slots WHERE id = $1 FOR UPDATE", [
    slotId,
  ]);
  return result.rowCount === 1;
}

export async function readLockedSlot(client: PoolClient, slotId: string) {
  const { rows } = await client.query<{ is_future: boolean; is_booked: boolean }>(
    "SELECT starts_at > clock_timestamp() AS is_future, " +
      "EXISTS (SELECT 1 FROM appointments WHERE slot_id = $1 AND status = 'confirmed') AS is_booked " +
      "FROM availability_slots WHERE id = $1",
    [slotId],
  );
  return rows[0];
}

export async function insertBooking(client: PoolClient, studentId: string, request: BookingRequest) {
  const { rows } = await client.query<BookingReceipt>(
    "INSERT INTO appointments (student_id, slot_id, topic, notes, status) " +
      "VALUES ($1, $2, $3, $4, 'confirmed') RETURNING id AS \"appointmentId\", slot_id AS \"slotId\", status",
    [studentId, request.slotId, request.topic, request.notes ?? null],
  );
  return rows[0];
}

export async function saveBookingResponse(
  client: PoolClient,
  studentId: string,
  key: string,
  fingerprint: string,
  response: { status: 201; body: BookingReceipt },
) {
  await client.query(
    "INSERT INTO idempotency_records " +
      "(user_id, operation, idempotency_key, request_hash, response_status, response_body) " +
      "VALUES ($1, $2, $3, $4, $5, $6)",
    [studentId, BOOK_OPERATION, key, fingerprint, response.status, response.body],
  );
}

export async function findOwnedAppointmentSlot(client: PoolClient, studentId: string, appointmentId: string) {
  const { rows } = await client.query<{ slot_id: string }>(
    "SELECT slot_id FROM appointments WHERE id = $1 AND student_id = $2",
    [appointmentId, studentId],
  );
  return rows[0]?.slot_id;
}

export async function cancelOwnedAppointment(client: PoolClient, studentId: string, appointmentId: string) {
  await client.query(
    "UPDATE appointments SET status = 'cancelled', updated_at = clock_timestamp() " +
      "WHERE id = $1 AND student_id = $2 AND status = 'confirmed'",
    [appointmentId, studentId],
  );
}

export type AppointmentRecord = {
  appointmentId: string;
  slotId: string;
  studentId: string;
  topic: string;
  notes: string | null;
  status: "confirmed" | "cancelled";
};

const appointmentColumns =
  'id AS "appointmentId", slot_id AS "slotId", student_id AS "studentId", topic, notes, status';

export async function findConfirmedAppointment(db: Pool | PoolClient, slotId: string) {
  const { rows } = await db.query<AppointmentRecord>(
    `SELECT ${appointmentColumns} FROM appointments WHERE slot_id = $1 AND status = 'confirmed'`,
    [slotId],
  );
  return rows[0] as AppointmentRecord | undefined;
}

export async function findOwnedAppointment(
  db: Pool | PoolClient,
  studentId: string,
  appointmentId: string,
) {
  const { rows } = await db.query<AppointmentRecord>(
    `SELECT ${appointmentColumns} FROM appointments WHERE id = $1 AND student_id = $2`,
    [appointmentId, studentId],
  );
  return rows[0] as AppointmentRecord | undefined;
}

export async function listOwnedAppointments(db: Pool | PoolClient, studentId: string) {
  const { rows } = await db.query<AppointmentRecord>(
    `SELECT ${appointmentColumns} FROM appointments WHERE student_id = $1 ORDER BY id`,
    [studentId],
  );
  return rows;
}
