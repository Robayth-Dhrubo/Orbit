
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

import type { AddressInfo } from 'node:net';
import type { Request, RequestHandler } from 'express';

import express from 'express';

import {
  createTutorRoutes
} from '../src/routes/tutors.routes.js';

import {
  createAppointmentRoutes
} from '../src/routes/appointments.routes.js';

import type {
  TutorService,
  AuthenticatedUser
} from '../src/controllers/tutors.controller.js';

import type {
  AppointmentService
} from '../src/controllers/appointments.controller.js';

import {
  TutorServiceError
} from '../src/services/tutors.service.js';

import {
  AppointmentServiceError
} from '../src/services/appointments.service.js';

import {
  errorHandler,
  requestIdMiddleware
} from '../src/middleware/error-handler.js';

// Test identifiers

const tutorId =
  '11111111-1111-4111-8111-111111111111';

const tutorUserId =
  '22222222-2222-4222-8222-222222222222';

const studentId =
  '33333333-3333-4333-8333-333333333333';

const slotId =
  '44444444-4444-4444-8444-444444444444';

const appointmentId =
  '55555555-5555-4555-8555-555555555555';

const unknownTutorId =
  '66666666-6666-4666-8666-666666666666';

const occupiedSlotId =
  '77777777-7777-4777-8777-777777777777';

// Track information passed to the services

interface CapturedCalls {
  createdFor?: string;
  createdBy?: string;
  bookingStudent?: string;
  bookingKey?: string;
  listedFor?: string;
  cancelledBy?: string;
  cancelledId?: string;
}

// Mock authentication middleware.
// This does not implement or test real JWTs.

const mockAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;

  if (
    header !== 'Bearer student' &&
    header !== 'Bearer tutor'
  ) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Login required'
      }
    });

    return;
  }

  next();
};

// Trusted test identity from the mock middleware

function getTestUser(
  req: Request
): AuthenticatedUser {
  if (req.headers.authorization === 'Bearer tutor') {
    return {
      userId: tutorUserId,
      role: 'tutor'
    };
  }

  return {
    userId: studentId,
    role: 'student'
  };
}

// Start an Express test server with mock services

async function withTestServer(
  run: (
    baseUrl: string,
    calls: CapturedCalls
  ) => Promise<void>
) {
  const calls: CapturedCalls = {};

  // Tutor service mock

  const tutorService: TutorService = {
    async getAllTutors() {
      return [
        {
          id: tutorId,
          userId: tutorUserId,
          name: 'Test Tutor',
          subject: 'Calculus'
        }
      ];
    },

    async getAvailableSlots(id) {
      if (id === unknownTutorId) {
        throw new TutorServiceError(
          404,
          'TUTOR_NOT_FOUND',
          'Tutor not found'
        );
      }

      return [
        {
          id: slotId,
          tutorId: id,
          startTime: '2027-01-15T10:00:00Z',
          endTime: '2027-01-15T11:00:00Z'
        }
      ];
    },

    async createAvailability(user, id, data) {
      calls.createdBy = user.userId;
      calls.createdFor = id;

      const body = data as {
        startTime: string;
        endTime: string;
      };

      return {
        id: slotId,
        tutorId: id,
        startTime: body.startTime,
        endTime: body.endTime
      };
    }
  };

  // Appointment service mock

  const appointmentService: AppointmentService = {
    async bookAppointment(user, data, key) {
      calls.bookingStudent = user.userId;
      calls.bookingKey = key;

      if (!key) {
        throw new AppointmentServiceError(
          400,
          'INVALID_IDEMPOTENCY_KEY',
          'Idempotency-Key is required'
        );
      }

      const body = data as {
        slotId: string;
      };

      if (body.slotId === occupiedSlotId) {
        throw new AppointmentServiceError(
          409,
          'SLOT_ALREADY_BOOKED',
          'Slot is already booked'
        );
      }

      return {
        appointmentId,
        slotId: body.slotId,
        status: 'confirmed'
      };
    },

    async getMyAppointments(user) {
      calls.listedFor = user.userId;

      return [
        {
          appointmentId,
          slotId,
          topic: 'Calculus',
          status: 'confirmed'
        }
      ];
    },

    async cancelAppointment(user, id) {
      calls.cancelledBy = user.userId;
      calls.cancelledId = id;
    }
  };

  // Create Express application

  const app = express();

  app.use(express.json());
  app.use(requestIdMiddleware);

  // Mount your assigned routes

  app.use(
    '/tutors',
    createTutorRoutes(
      tutorService,
      mockAuth,
      getTestUser
    )
  );

  app.use(
    '/appointments',
    createAppointmentRoutes(
      appointmentService,
      mockAuth,
      getTestUser
    )
  );

  app.use(errorHandler);

  // Start on a temporary free port

  const server = app.listen(0);

  await once(server, 'listening');

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Could not start test server');
  }

  const port = (address as AddressInfo).port;

  try {
    await run(
      `http://127.0.0.1:${port}`,
      calls
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

// Helper for HTTP requests

async function request(
  base: string,
  path: string,
  method = 'GET',
  body?: unknown,
  token?: string,
  key?: string
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(token
        ? { Authorization: `Bearer ${token}` }
        : {}),
      ...(key
        ? { 'Idempotency-Key': key }
        : {})
    },
    body: body !== undefined
      ? JSON.stringify(body)
      : undefined
  });

  const result = response.status === 204
    ? null
    : await response.json();

  return {
    status: response.status,
    body: result
  };
}

