/**
 * Connects Mehjabin's controllers/domain services to Azmain's PostgreSQL
 * repositories and Yousef's transaction-safe appointment operations.
 *
 * Import the original domain modules so their unit tests exercise the same
 * services used by the running API. SQL remains in the repositories.
 */
import type { Pool } from "pg";
import { createTutorService, type TutorRepository } from "../team-api/services/tutors.service.js";
import {
  createAppointmentService,
  type AppointmentRepository,
  type AtomicBookingService,
} from "../team-api/services/appointments.service.js";
import { createOwnedSlot, findTutorById, findTutorOwnerById, listTutors, listAvailableSlots } from "../tutors/repository.js";
import { listOwnedAppointments } from "../appointments/repository.js";
import { AppointmentError, bookAppointment, cancelAppointment } from "../appointments/service.js";

export function connectTeamServices(pool: Pool) {
  const tutorRepository: TutorRepository = {
    async findAllTutors() {
      return listTutors(pool);
    },
    async findTutorById(tutorId) {
      const profile = await findTutorById(pool, tutorId);
      const userId = profile && await findTutorOwnerById(pool, tutorId);
      return profile && userId ? { ...profile, userId } : null;
    },
    async findAvailableSlots(tutorId) {
      const slots = await listAvailableSlots(pool, tutorId);
      return slots.map(slot => ({
        id: slot.id, tutorId: slot.tutorId,
        startTime: slot.startsAt, endTime: slot.endsAt,
      }));
    },
    async createSlotIfNoOverlap(tutorId, startTime, endTime, ownerUserId) {
      try {
        // PostgreSQL EXCLUDE gist constraint on (tutor_id, tstzrange)
        // rejects simultaneous overlapping inserts, across API processes too.
        const slot = await createOwnedSlot(pool, ownerUserId, { tutorId, startsAt: startTime, endsAt: endTime });
        if (!slot) throw new AppointmentError(403, "FORBIDDEN", "You can only manage your own availability.");
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
