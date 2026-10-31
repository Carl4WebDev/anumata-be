-- Links appointments to follow-ups, for databases that already ran
-- appointments_schema.sql before this column existed. Safe to re-run.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS follow_up_id integer REFERENCES follow_ups(follow_up_id) ON DELETE SET NULL;

-- A follow-up can have at most one scheduled appointment at a time.
CREATE UNIQUE INDEX IF NOT EXISTS appointments_one_scheduled_per_follow_up ON appointments (follow_up_id)
  WHERE status = 'scheduled' AND follow_up_id IS NOT NULL;
