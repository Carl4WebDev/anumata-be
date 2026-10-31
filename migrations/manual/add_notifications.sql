-- Same as migration 20261031120000_add_notifications. Safe to re-run.
-- In-app notifications for therapists (e.g. "Maria finished the interview").

CREATE TABLE IF NOT EXISTS notifications (
  notification_id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  type varchar(32) NOT NULL,                 -- interview_finished | results_ready | analysis_failed
  title varchar(200) NOT NULL,
  message text,
  link varchar(255),                         -- frontend route to open, e.g. /sessions/12
  patient_id integer REFERENCES patients(patient_id) ON DELETE CASCADE,
  interview_link_id integer REFERENCES interview_links(interview_link_id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_created_at_index ON notifications (user_id, created_at);

-- One notification of each kind per interview, even if the upload is retried.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_once_per_interview ON notifications (interview_link_id, type)
  WHERE interview_link_id IS NOT NULL;
