-- Same as migration 20261103120000_add_patient_contacts_and_reminders. Safe to re-run.
-- Patient contacts for appointment reminders, and a log of reminders sent.

ALTER TABLE patients ADD COLUMN IF NOT EXISTS contact_number varchar(20);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS email varchar(255);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS reminder_consent boolean NOT NULL DEFAULT false;

-- One row per reminder sent, so nobody gets the same reminder twice.
CREATE TABLE IF NOT EXISTS appointment_reminders (
  reminder_id serial PRIMARY KEY,
  appointment_id integer NOT NULL REFERENCES appointments(appointment_id) ON DELETE CASCADE,
  kind varchar(20) NOT NULL,          -- e.g. 'day_before', 'hours_before'
  channel varchar(10) NOT NULL,       -- 'email' or 'sms'
  status varchar(10) NOT NULL,        -- 'sent' or 'failed'
  error text,
  sent_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (appointment_id, kind, channel)
);

-- Record it as applied, so `npm run migrate` won't run it again.
INSERT INTO pgmigrations (name, run_on)
SELECT '20261103120000_add_patient_contacts_and_reminders', NOW()
WHERE to_regclass('public.pgmigrations') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM pgmigrations WHERE name = '20261103120000_add_patient_contacts_and_reminders');
