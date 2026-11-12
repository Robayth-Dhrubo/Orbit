
/**
 * ORBIT Tutor Service
 *
 * Handles tutor-related business logic.
 *
 * Database operations will be provided
 * by Azmain's repository implementation.
 *
 * Authentication identity will come
 * from Robayth's JWT middleware.
 */

// Authenticated user information
export interface AuthenticatedUser {
  userId: string;
  role: 'student' | 'tutor';
}

// Tutor information
export interface Tutor {
  id: string;
  userId: string;
  displayName: string;
  bio: string;
}

// Availability information
export interface AvailabilitySlot {
  id: string;
  tutorId: string;
  startTime: string;
  endTime: string;
}

// Repository interface
// Azmain's functions will be connected later.
export interface TutorRepository {
  findAllTutors(): Promise<Omit<Tutor, 'userId'>[]>;

  findTutorById(
    tutorId: string
  ): Promise<Tutor | null>;

  findAvailableSlots(
    tutorId: string
  ): Promise<AvailabilitySlot[]>;

  /**
   * Must atomically:
   * 1. Lock the tutor's schedule.
   * 2. Check overlapping intervals.
   * 3. Insert the new slot if no overlap.
   *
   * Return null if an overlap exists.
   */
  createSlotIfNoOverlap(
    tutorId: string,
    startTime: Date,
    endTime: Date,
    ownerUserId: string
  ): Promise<AvailabilitySlot | null>;
}

// Consistent service errors
export class TutorServiceError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'TutorServiceError';
  }
}

// Validate UUID format
function validateId(id: string): void {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(id)) {
    throw new TutorServiceError(
      400,
      'INVALID_TUTOR_ID',
      'Invalid tutor identifier'
    );
  }
}

// Validate date and timezone
function parseDate(
  value: unknown,
  field: string
): Date {
  const match = typeof value === 'string'
    ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/i.exec(value)
    : null;
  if (!match) {
    throw new TutorServiceError(400, 'INVALID_DATE', `${field} must be an ISO date with timezone`);
  }
  const [, y, m, d, h, min, sec, zone] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const parsed = new Date(value as string);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1] ||
      Number(h) > 23 || Number(min) > 59 || Number(sec) > 59 ||
      (zone.toUpperCase() !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59)) ||
      Number.isNaN(parsed.getTime())) {
    throw new TutorServiceError(400, 'INVALID_DATE', `Invalid ${field}`);
  }

  return parsed;
}

// Create service with injected repository
export function createTutorService(
  repository: TutorRepository
) {

  /**
   * GET /tutors
   * Retrieve all tutors.
   */
  async function getAllTutors() {
    const tutors = await repository.findAllTutors();
    return tutors.map(({ id, displayName, bio }) => ({ id, displayName, bio }));
  }

  /**
   * GET /tutors/:tutorId/slots
   * Retrieve a tutor's available slots.
   */
  async function getAvailableSlots(
    tutorId: string
  ) {
    validateId(tutorId);

    const tutor =
      await repository.findTutorById(tutorId);

    if (!tutor) {
      throw new TutorServiceError(
        404,
        'TUTOR_NOT_FOUND',
        'Tutor not found'
      );
    }

    // Repository must exclude past slots
    // and currently booked slots.
    return repository.findAvailableSlots(
      tutorId
    );
  }

  /**
   * POST /tutors/:tutorId/slots
   * Create a tutor availability slot.
   */
  async function createAvailability(
    user: AuthenticatedUser,
    tutorId: string,
    data: unknown
  ) {

    // Step 1: Only tutors can create slots
    if (user.role !== 'tutor') {
      throw new TutorServiceError(
        403,
        'FORBIDDEN',
        'Only tutors can create availability'
      );
    }

    // Step 2: Validate tutor identifier
    validateId(tutorId);

    // Step 3: Check tutor exists
    const tutor =
      await repository.findTutorById(tutorId);

    if (!tutor) {
      throw new TutorServiceError(
        404,
        'TUTOR_NOT_FOUND',
        'Tutor not found'
      );
    }

    // Step 4: Check ownership
    if (tutor.userId !== user.userId) {
      throw new TutorServiceError(
        403,
        'FORBIDDEN',
        'You can only manage your own availability'
      );
    }

    // Step 5: Validate request body
    if (
      typeof data !== 'object' ||
      data === null ||
      Array.isArray(data)
    ) {
      throw new TutorServiceError(
        400,
        'INVALID_REQUEST',
        'A valid request body is required'
      );
    }

    const body = data as Record<string, unknown>;
    if (Object.keys(body).some(key => !['startTime', 'endTime'].includes(key))) {
      throw new TutorServiceError(400, 'INVALID_REQUEST', 'Only startTime and endTime are accepted');
    }

    const startTime = parseDate(
      body.startTime,
      'startTime'
    );

    const endTime = parseDate(
      body.endTime,
      'endTime'
    );

    // Step 6: Reject past slots
    if (startTime.getTime() <= Date.now()) {
      throw new TutorServiceError(
        400,
        'INVALID_START_TIME',
        'Availability must start in the future'
      );
    }

    // Step 7: Validate interval
    if (endTime <= startTime) {
      throw new TutorServiceError(
        400,
        'INVALID_TIME_INTERVAL',
        'End time must be after start time'
      );
    }

    // Step 8: Atomically check overlaps
    // and create the availability slot
    const newSlot =
      await repository.createSlotIfNoOverlap(
        tutorId,
        startTime,
        endTime,
        user.userId
      );

    if (!newSlot) {
      throw new TutorServiceError(
        409,
        'SLOT_OVERLAP',
        'Tutor already has overlapping availability'
      );
    }

    // Step 9: Return created slot
    return newSlot;
  }

  return {
    getAllTutors,
    getAvailableSlots,
    createAvailability
  };
}
