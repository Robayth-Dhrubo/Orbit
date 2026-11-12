
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createAppointmentService,
  type AppointmentRepository,
  type AtomicBookingService,
  type BookingInput,
  type AuthenticatedUser
} from '../../src/team-api/services/appointments.service.js';

// Sample identifiers

const studentId =
  '11111111-1111-4111-8111-111111111111';

const otherStudentId =
  '22222222-2222-4222-8222-222222222222';

const slotId =
  '33333333-3333-4333-8333-333333333333';

const appointmentId =
  '44444444-4444-4444-8444-444444444444';

// Authenticated student

const student: AuthenticatedUser = {
  userId: studentId,
  role: 'student'
};

// Authenticated tutor

const tutor: AuthenticatedUser = {
  userId: otherStudentId,
  role: 'tutor'
};

// Valid booking request

function validBooking() {
  return {
    slotId,
    topic: 'Calculus',
    notes: 'Integration practice'
  };
}

// Mock the modules assigned to Azmain
// and Yousef for isolated service testing.

function createMocks() {
  const bookingCalls: BookingInput[] = [];
  const listingCalls: string[] = [];

  const cancellationCalls: {
    appointmentId: string;
    studentId: string;
  }[] = [];

  const repository: AppointmentRepository = {
    async findByStudentId(id) {
      listingCalls.push(id);

      return [
        {
          appointmentId,
          slotId,
          status: 'confirmed',
          topic: 'Calculus',
          notes: 'Integration practice'
        }
      ];
    }
  };

  const atomic: AtomicBookingService = {
    async bookAtomically(input) {
      bookingCalls.push(input);

      return {
        appointmentId,
        slotId: input.slotId,
        status: 'confirmed'
      };
    },

    async cancelAtomically(id, ownerId) {
      cancellationCalls.push({
        appointmentId: id,
        studentId: ownerId
      });

      return 'cancelled';
    }
  };

  const service = createAppointmentService(
    repository,
    atomic
  );

  return {
    service,
    repository,
    atomic,
    bookingCalls,
    listingCalls,
    cancellationCalls
  };
}

// TEST 1: Successful booking

test('Student can submit a valid booking', async () => {
  const { service } = createMocks();

  const result = await service.bookAppointment(
    student,
    validBooking(),
    'booking-key-001'
  );

  assert.equal(
    result.appointmentId,
    appointmentId
  );

  assert.equal(
    result.status,
    'confirmed'
  );
});

// TEST 2: Trusted student identity

test('Booking uses student ID from JWT context and rejects a supplied identity', async () => {
  const { service, bookingCalls } = createMocks();
  await service.bookAppointment(student, validBooking(), 'booking-key-002');
  assert.equal(bookingCalls[0].studentId, studentId);
  await assert.rejects(
    () => service.bookAppointment(student, { ...validBooking(), studentId: otherStudentId }, 'forged-owner'),
    { statusCode: 400, code: 'INVALID_REQUEST' }
  );
  assert.equal(bookingCalls.length, 1);
});

// TEST 3: Tutor cannot book

test('Tutor cannot book student appointments', async () => {
  const { service } = createMocks();

  await assert.rejects(
    () => service.bookAppointment(
      tutor,
      validBooking(),
      'booking-key-003'
    ),
    {
      statusCode: 403,
      code: 'FORBIDDEN'
    }
  );
});

// TEST 4: Invalid slot

test('Invalid slot ID is rejected', async () => {
  const { service } = createMocks();

  await assert.rejects(
    () => service.bookAppointment(
      student,
      {
        ...validBooking(),
        slotId: 'invalid-slot'
      },
      'booking-key-004'
    ),
    {
      statusCode: 400,
      code: 'INVALID_ID'
    }
  );
});

// TEST 5: Missing topic

test('Missing booking topic is rejected', async () => {
  const { service } = createMocks();

  await assert.rejects(
    () => service.bookAppointment(
      student,
      {
        slotId,
        topic: ''
      },
      'booking-key-005'
    ),
    {
      statusCode: 400,
      code: 'INVALID_TOPIC'
    }
  );
});

// TEST 6: Invalid notes

test('Invalid notes are rejected', async () => {
  const { service } = createMocks();

  await assert.rejects(
    () => service.bookAppointment(
      student,
      {
        ...validBooking(),
        notes: 12345
      },
      'booking-key-006'
    ),
    {
      statusCode: 400,
      code: 'INVALID_NOTES'
    }
  );
});

// TEST 7: Missing idempotency key

test('Booking requires an idempotency key', async () => {
  const { service } = createMocks();

  await assert.rejects(
    () => service.bookAppointment(
      student,
      validBooking(),
      undefined
    ),
    {
      statusCode: 400,
      code: 'INVALID_IDEMPOTENCY_KEY'
    }
  );
});

