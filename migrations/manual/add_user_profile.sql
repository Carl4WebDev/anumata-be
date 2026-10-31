-- Therapist profile fields
-- MANUAL ALTERNATIVE to migrations/20261025140000_add_user_profile.js
-- (npm run migrate). Idempotent — safe even if the JS migration already ran.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_image TEXT,
  ADD COLUMN IF NOT EXISTS phone VARCHAR(30),
  ADD COLUMN IF NOT EXISTS specialization VARCHAR(120),
  ADD COLUMN IF NOT EXISTS license_number VARCHAR(60),
  ADD COLUMN IF NOT EXISTS affiliation VARCHAR(120);
