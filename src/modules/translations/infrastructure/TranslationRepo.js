import db from "../../../core/database/db.js";

// Best translation first: reviewed > draft > machine, and the therapist's own before the shared one.
const BEST_FIRST = `CASE source WHEN 'reviewed' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, (therapist_id IS NULL)`;

export default class TranslationRepo {
  /** The best translation of each text, for this therapist: rows of { source_text, lang, translated_text, source, own }. */
  async best(therapistId, texts, langs = ["tl", "ceb"]) {
    if (texts.length === 0) return [];
    const { rows } = await db.query(
      `SELECT DISTINCT ON (source_text, lang)
              source_text, lang, translated_text, source, (therapist_id IS NOT NULL) AS own
       FROM question_translations
       WHERE source_text = ANY($1) AND lang = ANY($2) AND (therapist_id = $3 OR therapist_id IS NULL)
       ORDER BY source_text, lang, ${BEST_FIRST}`,
      [texts, langs, therapistId],
    );
    return rows;
  }

  /** Keep an AI translation made during an interview (never replaces an existing one). */
  async saveMachine(therapistId, text, lang, translated) {
    await db.query(
      `INSERT INTO question_translations (therapist_id, source_text, lang, translated_text, source)
       VALUES ($1, $2, $3, $4, 'machine')
       ON CONFLICT (COALESCE(therapist_id, 0), lang, md5(source_text)) DO NOTHING`,
      [therapistId, text, lang, translated],
    );
  }

  /** The therapist's own reviewed translation (replaces their earlier one). */
  async saveReviewed(therapistId, text, lang, translated) {
    await db.query(
      `INSERT INTO question_translations (therapist_id, source_text, lang, translated_text, source)
       VALUES ($1, $2, $3, $4, 'reviewed')
       ON CONFLICT (COALESCE(therapist_id, 0), lang, md5(source_text))
       DO UPDATE SET translated_text = EXCLUDED.translated_text, source = 'reviewed', updated_at = NOW()`,
      [therapistId, text, lang, translated],
    );
  }

  /** Remove the therapist's own translation, so the shared or AI one is used again. */
  async removeOwn(therapistId, text, lang) {
    await db.query(
      `DELETE FROM question_translations WHERE therapist_id = $1 AND lang = $2 AND md5(source_text) = md5($3)`,
      [therapistId, lang, text],
    );
  }
}
