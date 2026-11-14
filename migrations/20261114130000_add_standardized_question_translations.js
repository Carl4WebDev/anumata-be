import { readFileSync } from "fs";

export const shorthands = undefined;

const MANUAL_SQL = new URL("./manual/add_standardized_question_translations.sql", import.meta.url);

/**
 * Draft Tagalog / Bisaya translations of the standardized questions (shared, marked 'draft').
 * Runs the same SQL as migrations/manual/add_standardized_question_translations.sql,
 * without its last step (recording itself in pgmigrations — the migration runner does that).
 */
export async function up(pgm) {
  const sql = readFileSync(MANUAL_SQL, "utf8").split("-- Record it as applied")[0];
  pgm.sql(sql);
}

export async function down(pgm) {
  pgm.sql("DELETE FROM question_translations WHERE therapist_id IS NULL AND source = 'draft'");
}
