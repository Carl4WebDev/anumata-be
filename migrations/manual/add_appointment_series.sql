-- Same as migration 20261102120000_add_appointment_series. Safe to re-run.
-- Recurring appointments: sessions booked as one weekly series share a series_id.

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS series_id uuid;

CREATE INDEX IF NOT EXISTS appointments_series_id_index ON appointments (series_id)
  WHERE series_id IS NOT NULL;

-- Record it as applied, so `npm run migrate` won't run it again.
INSERT INTO pgmigrations (name, run_on)
SELECT '20261102120000_add_appointment_series', NOW()
WHERE to_regclass('public.pgmigrations') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM pgmigrations WHERE name = '20261102120000_add_appointment_series');
