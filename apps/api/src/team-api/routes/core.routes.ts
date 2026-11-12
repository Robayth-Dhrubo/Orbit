
/**
 * ORBIT Core Booking API
 *
 * Combines all six assigned REST endpoints.
 *
 * Authentication comes from Robayth.
 * PostgreSQL repositories come from Azmain.
 * Atomic booking operations come from Yousef.
 */

import {
  Router,
  type Request,
  type RequestHandler
} from 'express';

import {
  createTutorRoutes
} from './tutors.routes.js';

import {
  createAppointmentRoutes
} from './appointments.routes.js';

import type {
  TutorService,
  AuthenticatedUser
} from '../controllers/tutors.controller.js';

import type {
  AppointmentService
} from '../controllers/appointments.controller.js';

// Dependencies supplied by the team application
export interface CoreApiDependencies {
  tutorService: TutorService;

  appointmentService: AppointmentService;

  requireAuth: RequestHandler;

  getAuthenticatedUser: (
    req: Request
  ) => AuthenticatedUser;
}

// Combine the six core API operations
export function createCoreRouter(
  dependencies: CoreApiDependencies
) {
  const router = Router();

  const {
    tutorService,
    appointmentService,
    requireAuth,
    getAuthenticatedUser
  } = dependencies;

  // Three tutor endpoints
  router.use(
    '/tutors',
    createTutorRoutes(
      tutorService,
      requireAuth,
      getAuthenticatedUser
    )
  );

  // Three appointment endpoints
  router.use(
    '/appointments',
    createAppointmentRoutes(
      appointmentService,
      requireAuth,
      getAuthenticatedUser
    )
  );

  return router;
}
