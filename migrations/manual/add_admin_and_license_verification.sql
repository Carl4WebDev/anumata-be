-- Same as migration 20261113120000_add_admin_and_license_verification. Safe to re-run.
-- Admin role, PRC license verification and account deactivation.

-- 'THERAPIST' or 'ADMIN'. Admins are made by hand (see the UPDATE at the bottom).
ALTER TABLE users ADD COLUMN IF NOT EXISTS role varchar(20) NOT NULL DEFAULT 'THERAPIST';

-- PRC license: profession, the name exactly as on the PRC ID (license_number already exists).
ALTER TABLE users ADD COLUMN IF NOT EXISTS profession varchar(40);
ALTER TABLE users ADD COLUMN IF NOT EXISTS license_name varchar(150);

-- 'pending' | 'verified' | 'not_matched'. Existing therapists start as pending.
ALTER TABLE users ADD COLUMN IF NOT EXISTS license_status varchar(20) NOT NULL DEFAULT 'pending';
ALTER TABLE users ADD COLUMN IF NOT EXISTS license_note text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS license_checked_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS license_checked_by integer REFERENCES users(user_id) ON DELETE SET NULL;

-- Deactivated accounts can't log in; their patients' data is kept.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

-- Every admin action, so it can be traced (who did what to which account, when).
CREATE TABLE IF NOT EXISTS admin_actions (
  action_id serial PRIMARY KEY,
  admin_id integer REFERENCES users(user_id) ON DELETE SET NULL,
  target_user_id integer NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  action varchar(30) NOT NULL,        -- 'license_verified' | 'license_not_matched' | 'deactivated' | 'reactivated'
  note text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_actions_target_idx ON admin_actions (target_user_id, created_at);

-- Record it as applied, so `npm run migrate` won't run it again.
INSERT INTO pgmigrations (name, run_on)
SELECT '20261113120000_add_admin_and_license_verification', NOW()
WHERE to_regclass('public.pgmigrations') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM pgmigrations WHERE name = '20261113120000_add_admin_and_license_verification');

-- Make YOUR admin account (register it first in the app, then put its email here):
-- UPDATE users SET role = 'ADMIN' WHERE email = 'your-admin-email@example.com';
