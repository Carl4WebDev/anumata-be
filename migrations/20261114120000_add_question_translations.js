export const shorthands = undefined;

/** Saved Tagalog / Bisaya translations of interview questions. Same as migrations/manual/add_question_translations.sql. */
export async function up(pgm) {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS question_translations (
      translation_id serial PRIMARY KEY,
      therapist_id integer REFERENCES users(user_id) ON DELETE CASCADE,
      source_text text NOT NULL,
      lang varchar(3) NOT NULL CHECK (lang IN ('tl', 'ceb')),
      translated_text text NOT NULL,
      source varchar(10) NOT NULL DEFAULT 'reviewed' CHECK (source IN ('reviewed', 'draft', 'machine')),
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS question_translations_unique
      ON question_translations (COALESCE(therapist_id, 0), lang, md5(source_text));
  `);
}

export async function down(pgm) {
  pgm.sql("DROP TABLE IF EXISTS question_translations");
}
