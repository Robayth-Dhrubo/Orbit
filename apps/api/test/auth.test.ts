import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { hash } from "bcryptjs";
import jwt from "jsonwebtoken";
import { createAuthRouter, createRequireAuth, AuthError } from "../src/auth/auth.js";

const secret = "local-test-only-never-deploy-this-very-long-secret";
const studentId = "10000000-0000-4000-8000-000000000001";
const users = new Map<string, { id: string; email: string; role: "student" | "tutor"; passwordHash: string }>();
const sqlCalls: string[] = [];

const poolImpl = {
  async query(sql: string, values: unknown[] = []) {
    sqlCalls.push(sql);
    if (sql.includes("SELECT id, email, role, password_hash")) {
      const user = users.get(String(values[0]));
      return { rows: user ? [{ ...user }] : [], rowCount: user ? 1 : 0 };
    }
    if (sql.includes("SELECT id, email, role FROM users WHERE id")) {
      const user = [...users.values()].find(u => u.id === values[0]);
      return { rows: user ? [{ id: user.id, email: user.email, role: user.role }] : [], rowCount: user ? 1 : 0 };
    }
    if (sql.includes("INSERT INTO users")) {
      const email = String(values[0]);
      if (users.has(email)) throw Object.assign(new Error("duplicate"), { code: "23505" });
      const record = { id: `10000000-0000-4000-8000-${String(users.size + 1).padStart(12, "0")}`, email, passwordHash: String(values[1]), role: values[2] as "student" | "tutor" };
      users.set(email, record);
      return { rows: [{ id: record.id, email: record.email, role: record.role }], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO tutor_profiles")) return { rows: [{ id: "10000000-0000-4000-8000-000000000002", displayName: "Tutor", bio: "" }], rowCount: 1 };
    throw new Error(`Unexpected SQL in auth test: ${sql}`);
  },
  async connect() {
    return {
      async query(sql: string, values?: unknown[]) {
        if (sql.startsWith("BEGIN") || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
        return poolImpl.query(sql, values);
      },
      release() {},
    };
  },
};
const pool = poolImpl as unknown as Pool;

const app = express();
app.use(express.json());
app.use(createAuthRouter(pool, secret));
app.get("/protected", createRequireAuth(pool, secret), (_request, response) => {
  response.json(response.locals.auth);
});
app.use(((error: unknown, _req: unknown, res: express.Response, _next: unknown) => {
  if (error instanceof AuthError) { res.status(error.status).json({ code: error.code }); return; }
  res.status(500).json({ code: "INTERNAL_ERROR" });
}) as express.ErrorRequestHandler);
let server: ReturnType<typeof app.listen>;
let base = "";

before(async () => {
  users.clear();
  const seedHash = await hash("seed-password-123456", 4);
  users.set("student.a@orbit.test", { id: studentId, email: "student.a@orbit.test", role: "student", passwordHash: seedHash });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>(resolve => server.close(() => resolve())));

async function login(password: string) {
  return fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "student.a@orbit.test", password }) });
}

test("correct password issues a signed JWT without exposing password hashes", async () => {
  const response = await login("seed-password-123456");
  assert.equal(response.status, 200);
  const json = await response.json() as { token: string; user: Record<string, unknown> };
  assert.equal(json.user.id, studentId);
  assert.equal(json.user.passwordHash, undefined);
  assert.equal(typeof json.token, "string");
  const protectedResponse = await fetch(`${base}/protected`, { headers: { Authorization: `Bearer ${json.token}` } });
  assert.equal(protectedResponse.status, 200);
  assert.deepEqual(await protectedResponse.json(), { userId: studentId, role: "student" });
});

test("wrong password and missing JWT are rejected", async () => {
  assert.equal((await login("incorrect-password")).status, 401);
  assert.equal((await fetch(`${base}/protected`)).status, 401);
});

test("tampered and expired tokens are rejected", async () => {
  const response = await login("seed-password-123456");
  const { token } = await response.json() as { token: string };
  const altered = token.slice(0, -3) + "bad";
  assert.equal((await fetch(`${base}/protected`, { headers: { Authorization: `Bearer ${altered}` } })).status, 401);
  const expired = jwt.sign({ role: "student" }, secret,
    { algorithm: "HS256", audience: "orbit-client", issuer: "orbit-api", subject: studentId, expiresIn: -10 });
  assert.equal((await fetch(`${base}/protected`, { headers: { Authorization: `Bearer ${expired}` } })).status, 401);
});

test("duplicate registration is 409 and errors do not expose password hashes", async () => {
  const response = await fetch(`${base}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "student.a@orbit.test", password: "another-valid-password-123", role: "student" }) });
  assert.equal(response.status, 409);
  assert.equal((await response.text()).includes("passwordHash"), false);
});

test("JWT role cannot be forged by changing signed claims", async () => {
  const forged = jwt.sign({ role: "tutor" }, secret,
    { algorithm: "HS256", audience: "orbit-client", issuer: "orbit-api", subject: studentId, expiresIn: 3600 });
  // Valid signature is not enough; role must still match PostgreSQL.
  assert.equal((await fetch(`${base}/protected`, { headers: { Authorization: `Bearer ${forged}` } })).status, 401);
  assert.ok(sqlCalls.some(sql => sql.includes("FROM users WHERE id")));
});


test("tutor registration creates profile and never exposes stored password hash", async () => {
  const response = await fetch(`${base}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "Tutor.New@orbit.test", password: "a-long-tutor-password-123", role: "tutor", displayName: "Tutor New" }) });
  assert.equal(response.status, 201);
  const result = await response.json() as { user: { id: string; email: string; role: string; passwordHash?: string }; token: string };
  assert.equal(result.user.role, "tutor");
  assert.equal(result.user.email, "tutor.new@orbit.test");
  assert.equal(result.user.passwordHash, undefined);
  const stored = users.get("tutor.new@orbit.test");
  assert.ok(stored);
  assert.notEqual(stored.passwordHash, "a-long-tutor-password-123");
  assert.ok(stored.passwordHash.startsWith("$2"));
  assert.ok(sqlCalls.some(sql => sql.includes("INSERT INTO tutor_profiles")));
  const authorized = await fetch(`${base}/protected`, { headers: { Authorization: `Bearer ${result.token}` } });
  assert.equal(authorized.status, 200);
});
