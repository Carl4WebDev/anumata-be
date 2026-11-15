-- Same as migration 20261115120000_add_interview_messages. Safe to re-run.
-- What the therapist and patient said to each other during a live interview
-- (the therapist stepping in), so the session report can show it.

CREATE TABLE IF NOT EXISTS interview_messages (
  message_id serial PRIMARY KEY,
  interview_link_id integer NOT NULL REFERENCES interview_links(interview_link_id) ON DELETE CASCADE,
  sender varchar(10) NOT NULL CHECK (sender IN ('therapist', 'patient')),
  -- 'message': text · 'pause' / 'resume': the therapist paused or resumed the questions
  kind varchar(10) NOT NULL DEFAULT 'message' CHECK (kind IN ('message', 'pause', 'resume')),
  body text CHECK (body IS NULL OR char_length(body) <= 500),
  -- Which question the patient was on (0-based), if any.
  question_index integer,
  -- When the patient's screen showed it (therapist messages only).
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS interview_messages_by_link
  ON interview_messages (interview_link_id, created_at);

-- Record it as applied, so `npm run migrate` won't run it again.
INSERT INTO pgmigrations (name, run_on)
SELECT '20261115120000_add_interview_messages', NOW()
WHERE to_regclass('public.pgmigrations') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM pgmigrations WHERE name = '20261115120000_add_interview_messages');
