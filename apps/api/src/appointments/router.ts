import { randomUUID } from "node:crypto";
import express, { type ErrorRequestHandler, type Request, type Response } from "express";
import type { Pool } from "pg";

import { type BookingRequest } from "./repository.js";
import { AppointmentError, bookAppointment, cancelAppointment } from "./service.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVALID_TEXT = /[\u0000\uD800-\uDFFF]/u;

function studentId(response: Response): string {
  const auth = response.locals.auth;
  if (typeof auth?.userId !== "string" || !UUID.test(auth.userId)) {
    throw new AppointmentError(401, "UNAUTHENTICATED", "Sign in to manage appointments.");
  }
  if (auth.role !== "student") {
    throw new AppointmentError(403, "STUDENT_REQUIRED", "Only students can manage appointments.");
  }
  return auth.userId;
}

function readBookingRequest(body: unknown): BookingRequest {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new AppointmentError(400, "INVALID_BOOKING", "Provide an appointment request object.");
  }
  const { slotId, topic, notes } = body as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["slotId", "topic", "notes"].includes(key)) ||
    typeof slotId !== "string" || !UUID.test(slotId) ||
    typeof topic !== "string" || topic.trim().length === 0 || topic.length > 200 ||
    (notes !== undefined && (typeof notes !== "string" || notes.length > 4000)) ||
    INVALID_TEXT.test(topic) || (notes !== undefined && INVALID_TEXT.test(notes))) {
    throw new AppointmentError(400, "INVALID_BOOKING", "Provide a valid slot ID, topic, and optional notes.");
  }
  return { slotId, topic, notes };
}

function readIdempotencyKey(request: Request): string {
  const keys = request.headersDistinct["idempotency-key"] ?? [];
  if (keys.length !== 1 || !/^[!-~]{1,255}$/.test(keys[0]) || keys[0].includes(",")) {
    throw new AppointmentError(400, "INVALID_IDEMPOTENCY_KEY", "Provide one valid Idempotency-Key header.");
  }
  return keys[0];
}

const respondToError: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  let problem = new AppointmentError(500, "INTERNAL_ERROR", "The appointment operation failed.");
  if (error instanceof AppointmentError) {
    problem = error;
  } else if (error instanceof URIError && "status" in error && error.status === 400) {
    problem = new AppointmentError(400, "INVALID_APPOINTMENT_ID", "Provide a valid appointment ID.");
  } else if (error?.type === "entity.parse.failed") {
    problem = new AppointmentError(400, "INVALID_BOOKING", "Provide valid JSON.");
  } else if (error?.type === "entity.too.large") {
    problem = new AppointmentError(413, "PAYLOAD_TOO_LARGE", "The appointment request is too large.");
  } else if (error?.type === "charset.unsupported" || error?.type === "encoding.unsupported") {
    problem = new AppointmentError(415, "UNSUPPORTED_MEDIA_TYPE", "Use a supported JSON charset and content encoding.");
  }
  response.status(problem.status).json({
    error: { code: problem.code, message: problem.message, correlationId: randomUUID() },
  });
};

// Mount after JWT verification middleware that supplies res.locals.auth.
export function createAppointmentRouter(pool: Pool) {
  const router = express.Router();
  router.post("/appointments", express.json({ limit: "32kb" }), async (request, response) => {
    const userId = studentId(response);
    const booking = readBookingRequest(request.body);
    const key = readIdempotencyKey(request);
    const result = await bookAppointment(pool, userId, booking, key);
    response.status(result.status).json(result.body);
  });
  router.delete("/appointments/:appointmentId", async (request, response) => {
    const userId = studentId(response);
    const { appointmentId } = request.params;
    if (!UUID.test(appointmentId)) {
      throw new AppointmentError(400, "INVALID_APPOINTMENT_ID", "Provide a valid appointment ID.");
    }
    await cancelAppointment(pool, userId, appointmentId);
    response.sendStatus(204);
  });
  router.use(respondToError);
  return router;
}
