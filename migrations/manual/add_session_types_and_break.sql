-- Same as migration 20261102140000_add_session_types_and_break. Safe to re-run.
-- Therapist-defined session types (each with its own length) and a break after each session.

CREATE TABLE IF NOT EXISTS session_types (
  session_type_id serial PRIMARY KEY,
  therapist_id integer NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  name varchar(60) NOT NULL,
  duration_minutes integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,       -- removed types stay, so past appointments keep their name
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT session_types_duration_check CHECK (duration_minutes BETWEEN 15 AND 240)
);
CREATE INDEX IF NOT EXISTS session_types_therapist_id_index ON session_types (therapist_id);
CREATE UNIQUE INDEX IF NOT EXISTS session_types_unique_active_name
  ON session_types (therapist_id, lower(name)) WHERE is_active;

-- The type an appointment was booked as, and its name at booking time.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS session_type_id integer REFERENCES session_types(session_type_id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS session_type varchar(60);

-- Free time kept after every appointment.
ALTER TABLE appointment_settings ADD COLUMN IF NOT EXISTS break_minutes integer NOT NULL DEFAULT 0;
DO $$
BEGIN
  ALTER TABLE appointment_settings
    ADD CONSTRAINT appointment_settings_break_check CHECK (break_minutes BETWEEN 0 AND 60);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Record it as applied, so `npm run migrate` won't run it again.
INSERT INTO pgmigrations (name, run_on)
SELECT '20261102140000_add_session_types_and_break', NOW()
WHERE to_regclass('public.pgmigrations') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM pgmigrations WHERE name = '20261102140000_add_session_types_and_break');
