import { hash, hashSync, compare } from "bcryptjs";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { Request, RequestHandler, Router as ExpressRouter } from "express";
import { Router } from "express";
import type { Pool } from "pg";

import { inTransaction } from "../database/transaction.js";
import { createUser, findUserById, findUserCredentialsByEmail, type User, type UserRole } from "../users/repository.js";
import { createTutorProfile } from "../tutors/repository.js";

export type AuthenticatedUser = { userId: string; role: UserRole };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISSUER = "orbit-api";
const AUDIENCE = "orbit-client";
const TOKEN_SECONDS = 3600;
const INVALID_TEXT = /[\u0000\uD800-\uDFFF]/u;
// Keep unknown-account login on the same password verification path.
const DUMMY_HASH = hashSync("orbit-dummy-password-not-an-account", 12);

export class AuthError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AuthError(400, "INVALID_REQUEST", "Provide a JSON object.");
  }
  return value as Record<string, unknown>;
}
function normalizedEmail(value: unknown): string {
  if (typeof value !== "string" || value.length > 254 || !EMAIL.test(value.trim()) ||
      INVALID_TEXT.test(value) || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new AuthError(400, "INVALID_EMAIL", "Provide a valid email address.");
  }
  return value.trim().toLowerCase();
}
function validatedPassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 12 || Buffer.byteLength(value, "utf8") > 72 ||
      /[\u0000-\u001f\u007f]/.test(value) || INVALID_TEXT.test(value)) {
    throw new AuthError(400, "INVALID_PASSWORD", "Password must be at least 12 characters and no more than 72 UTF-8 bytes.");
  }
  return value;
}
function issueToken(user: User, secret: string) {
  return jwt.sign({ role: user.role }, secret, {
    algorithm: "HS256", audience: AUDIENCE, issuer: ISSUER,
    subject: user.id, expiresIn: TOKEN_SECONDS,
  });
}
function credentials(user: User, secret: string) {
  return { user: { id: user.id, email: user.email, role: user.role },
    token: issueToken(user, secret), tokenType: "Bearer", expiresIn: TOKEN_SECONDS };
}
function validateSecret(secret: string): void {
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("JWT_SECRET must contain at least 32 UTF-8 bytes.");
  }
}
function isPgUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "23505";
}

export function createAuthRouter(pool: Pool, secret: string): ExpressRouter {
  validateSecret(secret);
  const router = Router();
  router.use("/auth", (_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  router.post("/auth/register", async (request, response) => {
    const body = asObject(request.body);
    if (Object.keys(body).some(key => !["email", "password", "role", "displayName"].includes(key))) {
      throw new AuthError(400, "INVALID_REQUEST", "Unknown registration field.");
    }
    const email = normalizedEmail(body.email);
    const password = validatedPassword(body.password);
    if (body.role !== "student" && body.role !== "tutor") {
      throw new AuthError(400, "INVALID_ROLE", "Role must be student or tutor.");
    }
    const role = body.role;
    const displayName = body.displayName;
    if (role === "tutor" && (typeof displayName !== "string" || !displayName.trim() || displayName.length > 120 ||
        INVALID_TEXT.test(displayName) || /[\u0000-\u001f\u007f]/.test(displayName))) {
      throw new AuthError(400, "INVALID_DISPLAY_NAME", "Tutors must provide a displayName (1–120 characters).");
    }
    if (role === "student" && displayName !== undefined) {
      throw new AuthError(400, "INVALID_REQUEST", "Student registration does not accept displayName.");
    }
    // Compute bcrypt outside the transaction to minimize DB lock duration.
    const passwordHash = await hash(password, 12);
    let user: User;
    try {
      user = await inTransaction(pool, async client => {
        const created = await createUser(client, { email, passwordHash, role });
        if (role === "tutor") {
          const profile = await createTutorProfile(client, { userId: created.id, displayName: (displayName as string).trim() });
          if (!profile) throw new Error("Tutor profile insertion failed.");
        }
        return created;
      });
    } catch (error) {
      if (isPgUniqueViolation(error)) throw new AuthError(409, "EMAIL_ALREADY_REGISTERED", "Email is already registered.");
      throw error;
    }
    response.status(201).json(credentials(user, secret));
  });

  router.post("/auth/login", async (request, response) => {
    const body = asObject(request.body);
    if (Object.keys(body).some(key => !["email", "password"].includes(key))) {
      throw new AuthError(400, "INVALID_REQUEST", "Unknown login field.");
    }
    const email = normalizedEmail(body.email);
    if (typeof body.password !== "string" || !body.password ||
        Buffer.byteLength(body.password, "utf8") > 72 || INVALID_TEXT.test(body.password) ||
        /[\u0000-\u001f\u007f]/.test(body.password)) {
      throw new AuthError(400, "INVALID_REQUEST", "Provide an email and password.");
    }
    const record = await findUserCredentialsByEmail(pool, email);
    // Avoid disclosing whether an account exists; always return the same failure shape.
    const valid = await compare(body.password, record?.passwordHash ?? DUMMY_HASH);
    if (!record || !valid) {
      throw new AuthError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }
    response.status(200).json(credentials({ id: record.id, email: record.email, role: record.role }, secret));
  });
  return router;
}

export function createRequireAuth(pool: Pool, secret: string): RequestHandler {
  validateSecret(secret);
  return async (request, response, next) => {
    try {
      const authHeaders = request.headersDistinct.authorization ?? [];
      const match = authHeaders.length === 1 ? authHeaders[0].match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i) : null;
      if (!match) throw new AuthError(401, "UNAUTHENTICATED", "A valid bearer token is required.");
      let decoded: string | JwtPayload;
      try {
        decoded = jwt.verify(match[1], secret, {
          algorithms: ["HS256"], issuer: ISSUER, audience: AUDIENCE,
        });
      } catch {
        throw new AuthError(401, "UNAUTHENTICATED", "Token is invalid or expired.");
      }
      if (typeof decoded === "string" || typeof decoded.sub !== "string" || !UUID.test(decoded.sub) ||
          typeof decoded.exp !== "number" || !Number.isFinite(decoded.exp) ||
          (decoded.role !== "student" && decoded.role !== "tutor")) {
        throw new AuthError(401, "UNAUTHENTICATED", "Invalid token claims.");
      }
      // Check current database user/role, not only signed role claims.
      const user = await findUserById(pool, decoded.sub);
      if (!user || user.role !== decoded.role) throw new AuthError(401, "UNAUTHENTICATED", "Account is no longer valid.");
      const trusted: AuthenticatedUser = { userId: user.id, role: user.role };
      response.locals.auth = trusted; // Yousef's booking router reads this.
      (request as Request & { auth?: AuthenticatedUser }).auth = trusted; // Mehjabin's controller adapter reads this.
      next();
    } catch (error) {
      if (error instanceof AuthError && error.status === 401) response.setHeader("WWW-Authenticate", "Bearer");
      next(error);
    }
  };
}

export function authenticatedFromRequest(request: Request): AuthenticatedUser {
  const user = (request as Request & { auth?: AuthenticatedUser }).auth;
  if (!user) throw new AuthError(401, "UNAUTHENTICATED", "Authentication required.");
  return user;
}