// TEST 1: All six routes respond correctly

test('All six core API routes work', async () => {
  await withTestServer(async (base, calls) => {

    // GET /tutors

    const tutors = await request(base, '/tutors');

    assert.equal(tutors.status, 200);
    assert.equal(tutors.body.length, 1);
    assert.equal(tutors.body[0].subject, 'Calculus');

    // GET /tutors/:tutorId/slots

    const slots = await request(
      base,
      `/tutors/${tutorId}/slots`
    );

    assert.equal(slots.status, 200);
    assert.equal(slots.body[0].id, slotId);

    // POST /tutors/:tutorId/slots

    const created = await request(
      base,
      `/tutors/${tutorId}/slots`,
      'POST',
      {
        startTime: '2027-01-15T10:00:00Z',
        endTime: '2027-01-15T11:00:00Z'
      },
      'tutor'
    );

    assert.equal(created.status, 201);
    assert.equal(calls.createdFor, tutorId);
    assert.equal(calls.createdBy, tutorUserId);

    // POST /appointments

    const booking = await request(
      base,
      '/appointments',
      'POST',
      {
        slotId,
        topic: 'Calculus'
      },
      'student',
      'booking-key-123'
    );

    assert.equal(booking.status, 201);

    assert.equal(
      booking.body.appointmentId,
      appointmentId
    );

    assert.equal(
      calls.bookingStudent,
      studentId
    );

    assert.equal(
      calls.bookingKey,
      'booking-key-123'
    );

    // GET /appointments

    const appointments = await request(
      base,
      '/appointments',
      'GET',
      undefined,
      'student'
    );

    assert.equal(appointments.status, 200);
    assert.equal(appointments.body.length, 1);
    assert.equal(calls.listedFor, studentId);

    // DELETE /appointments/:appointmentId

    const cancelled = await request(
      base,
      `/appointments/${appointmentId}`,
      'DELETE',
      undefined,
      'student'
    );

    assert.equal(cancelled.status, 204);
    assert.equal(calls.cancelledBy, studentId);
    assert.equal(calls.cancelledId, appointmentId);
  });
});

// TEST 2: Authentication is required

test('Protected API routes reject missing login', async () => {
  await withTestServer(async base => {
    const result = await request(
      base,
      '/appointments'
    );

    assert.equal(result.status, 401);
    assert.equal(
      result.body.error.code,
      'UNAUTHORIZED'
    );
  });
});

// TEST 3: Unknown tutor returns 404

test('Unknown tutor returns documented error', async () => {
  await withTestServer(async base => {
    const result = await request(
      base,
      `/tutors/${unknownTutorId}/slots`
    );

    assert.equal(result.status, 404);

    assert.equal(
      result.body.error.code,
      'TUTOR_NOT_FOUND'
    );

    assert.ok(
      result.body.error.requestId
    );
  });
});

// TEST 4: Missing booking key

test('Missing idempotency key returns 400', async () => {
  await withTestServer(async base => {
    const result = await request(
      base,
      '/appointments',
      'POST',
      {
        slotId,
        topic: 'Calculus'
      },
      'student'
    );

    assert.equal(result.status, 400);

    assert.equal(
      result.body.error.code,
      'INVALID_IDEMPOTENCY_KEY'
    );
  });
});

// TEST 5: Occupied slot

test('Occupied booking slot returns 409', async () => {
  await withTestServer(async base => {
    const result = await request(
      base,
      '/appointments',
      'POST',
      {
        slotId: occupiedSlotId,
        topic: 'Calculus'
      },
      'student',
      'booking-key-409'
    );

    assert.equal(result.status, 409);

    assert.equal(
      result.body.error.code,
      'SLOT_ALREADY_BOOKED'
    );
  });
});
