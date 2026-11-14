-- Same as migration 20261114120000_add_question_translations. Safe to re-run.
-- Saved Tagalog / Bisaya translations of interview questions, keyed by the
-- English question text, so the interview room can use them instantly.

CREATE TABLE IF NOT EXISTS question_translations (
  translation_id serial PRIMARY KEY,
  -- NULL: shared by everyone (e.g. the standardized questions' translations).
  -- A therapist's own translation of the same text takes precedence for them.
  therapist_id integer REFERENCES users(user_id) ON DELETE CASCADE,
  source_text text NOT NULL,              -- the English question, exactly as asked
  lang varchar(3) NOT NULL CHECK (lang IN ('tl', 'ceb')),
  translated_text text NOT NULL,
  -- 'reviewed': checked by a person · 'draft': prepared, not yet reviewed by a native speaker
  -- 'machine': made by the AI translator during an interview
  source varchar(10) NOT NULL DEFAULT 'reviewed' CHECK (source IN ('reviewed', 'draft', 'machine')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- One translation per text and language, per therapist (or shared).
CREATE UNIQUE INDEX IF NOT EXISTS question_translations_unique
  ON question_translations (COALESCE(therapist_id, 0), lang, md5(source_text));

-- Record it as applied, so `npm run migrate` won't run it again.
INSERT INTO pgmigrations (name, run_on)
SELECT '20261114120000_add_question_translations', NOW()
WHERE to_regclass('public.pgmigrations') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM pgmigrations WHERE name = '20261114120000_add_question_translations');
