
/**
 * ORBIT Appointment Service
 *
 * Assigned responsibilities:
 * - Validate appointment requests
 * - Enforce student permissions
 * - Retrieve the student's appointments
 * - Coordinate booking and cancellation
 *
 * Yousef provides atomic booking/cancellation.
 * Azmain provides PostgreSQL repositories.
 */

// Authenticated user from JWT context
export interface AuthenticatedUser {
  userId: string;
  role: 'student' | 'tutor';
}

// Appointment data
export interface Appointment {
  appointmentId: string;
  slotId: string;
  status: string;
  topic: string;
  notes?: string;
}

// Successful booking response
export interface BookingResult {
  appointmentId: string;
  slotId: string;
  status: string;
}

// Input passed to Yousef's booking operation
export interface BookingInput {
  studentId: string;
  slotId: string;
  topic: string;
  notes: string;
  idempotencyKey: string;
}

// Azmain's repository interface
export interface AppointmentRepository {
  findByStudentId(
    studentId: string
  ): Promise<Appointment[]>;
}

// Yousef's atomic booking/cancellation interface
export interface AtomicBookingService {

  /**
   * Must use PostgreSQL transactions.
   *
   * Must:
   * - Validate the slot exists and is future-dated
   * - Prevent double-booking
   * - Handle idempotent retries
   * - Persist confirmed appointments
   * - Return documented errors
   */
  bookAtomically(
    input: BookingInput
  ): Promise<BookingResult>;

  /**
   * Must perform ownership verification
   * and cancellation within a protected
   * transaction.
   *
   * Repeated cancellations must be safe.
   */
  cancelAtomically(
    appointmentId: string,
    studentId: string
  ): Promise<
    'cancelled' |
    'already_cancelled' |
    'not_found'
  >;
}

// Service error class
export class AppointmentServiceError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'AppointmentServiceError';
  }
}

// Validate UUID identifier
function validateId(
  value: unknown,
  field: string
): string {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (
    typeof value !== 'string' ||
    !uuidPattern.test(value)
  ) {
    throw new AppointmentServiceError(
      400,
      'INVALID_ID',
      `Invalid ${field}`
    );
  }

  return value;
}

// Ensure user is a student
function requireStudent(
  user: AuthenticatedUser
): void {
  if (user.role !== 'student') {
    throw new AppointmentServiceError(
      403,
      'FORBIDDEN',
      'Only students can manage appointments'
    );
  }
}

// Create service with injected dependencies
export function createAppointmentService(
  repository: AppointmentRepository,
  atomicBooking: AtomicBookingService
) {

  /**
   * POST /appointments
   */
  async function bookAppointment(
    user: AuthenticatedUser,
    data: unknown,
    idempotencyKey: string | undefined
  ): Promise<BookingResult> {

    // Step 1: Check student role
    requireStudent(user);

    // Step 2: Validate request body
    if (
      typeof data !== 'object' ||
      data === null ||
      Array.isArray(data)
    ) {
      throw new AppointmentServiceError(
        400,
        'INVALID_REQUEST',
        'Valid booking data is required'
      );
    }

    const body = data as Record<string, unknown>;

    // Step 3: Validate slot identifier
    const slotId = validateId(
      body.slotId,
      'slotId'
    );

    // Step 4: Validate topic
    if (
      typeof body.topic !== 'string' ||
      !body.topic.trim() ||
      body.topic.length > 120
    ) {
      throw new AppointmentServiceError(
        400,
        'INVALID_TOPIC',
        'A valid topic is required'
      );
    }

    // Step 5: Validate optional notes
    if (
      body.notes !== undefined &&
      (
        typeof body.notes !== 'string' ||
        body.notes.length > 1000
      )
    ) {
      throw new AppointmentServiceError(
        400,
        'INVALID_NOTES',
        'Notes must be a string of at most 1000 characters'
      );
    }

    // Step 6: Validate idempotency key
    if (
      typeof idempotencyKey !== 'string' ||
      !idempotencyKey.trim() ||
      idempotencyKey.length > 200
    ) {
      throw new AppointmentServiceError(
        400,
        'INVALID_IDEMPOTENCY_KEY',
        'A valid Idempotency-Key header is required'
      );
    }

    // Step 7: Derive student ID from JWT,
    // never from the request body.
    const studentId = user.userId;

    // Step 8: Call Yousef's atomic booking service
    const appointment =
      await atomicBooking.bookAtomically({
        studentId,
        slotId,
        topic: body.topic.trim(),
        notes:
          typeof body.notes === 'string'
            ? body.notes
            : '',
        idempotencyKey: idempotencyKey.trim()
      });

    // Step 9: Return booking response
    return appointment;
  }

  /**
   * GET /appointments
   */
  async function getMyAppointments(
    user: AuthenticatedUser
  ): Promise<Appointment[]> {

    // Step 1: Check student role
    requireStudent(user);

    // Step 2: Use trusted JWT identity
    const studentId = user.userId;

    // Step 3: Retrieve only this student's
    // appointments from PostgreSQL.
    return repository.findByStudentId(
      studentId
    );
  }

  /**
   * DELETE /appointments/:appointmentId
   */
  async function cancelAppointment(
    user: AuthenticatedUser,
    appointmentId: string
  ): Promise<void> {

    // Step 1: Check student role
    requireStudent(user);

    // Step 2: Validate appointment ID
    const id = validateId(
      appointmentId,
      'appointmentId'
    );

    // Step 3: Derive student ID from JWT
    const studentId = user.userId;

    // Step 4: Call protected cancellation
    const result =
      await atomicBooking.cancelAtomically(
        id,
        studentId
      );

    // Step 5: Reject unknown or
    // unauthorized appointments.
    // The atomic operation must return
    // not_found for non-owned records.
    if (result === 'not_found') {
      throw new AppointmentServiceError(
        404,
        'APPOINTMENT_NOT_FOUND',
        'Appointment not found'
      );
    }

    // Step 6: cancelled and already_cancelled
    // are both successful outcomes.
    return;
  }

  return {
    bookAppointment,
    getMyAppointments,
    cancelAppointment
  };
}