// TEST 8: Idempotency key forwarding

test('Booking key is passed to atomic service', async () => {
  const { service, bookingCalls } = createMocks();

  await service.bookAppointment(
    student,
    validBooking(),
    'unique-booking-key'
  );

  assert.equal(
    bookingCalls[0].idempotencyKey,
    'unique-booking-key'
  );
});

// TEST 9: Appointment listing

test('Student retrieves own appointments', async () => {
  const { service, listingCalls } = createMocks();

  const appointments =
    await service.getMyAppointments(student);

  assert.equal(
    appointments.length,
    1
  );

  assert.deepEqual(
    listingCalls,
    [studentId]
  );
});

// TEST 10: Tutor cannot view student appointments

test('Tutor cannot use student appointment listing', async () => {
  const { service } = createMocks();

  await assert.rejects(
    () => service.getMyAppointments(tutor),
    {
      statusCode: 403,
      code: 'FORBIDDEN'
    }
  );
});

// TEST 11: Successful cancellation

test('Student can request cancellation', async () => {
  const {
    service,
    cancellationCalls
  } = createMocks();

  await service.cancelAppointment(
    student,
    appointmentId
  );

  assert.deepEqual(
    cancellationCalls[0],
    {
      appointmentId,
      studentId
    }
  );
});

// TEST 12: Invalid appointment identifier

test('Invalid appointment ID is rejected', async () => {
  const { service } = createMocks();

  await assert.rejects(
    () => service.cancelAppointment(
      student,
      'not-valid'
    ),
    {
      statusCode: 400,
      code: 'INVALID_ID'
    }
  );
});

// TEST 13: Tutor cannot cancel student appointment

test('Tutor cannot cancel student appointments', async () => {
  const { service } = createMocks();

  await assert.rejects(
    () => service.cancelAppointment(
      tutor,
      appointmentId
    ),
    {
      statusCode: 403,
      code: 'FORBIDDEN'
    }
  );
});

// TEST 14: Unknown or non-owned appointment

test('Unknown appointment returns 404', async () => {
  const { service, atomic } = createMocks();

  atomic.cancelAtomically = async () => {
    return 'not_found';
  };

  await assert.rejects(
    () => service.cancelAppointment(
      student,
      appointmentId
    ),
    {
      statusCode: 404,
      code: 'APPOINTMENT_NOT_FOUND'
    }
  );
});

// TEST 15: Repeated cancellation

test('Already cancelled appointment is safe', async () => {
  const { service, atomic } = createMocks();

  atomic.cancelAtomically = async () => {
    return 'already_cancelled';
  };

  await assert.doesNotReject(
    () => service.cancelAppointment(
      student,
      appointmentId
    )
  );
});

test('Booking preserves text, omitted notes and empty notes for idempotency', async () => {
  const { service, bookingCalls } = createMocks();
  await service.bookAppointment(student, { slotId, topic: ' Calculus ' }, 'first');
  await service.bookAppointment(student, { slotId, topic: ' Calculus ', notes: '' }, 'second');
  assert.equal(bookingCalls[0].topic, ' Calculus ');
  assert.equal(bookingCalls[0].notes, undefined);
  assert.equal(bookingCalls[1].notes, '');
});

test('Booking bounds and PostgreSQL-invalid Unicode are rejected before persistence', async () => {
  const { service, bookingCalls } = createMocks();
  for (const topic of ['x'.repeat(201), 'bad\u0000topic', '\uD800', '   ']) {
    await assert.rejects(() => service.bookAppointment(student, { slotId, topic }, 'key'),
      { statusCode: 400, code: 'INVALID_TOPIC' });
  }
  for (const notes of ['x'.repeat(4001), 'bad\u0000notes', '\uDFFF']) {
    await assert.rejects(() => service.bookAppointment(student, { slotId, topic: 'Valid', notes }, 'key'),
      { statusCode: 400, code: 'INVALID_NOTES' });
  }
  assert.equal(bookingCalls.length, 0);
  await service.bookAppointment(student, { slotId, topic: 'x'.repeat(200), notes: 'x'.repeat(4000) }, 'k'.repeat(255));
  await service.bookAppointment(student, { slotId, topic: 'Math 📚', notes: '✓' }, 'unicode-valid');
  assert.equal(bookingCalls.length, 2);
});

test('Idempotency keys reject whitespace, comma-joined duplicates, controls and oversized values', async () => {
  const { service, bookingCalls } = createMocks();
  for (const key of [' leading', 'trailing ', 'two words', 'a,b', '\t', 'k'.repeat(256), 'ümlaut']) {
    await assert.rejects(() => service.bookAppointment(student, validBooking(), key),
      { statusCode: 400, code: 'INVALID_IDEMPOTENCY_KEY' });
  }
  assert.equal(bookingCalls.length, 0);
});
