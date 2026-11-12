
/**
 * ORBIT Core Booking API Integration
 *
 * Connects our assigned services and
 * controllers to the team's modules.
 *
 * Robayth: Authentication and JWT
 * Azmain: PostgreSQL repositories
 * Yousef: Atomic booking and cancellation
 */

import {
  createCoreRouter,
  type CoreApiDependencies
} from '../routes/core.routes.js';

import {
  createTutorService,
  type TutorRepository
} from '../services/tutors.service.js';

import {
  createAppointmentService,
  type AppointmentRepository,
  type AtomicBookingService
} from '../services/appointments.service.js';

// Interfaces required from teammates
export interface TeamDependencies {

  // Azmain's PostgreSQL repository functions
  tutorRepository: TutorRepository;

  appointmentRepository: AppointmentRepository;

  // Yousef's concurrency-safe booking operations
  atomicBooking: AtomicBookingService;

  // Robayth's authentication middleware
  requireAuth: CoreApiDependencies['requireAuth'];

  // Retrieves verified user identity
  getAuthenticatedUser:
    CoreApiDependencies['getAuthenticatedUser'];
}

/**
 * Build the complete core booking router.
 *
 * The services are constructed here,
 * rather than inside HTTP controllers.
 */
export function buildCoreBookingRouter(
  dependencies: TeamDependencies
) {

  // Create tutor service
  const tutorService = createTutorService(
    dependencies.tutorRepository
  );

  // Create appointment service
  const appointmentService =
    createAppointmentService(
      dependencies.appointmentRepository,
      dependencies.atomicBooking
    );

  // Connect services and authentication
  // to the six REST API routes.
  const coreRouter = createCoreRouter({
    tutorService,
    appointmentService,
    requireAuth: dependencies.requireAuth,
    getAuthenticatedUser:
      dependencies.getAuthenticatedUser
  });

  return coreRouter;
}
