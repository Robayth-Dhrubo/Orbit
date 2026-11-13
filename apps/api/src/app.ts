import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import type { Pool } from "pg";
import { createAuthRouter, createRequireAuth, authenticatedFromRequest, AuthError } from "./auth/auth.js";
import { createTutorRoutes } from "./team-api/routes/tutors.routes.js";
import { createAppointmentController } from "./team-api/controllers/appointments.controller.js";
import { TutorServiceError } from "./team-api/services/tutors.service.js";
import { AppointmentServiceError } from "./team-api/services/appointments.service.js";
import { createAppointmentRouter } from "./appointments/router.js";
import { AppointmentError } from "./appointments/service.js";
import { connectTeamServices } from "./integration/team-adapters.js";
import { registerReadinessRoute } from "./database/readiness.js";

export function createOrbitApp(pool: Pool, jwtSecret: string) {
  const app = express();
  app.disable("x-powered-by");
  const requireAuth = createRequireAuth(pool, jwtSecret);
  const services = connectTeamServices(pool);
  const appointmentController = createAppointmentController(services.appointmentService, authenticatedFromRequest);

  const correlation: RequestHandler = (_req, res, next) => {
    res.locals.correlationId = randomUUID();
    res.setHeader("X-Request-Id", res.locals.correlationId);
    next();
  };
  app.use(correlation);

  // JSON Lines request logs for all responses, including handled errors.
  // Do not record URLs, query strings, IP addresses, headers, JWTs or bodies.
  // Correlation ID is assigned by the preceding middleware.
  const structuredRequestLogger: RequestHandler = (request, response, next) => {
    const startedAt = process.hrtime.bigint();
    let emitted = false;
    const emit = (outcome: "completed" | "aborted") => {
      if (emitted) return;
      emitted = true;
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const entry = {
        timestamp: new Date().toISOString(),
        level: response.statusCode >= 500 ? "error" : "info",
        event: "http_request",
        correlationId: String(response.locals.correlationId),
        method: request.method,
        statusCode: response.statusCode,
        durationMs: Math.round(elapsedMs * 100) / 100,
        outcome,
      };
      console.info(JSON.stringify(entry));
    };
    response.once("finish", () => emit("completed"));
    response.once("close", () => {
      if (!response.writableFinished) emit("aborted");
    });
    next();
  };
  app.use(structuredRequestLogger);

  // Explicit parser limit and centralized parser-error handling.
  app.use(express.json({ limit: "32kb", strict: true }));

  app.use(createAuthRouter(pool, jwtSecret));
  app.use("/tutors", createTutorRoutes(services.tutorService, requireAuth, authenticatedFromRequest));
  // Mehjabin's appointment listing controller reads only the verified JWT user.
  app.get("/appointments", requireAuth, appointmentController.getAppointments);
  // Yousef's router owns the sensitive POST and DELETE paths: validation,
  // idempotency, cancellation, and shared database slot locks stay intact.
  app.use("/appointments", requireAuth);
  app.use(createAppointmentRouter(pool, { forwardErrors: true }));

  app.get("/openapi.yaml", async (_request, response, next) => {
    try {
      const yaml = await readFile(new URL("../../../openapi.yaml", import.meta.url), "utf8");
      response.type("application/yaml").send(yaml);
    } catch (error) { next(error); }
  });
  app.get("/docs", async (_request, response, next) => {
    try {
      const yaml = await readFile(new URL("../../../openapi.yaml", import.meta.url), "utf8");
      const escaped = yaml.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
      response.type("html").send(`<!doctype html><html lang="en"><meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1"><title>ORBIT API contract</title>
        <style>body{max-width:72rem;margin:2rem auto;padding:0 1rem;font:16px system-ui;line-height:1.5}pre{overflow:auto;background:#f3f5f8;padding:1.5rem;border-radius:.5rem;font-size:14px}</style>
        <h1>ORBIT Phase 2 API contract</h1><p>Eight application operations for authentication, tutor availability and appointments.</p>
        <p><a href="/openapi.yaml">Download OpenAPI YAML</a>. This page works offline once the API is running.</p><pre>${escaped}</pre></html>`);
    } catch (error) { next(error); }
  });
  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
  registerReadinessRoute(app, pool);
  app.use((_request, _response, next) => next(new AuthError(404, "NOT_FOUND", "Route not found.")));

  const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
    if (response.headersSent) { next(error); return; }
    const correlationId = String(response.locals.correlationId || randomUUID());
    let status = 500;
    let code = "INTERNAL_ERROR";
    let message = "An unexpected error occurred.";
    if (error instanceof AuthError || error instanceof AppointmentError) {
      status = error.status; code = error.code; message = error.message;
    } else if (error instanceof TutorServiceError || error instanceof AppointmentServiceError) {
      status = error.statusCode; code = error.code; message = error.message;
    } else if (error instanceof URIError && "status" in error && error.status === 400) {
      status = 400; code = "INVALID_PATH"; message = "Invalid URL path encoding.";
    } else if (typeof error === "object" && error !== null && "type" in error) {
      if (error.type === "entity.parse.failed") {
        status = 400; code = "INVALID_JSON"; message = "Malformed JSON request body.";
      } else if (error.type === "entity.too.large") {
        status = 413; code = "PAYLOAD_TOO_LARGE"; message = "Request body is too large.";
      } else if (error.type === "charset.unsupported" || error.type === "encoding.unsupported") {
        status = 415; code = "UNSUPPORTED_MEDIA_TYPE"; message = "Unsupported JSON charset or encoding.";
      }
    }
    if (status === 500) console.error(`[${correlationId}] Unhandled API error`, error);
    response.status(status).json({ error: { code, message, correlationId } });
  };
  app.use(errorHandler);
  return app;
}
