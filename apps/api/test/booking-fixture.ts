import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express, { type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { createAppointmentRouter } from '../src/appointments/router.js';

type Role = 'student' | 'tutor';

const fixtureDdl = `
  CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    role text NOT NULL CHECK (role IN ('student', 'tutor'))
  );

  CREATE TABLE tutor_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE REFERENCES users(id),
    display_name text NOT NULL
  );

  CREATE TABLE availability_slots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id uuid NOT NULL REFERENCES tutor_profiles(id),
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    CONSTRAINT availability_slots_ends_after_starts CHECK (ends_at > starts_at)
  );

  CREATE TABLE appointments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_id uuid NOT NULL REFERENCES availability_slots(id),
    student_id uuid NOT NULL REFERENCES users(id),
    topic text NOT NULL,
    notes text,
    status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE UNIQUE INDEX one_confirmed_appointment_per_slot
    ON appointments (slot_id) WHERE status = 'confirmed';

  CREATE TABLE idempotency_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id),
    operation text NOT NULL,
    idempotency_key text NOT NULL,
    request_hash text NOT NULL,
    response_status integer NOT NULL CHECK (response_status BETWEEN 100 AND 599),
    response_body jsonb NOT NULL,
    CONSTRAINT idempotency_records_user_operation_key_unique
      UNIQUE (user_id, operation, idempotency_key)
  );
`;

// Availability creation and overlap prevention belong to the availability feature.
export async function startBookingFixture({ databaseUrl }: { databaseUrl: string }) {
  const schema = `booking_fixture_${randomBytes(12).toString('hex')}`;
  const connectionUrl = new URL(databaseUrl);
  connectionUrl.searchParams.set('options', `-c search_path=${schema}`);

  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: connectionUrl.href, max: 20 });
  let schemaCreated = false;
  let server: Server | undefined;
  let closing: Promise<void> | undefined;

  async function cleanup() {
    try {
      if (server?.listening) {
        const activeServer = server;
        await new Promise<void>((resolve, reject) => {
          activeServer.close(error => error ? reject(error) : resolve());
        });
      }
    } finally {
      try {
        await pool.end();
      } finally {
        try {
          if (schemaCreated) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
        } finally {
          await admin.end();
        }
      }
    }
  }

  function close() {
    closing ??= cleanup();
    return closing;
  }

  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    schemaCreated = true;
    const { rows } = await pool.query<{ schema: string }>('SELECT current_schema() AS schema');
    if (rows[0]?.schema !== schema) throw new Error('Could not isolate the booking fixture schema.');
    await pool.query(fixtureDdl);

    const secret = randomBytes(32);
    const issuer = 'orbit-booking-fixture';
    const audience = 'orbit-booking-test';

    function tokenFor(userId: string, role: Role) {
      return jwt.sign({ role }, secret, {
        algorithm: 'HS256',
        subject: userId,
        issuer,
        audience,
        expiresIn: '5m',
      });
    }

    const authenticate: RequestHandler = (req, res, next) => {
      const token = /^Bearer ([^\s]+)$/i.exec(req.header('authorization') ?? '')?.[1];
      try {
        if (!token) throw new Error('Missing bearer token.');
        const claims = jwt.verify(token, secret, { algorithms: ['HS256'], issuer, audience });
        if (typeof claims === 'string'
          || typeof claims.sub !== 'string'
          || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(claims.sub)
          || (claims.role !== 'student' && claims.role !== 'tutor')) {
          throw new Error('Invalid booking fixture claims.');
        }
        res.locals.auth = { userId: claims.sub, role: claims.role };
      } catch {
        res.status(401).json({
          error: { code: 'UNAUTHENTICATED', message: 'Valid bearer token required.', correlationId: randomUUID() },
        });
        return;
      }
      next();
    };

    const app = express();
    app.use(authenticate);
    app.use(createAppointmentRouter(pool));

    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Could not start the booking fixture.');

    return { pool, baseUrl: `http://127.0.0.1:${address.port}`, tokenFor, close };
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Booking fixture setup and cleanup failed.');
    }
    throw error;
  }
}
