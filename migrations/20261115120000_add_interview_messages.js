export const shorthands = undefined;

/** Messages between therapist and patient during a live interview. Same as migrations/manual/add_interview_messages.sql. */
export async function up(pgm) {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS interview_messages (
      message_id serial PRIMARY KEY,
      interview_link_id integer NOT NULL REFERENCES interview_links(interview_link_id) ON DELETE CASCADE,
      sender varchar(10) NOT NULL CHECK (sender IN ('therapist', 'patient')),
      kind varchar(10) NOT NULL DEFAULT 'message' CHECK (kind IN ('message', 'pause', 'resume')),
      body text CHECK (body IS NULL OR char_length(body) <= 500),
      question_index integer,
      seen_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS interview_messages_by_link
      ON interview_messages (interview_link_id, created_at);
  `);
}

export async function down(pgm) {
  pgm.sql("DROP TABLE IF EXISTS interview_messages");
}
