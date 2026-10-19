import db from "../../../core/database/db.js";

export default class StandardizedQuestionRepo {
  async findAll() {
    const result = await db.query(
      `SELECT id, question_code, text, category, version, review_status,
              reviewer_name, reviewer_credentials, review_date, review_notes,
              is_active, created_at, updated_at
       FROM standardized_questions
       WHERE is_active = true
       ORDER BY question_code`,
    );
    return result.rows;
  }

  async findById(id) {
    const result = await db.query(
      `SELECT id, question_code, text, category, version, review_status,
              reviewer_name, reviewer_credentials, review_date, review_notes,
              is_active, created_at, updated_at
       FROM standardized_questions
       WHERE id = $1 AND is_active = true`,
      [id],
    );
    return result.rows[0] || null;
  }

  async findByCategory(category) {
    const result = await db.query(
      `SELECT id, question_code, text, category, version, review_status,
              reviewer_name, reviewer_credentials, review_date, review_notes,
              is_active, created_at, updated_at
       FROM standardized_questions
       WHERE category = $1 AND is_active = true
       ORDER BY question_code`,
      [category],
    );
    return result.rows;
  }

  async findByIds(ids) {
    if (!ids.length) return [];
    const result = await db.query(
      `SELECT id, question_code, text, category, version, review_status,
              reviewer_name, reviewer_credentials, review_date, review_notes,
              is_active, created_at, updated_at
       FROM standardized_questions
       WHERE id = ANY($1) AND is_active = true
       ORDER BY question_code`,
      [ids],
    );
    return result.rows;
  }
}