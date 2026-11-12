
import type {
  Request,
  Response,
  NextFunction
} from 'express';

import type {
  AuthenticatedUser
} from './tutors.controller.js';

// Service interface for appointment operations.
// The actual implementation will integrate
// Yousef's booking logic and Azmain's repositories.

export interface AppointmentService {

  bookAppointment(
    user: AuthenticatedUser,
    data: unknown,
    idempotencyKey: string | undefined
  ): Promise<unknown>;

  getMyAppointments(
    user: AuthenticatedUser
  ): Promise<unknown>;

  cancelAppointment(
    user: AuthenticatedUser,
    appointmentId: string
  ): Promise<void>;
}

// Authenticated identity comes from
// Robayth's authentication middleware.

type GetAuthenticatedUser = (
  req: Request
) => AuthenticatedUser;

// Create appointment controller
// using injected dependencies.

export function createAppointmentController(
  service: AppointmentService,
  getAuthenticatedUser: GetAuthenticatedUser
) {

  // POST /appointments
  async function createAppointment(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const user = getAuthenticatedUser(req);

      const idempotencyKey = req.header(
        'Idempotency-Key'
      );

      const appointment =
        await service.bookAppointment(
          user,
          req.body,
          idempotencyKey
        );

      return res.status(201).json(
        appointment
      );

    } catch (error) {
      next(error);
    }
  }

  // GET /appointments
  async function getAppointments(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const user = getAuthenticatedUser(req);

      const appointments =
        await service.getMyAppointments(
          user
        );

      return res.status(200).json(
        appointments
      );

    } catch (error) {
      next(error);
    }
  }

  // DELETE /appointments/:appointmentId
  async function cancelAppointment(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const user = getAuthenticatedUser(req);

     const appointmentId = String(req.params.appointmentId);

      await service.cancelAppointment(
        user,
        appointmentId
      );

      return res.status(204).send();

    } catch (error) {
      next(error);
    }
  }

  return {
    createAppointment,
    getAppointments,
    cancelAppointment
  };
}
