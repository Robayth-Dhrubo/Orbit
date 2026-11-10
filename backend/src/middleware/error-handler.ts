
/**
 * ORBIT API Error Handling
 *
 * Handles errors from the assigned
 * Tutor and Appointment services.
 *
 * Final error response shapes must be
 * confirmed against Robayth's OpenAPI.
 */

import { randomUUID } from 'node:crypto';

import type {
  Request,
  Response,
  NextFunction,
  RequestHandler,
  ErrorRequestHandler
} from 'express';

import {
  TutorServiceError
} from '../services/tutors.service.js';

import {
  AppointmentServiceError
} from '../services/appointments.service.js';

// Add a correlation ID to each request.
// This helps trace API errors.
export const requestIdMiddleware: RequestHandler = (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  const requestId = randomUUID();

  res.locals.requestId = requestId;

  res.setHeader('X-Request-Id', requestId);

  next();
};

// Centralized API error handler.
// Express calls this after an endpoint fails.
export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const requestId =
    String(res.locals.requestId || randomUUID());

  // Handle tutor and appointment domain errors.
  if (
    error instanceof TutorServiceError ||
    error instanceof AppointmentServiceError
  ) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        requestId
      }
    });

    return;
  }

  // Handle malformed JSON request bodies.
  if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.parse.failed'
  ) {
    res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Malformed JSON request body',
        requestId
      }
    });

    return;
  }

  // Unknown errors are logged on the server,
  // but internal details are not sent to clients.
  console.error(
    `[${requestId}] Unexpected API error:`,
    error
  );

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId
    }
  });
};
