import IPQuestionSetRepo from "../domain/IQuestionSetRepo.js";
import db from "../../../core/database/db.js";

export default class QuestionSetRepo extends IPQuestionSetRepo {
  async create(qs) {
    const result = await db.query(
      `INSERT INTO question_sets (therapist_id, name, description, questions)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING question_set_id, therapist_id, name, description, questions, created_at, updated_at`,
      [qs.therapist_id, qs.name, qs.description || "", JSON.stringify(qs.questions)],
    );

    return result.rows[0];
  }

  async findById(id) {
    const result = await db.query(
      `SELECT question_set_id, therapist_id, name, description, questions, created_at, updated_at
       FROM question_sets WHERE question_set_id = $1`,
      [id],
    );

    return result.rows[0] || null;
  }

  async findByTherapistId(therapistId) {
    const result = await db.query(
      `SELECT question_set_id, therapist_id, name, description, questions, created_at, updated_at
       FROM question_sets WHERE therapist_id = $1
       ORDER BY created_at DESC`,
      [therapistId],
    );

    return result.rows;
  }

  async update(id, data) {
    const setClauses = [];
    const params = [id];
    let paramIndex = 2;

    for (const [key, value] of Object.entries(data)) {
      if (key === "questions") {
        setClauses.push(`${key} = $${paramIndex}::jsonb`);
        params.push(JSON.stringify(value));
      } else {
        setClauses.push(`${key} = $${paramIndex}`);
        params.push(value);
      }
      paramIndex++;
    }

    setClauses.push(`updated_at = NOW()`);

    const result = await db.query(
      `UPDATE question_sets SET ${setClauses.join(", ")} WHERE question_set_id = $1
       RETURNING question_set_id, therapist_id, name, description, questions, created_at, updated_at`,
      params,
    );

    return result.rows[0];
  }

  async remove(id) {
    await db.query(`DELETE FROM question_sets WHERE question_set_id = $1`, [id]);
    return { deleted: true };
  }
}
