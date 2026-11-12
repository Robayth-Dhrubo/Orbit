
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
  if (res.headersSent) {
    _next(error);
    return;
  }

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

  const parserError = typeof error === 'object' && error !== null
    ? error as { type?: string; status?: number }
    : undefined;
  let problem: { status: number; code: string; message: string } | undefined;
  if (parserError?.type === 'entity.too.large') {
    problem = { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large' };
  } else if (parserError?.type === 'charset.unsupported' || parserError?.type === 'encoding.unsupported') {
    problem = { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Use a supported JSON charset and content encoding' };
  } else if (error instanceof URIError && parserError?.status === 400) {
    problem = { status: 400, code: 'INVALID_ID', message: 'Invalid URL identifier encoding' };
  }
  if (problem) {
    res.status(problem.status).json({ error: { code: problem.code, message: problem.message, requestId } });
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
