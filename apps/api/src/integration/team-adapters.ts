/**
 * Connects Mehjabin's controllers/domain services to Azmain's PostgreSQL
 * repositories and Yousef's transaction-safe appointment operations.
 *
 * Source code from the existing backend/src is copied to src/team-api by
 * apply-integration.sh. No teammate source files need to be overwritten.
 */
import type { Pool } from "pg";
import { createTutorService, type TutorRepository } from "../team-api/services/tutors.service.js";
import {
  createAppointmentService,
  type AppointmentRepository,
  type AtomicBookingService,
} from "../team-api/services/appointments.service.js";
import { createSlot, listAvailableSlots } from "../tutors/repository.js";
import { listOwnedAppointments } from "../appointments/repository.js";
import { AppointmentError, bookAppointment, cancelAppointment } from "../appointments/service.js";

export function connectTeamServices(pool: Pool) {
  const tutorRepository: TutorRepository = {
    async findAllTutors() {
      const { rows } = await pool.query<{ id: string; userId: string; name: string; subject: string }>(
        `SELECT id, user_id AS "userId", display_name AS name,
          ''::text AS subject FROM tutor_profiles ORDER BY display_name, id`,
      );
      return rows;
    },
    async findTutorById(tutorId) {
      const { rows } = await pool.query<{ id: string; userId: string; name: string; subject: string }>(
        `SELECT id, user_id AS "userId", display_name AS name,
          ''::text AS subject FROM tutor_profiles WHERE id = $1`,
        [tutorId],
      );
      return rows[0] ?? null;
    },
    async findAvailableSlots(tutorId) {
      const slots = await listAvailableSlots(pool, tutorId);
      return slots.map(slot => ({
        id: slot.id, tutorId: slot.tutorId,
        startTime: slot.startsAt, endTime: slot.endsAt,
      }));
    },
    async createSlotIfNoOverlap(tutorId, startTime, endTime) {
      try {
        // PostgreSQL EXCLUDE gist constraint on (tutor_id, tstzrange)
        // rejects simultaneous overlapping inserts, across API processes too.
        const slot = await createSlot(pool, { tutorId, startsAt: startTime, endsAt: endTime });
        return { id: slot.id, tutorId: slot.tutorId, startTime: slot.startsAt, endTime: slot.endsAt };
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "23P01") {
          return null;
        }
        throw error;
      }
    },
  };

  const appointmentRepository: AppointmentRepository = {
    async findByStudentId(studentId) {
      const appointments = await listOwnedAppointments(pool, studentId);
      return appointments.map(({ appointmentId, slotId, status, topic, notes }) => ({
        appointmentId, slotId, status, topic, ...(notes === null ? {} : { notes }),
      }));
    },
  };

  const atomicBooking: AtomicBookingService = {
    async bookAtomically(input) {
      const result = await bookAppointment(pool, input.studentId, {
        slotId: input.slotId, topic: input.topic, notes: input.notes,
      }, input.idempotencyKey);
      return result.body;
    },
    async cancelAtomically(appointmentId, studentId) {
      try {
        await cancelAppointment(pool, studentId, appointmentId);
        return "cancelled";
      } catch (error) {
        if (error instanceof AppointmentError && error.status === 404) return "not_found";
        throw error;
      }
    },
  };

  return {
    tutorService: createTutorService(tutorRepository),
    appointmentService: createAppointmentService(appointmentRepository, atomicBooking),
  };
}
