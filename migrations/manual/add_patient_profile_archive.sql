-- Patient profile image + archive
-- MANUAL ALTERNATIVE to migrations/20261025120000_add_patient_profile_archive.js
-- (npm run migrate). Idempotent — safe even if the JS migration already ran.
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS profile_image TEXT,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_patients_therapist_archived
  ON patients (therapist_id, is_archived);
