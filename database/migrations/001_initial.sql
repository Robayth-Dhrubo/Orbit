-- Core milestone schema. The migration runner applies this file in one transaction.
-- btree_gist lets PostgreSQL reject overlapping slots for the same tutor, even
-- when two API processes publish availability at the same time.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('student', 'tutor')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email)) AND email <> ''),
  CONSTRAINT users_email_key UNIQUE (email)
);

CREATE TABLE tutor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
  bio text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE availability_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES tutor_profiles(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT availability_slots_ends_after_starts CHECK (ends_at > starts_at),
  -- [start, end) permits adjacent slots (10:00-11:00 and 11:00-12:00).
  CONSTRAINT availability_slots_no_overlap EXCLUDE USING gist (
    tutor_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
);

CREATE INDEX availability_slots_tutor_start_idx
  ON availability_slots (tutor_id, starts_at);

CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES availability_slots(id),
  student_id uuid NOT NULL REFERENCES users(id),
  topic text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Keep this exact name: the booking service maps its violation to HTTP 409.
-- Cancelled rows remain as history and do not prevent a later booking.
CREATE UNIQUE INDEX one_confirmed_appointment_per_slot
  ON appointments (slot_id) WHERE status = 'confirmed';

CREATE INDEX appointments_student_created_idx
  ON appointments (student_id, created_at);

CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer NOT NULL CHECK (response_status BETWEEN 100 AND 599),
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT idempotency_records_user_operation_key_unique
    UNIQUE (user_id, operation, idempotency_key)
);
