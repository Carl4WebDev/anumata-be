-- Same as migration 20261030140000_add_user_consent. Safe to re-run.
-- Records which version of the user agreement a therapist accepted, and when.
-- Existing accounts stay NULL (created before the agreement existed).

ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version varchar(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
