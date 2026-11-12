
/**
 * ORBIT Appointment Routes
 *
 * POST   /appointments
 * GET    /appointments
 * DELETE /appointments/:appointmentId
 *
 * Authentication comes from Robayth.
 * Booking and cancellation are handled
 * by the service layer.
 */

import {
  Router,
  type Request,
  type RequestHandler
} from 'express';

import {
  createAppointmentController,
  type AppointmentService
} from '../controllers/appointments.controller.js';

import type {
  AuthenticatedUser
} from '../controllers/tutors.controller.js';

// Reads the user identity verified
// by Robayth's authentication middleware.
type GetAuthenticatedUser = (
  req: Request
) => AuthenticatedUser;

// Create routes with injected dependencies.
export function createAppointmentRoutes(
  service: AppointmentService,
  requireAuth: RequestHandler,
  getAuthenticatedUser: GetAuthenticatedUser
) {
  const router = Router();

  const controller = createAppointmentController(
    service,
    getAuthenticatedUser
  );

  // All appointment operations require login.
  router.use(requireAuth);

  // POST /appointments
  router.post(
    '/',
    controller.createAppointment
  );

  // GET /appointments
  router.get(
    '/',
    controller.getAppointments
  );

  // DELETE /appointments/:appointmentId
  router.delete(
    '/:appointmentId',
    controller.cancelAppointment
  );

  return router;
}
