-- Appointment scheduling schema (therapist-only booking).
-- Same result as migrations 20261026120000_add_appointments and
-- 20261026130000_add_appointment_availability.
--
-- WARNING: the DROP statements delete any existing appointment data.
-- Run after the follow_ups / patients / users tables exist.

BEGIN;

DROP TABLE IF EXISTS appointment_events;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS appointment_settings;
DROP TABLE IF EXISTS therapist_unavailable;
DROP TABLE IF EXISTS therapist_availability;

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Weekly working hours, in therapist wall-clock time (Asia/Manila).
CREATE TABLE therapist_availability (
  availability_id serial PRIMARY KEY,
  therapist_id integer NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  weekday smallint NOT NULL,                 -- 0 = Monday ... 6 = Sunday
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT therapist_availability_weekday_check CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT therapist_availability_time_check CHECK (end_time > start_time)
);

-- One-off blocked periods (leave, holidays, meetings).
CREATE TABLE therapist_unavailable (
  unavailable_id serial PRIMARY KEY,
  therapist_id integer NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  reason varchar(255),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT therapist_unavailable_time_check CHECK (end_at > start_at)
);

-- Per-therapist settings; created automatically on first use.
CREATE TABLE appointment_settings (
  therapist_id integer PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  slot_minutes integer NOT NULL DEFAULT 60,  -- session length
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT appointment_settings_slot_check CHECK (slot_minutes BETWEEN 15 AND 240)
);

CREATE TABLE appointments (
  appointment_id serial PRIMARY KEY,
  therapist_id integer NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  patient_id integer NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  -- Follow-up recommendation this appointment fulfils (drives its status).
  follow_up_id integer REFERENCES follow_ups(follow_up_id) ON DELETE SET NULL,
  status varchar(16) NOT NULL DEFAULT 'scheduled',  -- scheduled | completed | no_show | cancelled
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  reason varchar(255),
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT appointments_status_check CHECK (status IN ('scheduled', 'completed', 'no_show', 'cancelled')),
  CONSTRAINT appointments_time_check CHECK (end_at > start_at),
  -- No two scheduled appointments for the same therapist may overlap.
  CONSTRAINT appointments_no_overlap EXCLUDE USING gist (
    therapist_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status = 'scheduled')
);

-- History of what happened to each appointment.
CREATE TABLE appointment_events (
  event_id serial PRIMARY KEY,
  appointment_id integer NOT NULL REFERENCES appointments(appointment_id) ON DELETE CASCADE,
  action varchar(16) NOT NULL,               -- booked | rescheduled | updated | cancelled | completed | no_show
  detail text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX therapist_availability_therapist_id_idx ON therapist_availability (therapist_id);
CREATE INDEX therapist_unavailable_therapist_id_idx ON therapist_unavailable (therapist_id);
CREATE INDEX appointments_therapist_id_start_at_index ON appointments (therapist_id, start_at);
CREATE INDEX appointments_patient_id_index ON appointments (patient_id);
-- A follow-up can have at most one scheduled appointment at a time.
CREATE UNIQUE INDEX appointments_one_scheduled_per_follow_up ON appointments (follow_up_id)
  WHERE status = 'scheduled' AND follow_up_id IS NOT NULL;
CREATE INDEX appointment_events_appointment_id_index ON appointment_events (appointment_id);

COMMIT;
