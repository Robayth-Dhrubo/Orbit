
/**
 * ORBIT Frontend API Client
 * Connects React to the real Express backend.
 */

// USER AND AUTHENTICATION TYPES

export type Role = 'student' | 'tutor';

export interface User {
  id: string;
  email: string;
  role: Role;
}

export interface AuthSession {
  user: User;
  token: string;
  tokenType: string;
  expiresIn: number;
}

// TUTOR TYPES

export interface Tutor {
  id: string;
  displayName: string;
  bio: string;
}

// AVAILABILITY SLOT TYPES

export interface Slot {
  id: string;
  tutorId: string;
  startTime: string;
  endTime: string;
}

// APPOINTMENT TYPES

export interface Appointment {
  appointmentId: string;
  slotId: string;
  topic: string;
  notes?: string;
  status: string;
}

// BOOKING RECEIPT

export interface BookingReceipt {
  appointmentId: string;
  slotId: string;
  status: string;
}

// API ERROR HANDLING

export class ApiError extends Error {
  public status: number;
  public code: string;

  constructor(
    status: number,
    code: string,
    message: string
  ) {
    super(message);

    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// GENERAL API REQUEST FUNCTION
// React /api requests are forwarded to
// the Express backend through the Vite proxy.

async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
    idempotencyKey?: string;
  } = {}
): Promise<T> {

  const headers: Record<string, string> = {};

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  if (options.idempotencyKey) {
    headers['Idempotency-Key'] =
      options.idempotencyKey;
  }

  let response: Response;

  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers,
      body:
        options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Cannot connect to the ORBIT backend.'
    );
  }

  // Handle successful responses without content
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();

  let data: any;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(
      response.status,
      'INVALID_RESPONSE',
      'The server returned an invalid response.'
    );
  }

  // Handle API errors
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error?.code ?? 'API_ERROR',
      data?.error?.message ??
        `Request failed (${response.status})`
    );
  }

  return data as T;
}

// ==========================================
// AUTHENTICATION
// ==========================================

// LOGIN

export function login(
  email: string,
  password: string
) {
  return request<AuthSession>('/auth/login', {
    method: 'POST',
    body: {
      email,
      password
    }
  });
}

// REGISTER STUDENT

export function registerStudent(
  email: string,
  password: string
) {
  return request<AuthSession>('/auth/register', {
    method: 'POST',
    body: {
      email,
      password,
      role: 'student'
    }
  });
}

// REGISTER TUTOR

export function registerTutor(
  email: string,
  password: string,
  displayName: string
) {
  return request<AuthSession>('/auth/register', {
    method: 'POST',
    body: {
      email,
      password,
      role: 'tutor',
      displayName
    }
  });
}

// ==========================================
// TUTOR ENDPOINTS
// ==========================================

// GET ALL TUTORS

export function getTutors() {
  return request<Tutor[]>('/tutors');
}

// GET AVAILABLE TUTOR SLOTS

export function getTutorSlots(
  tutorId: string
) {
  return request<Slot[]>(
    `/tutors/${encodeURIComponent(tutorId)}/slots`
  );
}

// CREATE TUTOR AVAILABILITY

export function createTutorSlot(
  tutorId: string,
  startTime: string,
  endTime: string,
  token: string
) {
  return request<Slot>(
    `/tutors/${encodeURIComponent(tutorId)}/slots`,
    {
      method: 'POST',
      token,
      body: {
        startTime,
        endTime
      }
    }
  );
}

// ==========================================
// APPOINTMENT ENDPOINTS
// ==========================================

// BOOK AN APPOINTMENT

export function bookAppointment(
  slotId: string,
  topic: string,
  notes: string,
  token: string,
  idempotencyKey: string
) {
  return request<BookingReceipt>(
    '/appointments',
    {
      method: 'POST',
      token,
      idempotencyKey,
      body: {
        slotId,
        topic,
        notes
      }
    }
  );
}

// GET MY APPOINTMENTS

export function getMyAppointments(
  token: string
) {
  return request<Appointment[]>(
    '/appointments',
    {
      token
    }
  );
}

// CANCEL AN APPOINTMENT

export function cancelAppointment(
  appointmentId: string,
  token: string
) {
  return request<void>(
    `/appointments/${encodeURIComponent(appointmentId)}`,
    {
      method: 'DELETE',
      token
    }
  );
}
