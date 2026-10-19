import db from "../../../core/database/db.js";

export default class CustomQuestionRepo {
  async create(data) {
    const result = await db.query(
      `INSERT INTO custom_questions (therapist_id, text, category)
       VALUES ($1, $2, $3)
       RETURNING id, therapist_id, text, category, is_active, created_at, updated_at`,
      [data.therapist_id, data.text, data.category || null],
    );
    return result.rows[0];
  }

  async findById(id) {
    const result = await db.query(
      `SELECT id, therapist_id, text, category, is_active, created_at, updated_at
       FROM custom_questions
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] || null;
  }

  async findByTherapistId(therapistId) {
    const result = await db.query(
      `SELECT id, therapist_id, text, category, is_active, created_at, updated_at
       FROM custom_questions
       WHERE therapist_id = $1 AND is_active = true
       ORDER BY created_at DESC`,
      [therapistId],
    );
    return result.rows;
  }

  async findByIds(ids) {
    if (!ids.length) return [];
    const result = await db.query(
      `SELECT id, therapist_id, text, category, is_active, created_at, updated_at
       FROM custom_questions
       WHERE id = ANY($1) AND is_active = true`,
      [ids],
    );
    return result.rows;
  }

  async update(id, data) {
    const setClauses = [];
    const params = [id];
    let paramIndex = 2;

    if (data.text !== undefined) {
      setClauses.push(`text = $${paramIndex++}`);
      params.push(data.text);
    }
    if (data.category !== undefined) {
      setClauses.push(`category = $${paramIndex++}`);
      params.push(data.category);
    }
    if (data.is_active !== undefined) {
      setClauses.push(`is_active = $${paramIndex++}`);
      params.push(data.is_active);
    }

    if (setClauses.length === 0) return this.findById(id);

    setClauses.push(`updated_at = NOW()`);

    const result = await db.query(
      `UPDATE custom_questions SET ${setClauses.join(", ")} WHERE id = $1
       RETURNING id, therapist_id, text, category, is_active, created_at, updated_at`,
      params,
    );
    return result.rows[0] || null;
  }

  async deactivate(id) {
    const result = await db.query(
      `UPDATE custom_questions SET is_active = false, updated_at = NOW() WHERE id = $1
       RETURNING id, therapist_id, text, category, is_active, created_at, updated_at`,
      [id],
    );
    return result.rows[0] || null;
  }

  async remove(id) {
    await db.query(`DELETE FROM custom_questions WHERE id = $1`, [id]);
    return { deleted: true };
  }
}