
/**
 * ORBIT Tutor Routes
 *
 * GET /tutors
 * GET /tutors/:tutorId/slots
 * POST /tutors/:tutorId/slots
 *
 * Uses the tutor controller and service.
 * Authentication middleware comes from Robayth.
 */

import {
  Router,
  type Request,
  type RequestHandler
} from 'express';

import {
  createTutorController,
  type TutorService,
  type AuthenticatedUser
} from '../controllers/tutors.controller.js';

// Function that reads the authenticated user
// from Robayth's trusted authentication context.
type GetAuthenticatedUser = (
  req: Request
) => AuthenticatedUser;

// Create tutor routes with dependencies
// provided by the team's application.
export function createTutorRoutes(
  service: TutorService,
  requireAuth: RequestHandler,
  getAuthenticatedUser: GetAuthenticatedUser
) {
  const router = Router();

  const controller = createTutorController(
    service,
    getAuthenticatedUser
  );

  // GET /tutors
  // Public endpoint: list all tutors
  router.get(
    '/',
    controller.getTutors
  );

  // GET /tutors/:tutorId/slots
  // Public endpoint: view available slots
  router.get(
    '/:tutorId/slots',
    controller.getTutorSlots
  );

  // POST /tutors/:tutorId/slots
  // Protected endpoint: tutor creates availability
  router.post(
    '/:tutorId/slots',
    requireAuth,
    controller.createTutorSlot
  );

  return router;
}
