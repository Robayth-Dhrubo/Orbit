import { createHash } from "node:crypto";
import type { Pool } from "pg";

import {
  type BookingRequest,
  cancelOwnedAppointment,
  findBookingForKey,
  findOwnedAppointmentSlot,
  inTransaction,
  insertBooking,
  lockSlot,
  readLockedSlot,
  saveBookingResponse,
} from "./repository.js";

export class AppointmentError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function slotAlreadyBooked() {
  return new AppointmentError(409, "SLOT_ALREADY_BOOKED", "This appointment slot is no longer available.");
}

function isConfirmedSlotConflict(error: unknown) {
  return typeof error === "object" && error !== null &&
    "code" in error && error.code === "23505" &&
    "constraint" in error && error.constraint === "one_confirmed_appointment_per_slot";
}

export async function bookAppointment(
  pool: Pool,
  authenticatedStudentId: string,
  request: BookingRequest,
  idempotencyKey: string,
) {
  const studentId = authenticatedStudentId.toLowerCase();
  const booking = { ...request, slotId: request.slotId.toLowerCase() };
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([booking.slotId, booking.topic, booking.notes ?? null]))
    .digest("hex");

  try {
    return await inTransaction(pool, async (client) => {
      const saved = await findBookingForKey(client, studentId, idempotencyKey);
      if (saved) {
        if (saved.request_hash !== fingerprint) {
          throw new AppointmentError(409, "IDEMPOTENCY_CONFLICT", "This key was used with a different booking request.");
        }
        return { status: saved.response_status, body: saved.response_body };
      }

      if (!await lockSlot(client, booking.slotId)) {
        throw new AppointmentError(404, "SLOT_NOT_FOUND", "This appointment slot does not exist.");
      }
      // Use a fresh statement after the row lock, so it sees any booking committed while we waited.
      const slot = await readLockedSlot(client, booking.slotId);
      if (!slot.is_future) {
        throw new AppointmentError(409, "SLOT_IN_PAST", "This appointment slot has already started.");
      }
      if (slot.is_booked) {
        throw slotAlreadyBooked();
      }

      const body = await insertBooking(client, studentId, booking);
      const response = { status: 201 as const, body };
      await saveBookingResponse(client, studentId, idempotencyKey, fingerprint, response);
      return response;
    });
  } catch (error) {
    if (isConfirmedSlotConflict(error)) {
      throw slotAlreadyBooked();
    }
    throw error;
  }
}

export async function cancelAppointment(pool: Pool, authenticatedStudentId: string, appointmentId: string) {
  await inTransaction(pool, async (client) => {
    const slotId = await findOwnedAppointmentSlot(client, authenticatedStudentId, appointmentId);
    if (!slotId || !await lockSlot(client, slotId)) {
      throw new AppointmentError(404, "APPOINTMENT_NOT_FOUND", "This appointment does not exist.");
    }
    await cancelOwnedAppointment(client, authenticatedStudentId, appointmentId);
  });
}
