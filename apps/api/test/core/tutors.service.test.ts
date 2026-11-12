
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createTutorService,
  type TutorRepository,
  type Tutor,
  type AvailabilitySlot
} from '../../src/team-api/services/tutors.service.js';

// Example test identifiers
const tutorId =
  '11111111-1111-4111-8111-111111111111';

const ownerId =
  '22222222-2222-4222-8222-222222222222';

const otherId =
  '33333333-3333-4333-8333-333333333333';

// Example tutor
const tutor: Tutor = {
  id: tutorId,
  userId: ownerId,
  displayName: 'Test Tutor',
  bio: 'Calculus'
};

// Future appointment time
function futureDates() {
  const start = new Date(
    Date.now() + 86400000
  );

  const end = new Date(
    start.getTime() + 3600000
  );

  return {
    startTime: start.toISOString(),
    endTime: end.toISOString()
  };
}

// Example availability slot
function exampleSlot(): AvailabilitySlot {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    tutorId,
    ...futureDates()
  };
}

// Mock Azmain's repository
function mockRepository(): TutorRepository {
  return {
    findAllTutors: async () => [tutor],

    findTutorById: async id =>
      id === tutorId ? tutor : null,

    findAvailableSlots: async () =>
      [exampleSlot()],

    createSlotIfNoOverlap: async (
      id,
      start,
      end
    ) => ({
      id: exampleSlot().id,
      tutorId: id,
      startTime: start.toISOString(),
      endTime: end.toISOString()
    })
  };
}

// TEST 1: Tutor listing

test('GET tutors returns tutor profiles', async () => {
  const service = createTutorService(
    mockRepository()
  );

  const result = await service.getAllTutors();

  assert.equal(result.length, 1);
  assert.equal(result[0].displayName, 'Test Tutor');
  assert.equal(result[0].bio, 'Calculus');
});

// TEST 2: Retrieve available slots

test('GET tutor slots returns available slots', async () => {
  const service = createTutorService(
    mockRepository()
  );

  const result = await service.getAvailableSlots(
    tutorId
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].tutorId, tutorId);
});

// TEST 3: Invalid tutor ID

test('Invalid tutor ID is rejected', async () => {
  const service = createTutorService(
    mockRepository()
  );

  await assert.rejects(
    () => service.getAvailableSlots('invalid-id'),
    { statusCode: 400, code: 'INVALID_TUTOR_ID' }
  );
});

// TEST 4: Unknown tutor

test('Unknown tutor returns 404', async () => {
  const service = createTutorService(
    mockRepository()
  );

  await assert.rejects(
    () => service.getAvailableSlots(otherId),
    { statusCode: 404, code: 'TUTOR_NOT_FOUND' }
  );
});

// TEST 5: Student cannot create availability

test('Students cannot create tutor slots', async () => {
  const service = createTutorService(
    mockRepository()
  );

  await assert.rejects(
    () => service.createAvailability(
      { userId: otherId, role: 'student' },
      tutorId,
      futureDates()
    ),
    { statusCode: 403, code: 'FORBIDDEN' }
  );
});

// TEST 6: Tutor ownership

test('Tutor cannot modify another tutor', async () => {
  const service = createTutorService(
    mockRepository()
  );

  await assert.rejects(
    () => service.createAvailability(
      { userId: otherId, role: 'tutor' },
      tutorId,
      futureDates()
    ),
    { statusCode: 403, code: 'FORBIDDEN' }
  );
});

// TEST 7: Past availability

test('Past availability is rejected', async () => {
  const service = createTutorService(
    mockRepository()
  );

  const start = new Date(
    Date.now() - 86400000
  ).toISOString();

  const end = new Date(
    Date.now() - 82800000
  ).toISOString();

  await assert.rejects(
    () => service.createAvailability(
      { userId: ownerId, role: 'tutor' },
      tutorId,
      { startTime: start, endTime: end }
    ),
    { statusCode: 400, code: 'INVALID_START_TIME' }
  );
});

// TEST 8: Invalid time interval

test('End time before start time is rejected', async () => {
  const service = createTutorService(
    mockRepository()
  );

  const dates = futureDates();

  await assert.rejects(
    () => service.createAvailability(
      { userId: ownerId, role: 'tutor' },
      tutorId,
      {
        startTime: dates.endTime,
        endTime: dates.startTime
      }
    ),
    { statusCode: 400, code: 'INVALID_TIME_INTERVAL' }
  );
});

// TEST 9: Overlapping availability

test('Overlapping slots return 409', async () => {
  const repo = mockRepository();

  repo.createSlotIfNoOverlap =
    async () => null;

  const service = createTutorService(repo);

  await assert.rejects(
    () => service.createAvailability(
      { userId: ownerId, role: 'tutor' },
      tutorId,
      futureDates()
    ),
    { statusCode: 409, code: 'SLOT_OVERLAP' }
  );
});

// TEST 10: Successful slot creation

test('Tutor can create valid availability', async () => {
  const service = createTutorService(
    mockRepository()
  );

  const result = await service.createAvailability(
    { userId: ownerId, role: 'tutor' },
    tutorId,
    futureDates()
  );

  assert.equal(result.tutorId, tutorId);
  assert.ok(result.id);
  assert.ok(
    new Date(result.endTime) >
    new Date(result.startTime)
  );
});

test('Tutor listing exposes profile fields without internal ownership', async () => {
  const service = createTutorService(mockRepository());
  assert.deepEqual(await service.getAllTutors(), [{ id: tutorId, displayName: 'Test Tutor', bio: 'Calculus' }]);
});

test('Availability rejects invalid calendar dates, missing timezones and unknown fields', async () => {
  const service = createTutorService(mockRepository());
  const user = { userId: ownerId, role: 'tutor' as const };
  for (const startTime of ['2030-02-30T12:00:00Z', '2030-01-01T24:00:00Z', '2030-01-01T10:00:00', 'January 1, 2030Z']) {
    await assert.rejects(() => service.createAvailability(user, tutorId, {
      startTime, endTime: '2030-03-01T13:00:00Z',
    }), { statusCode: 400, code: 'INVALID_DATE' });
  }
  await assert.rejects(() => service.createAvailability(user, tutorId, {
    ...futureDates(), userId: otherId,
  }), { statusCode: 400, code: 'INVALID_REQUEST' });
});

test('Availability forwards verified ownership to the atomic repository insert', async () => {
  const repo = mockRepository();
  const create = repo.createSlotIfNoOverlap;
  let owner: string | undefined;
  repo.createSlotIfNoOverlap = async (id, start, end, ownerUserId) => {
    owner = ownerUserId;
    return create(id, start, end, ownerUserId);
  };
  await createTutorService(repo).createAvailability({ userId: ownerId, role: 'tutor' }, tutorId, futureDates());
  assert.equal(owner, ownerId);
});
