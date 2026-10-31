-- Records migrations that were applied by pasting SQL by hand, so that
-- `npm run migrate` does not try to run them a second time.
--
-- Each row is only recorded if its change is really present in this
-- database (the "applied" check), so it is safe to run at any time and
-- safe to re-run. Rows whose change is missing are skipped — apply that
-- SQL first, then run this file again.

INSERT INTO pgmigrations (name, run_on)
SELECT m.name, NOW()
FROM (
  VALUES
    (1, '20261018150000_add_standardized_questions_q27_q58',
        EXISTS (SELECT 1 FROM standardized_questions WHERE question_code = 'SAF_4')),
    (2, '20261020120000_add_follow_ups',
        to_regclass('public.follow_ups') IS NOT NULL),
    (3, '20261025120000_add_patient_profile_archive',
        EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'patients' AND column_name = 'is_archived')),
    (4, '20261025140000_add_user_profile',
        EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'specialization')),
    (5, '20261026120000_add_appointments',
        EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'appointments' AND column_name = 'follow_up_id')),
    (6, '20261026130000_add_appointment_availability',
        to_regclass('public.appointment_settings') IS NOT NULL),
    (7, '20261030140000_add_user_consent',
        EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'terms_accepted_at')),
    (8, '20261031120000_add_notifications',
        to_regclass('public.notifications') IS NOT NULL)
) AS m(ord, name, applied)
WHERE m.applied
  AND NOT EXISTS (SELECT 1 FROM pgmigrations p WHERE p.name = m.name)
ORDER BY m.ord;

-- Shows what is recorded now.
SELECT id, name, run_on FROM pgmigrations ORDER BY id;
