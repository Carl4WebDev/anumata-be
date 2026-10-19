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
      `SELECT qs.question_set_id, qs.therapist_id, qs.name, qs.description, qs.questions, qs.source_type,
              qs.created_at, qs.updated_at,
              COALESCE(items.item_count, 0)::int AS item_count
       FROM question_sets qs
       LEFT JOIN (
         SELECT question_set_id, COUNT(*)::int AS item_count
         FROM question_set_items GROUP BY question_set_id
       ) items ON items.question_set_id = qs.question_set_id
       WHERE qs.question_set_id = $1`,
      [id],
    );

    return result.rows[0] || null;
  }

  async findByTherapistId(therapistId) {
    const result = await db.query(
      `SELECT qs.question_set_id, qs.therapist_id, qs.name, qs.description, qs.questions, qs.source_type,
              qs.created_at, qs.updated_at,
              COALESCE(items.item_count, 0)::int AS item_count
       FROM question_sets qs
       LEFT JOIN (
         SELECT question_set_id, COUNT(*)::int AS item_count
         FROM question_set_items GROUP BY question_set_id
       ) items ON items.question_set_id = qs.question_set_id
       WHERE qs.therapist_id = $1
       ORDER BY qs.created_at DESC`,
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

  async createWithItems(qs, items) {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");

      const qsResult = await client.query(
        `INSERT INTO question_sets (therapist_id, name, description, questions, source_type)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         RETURNING question_set_id, therapist_id, name, description, questions, source_type, created_at, updated_at`,
        [qs.therapist_id, qs.name, qs.description || "", JSON.stringify([]), qs.source_type || "mixed"],
      );
      const questionSet = qsResult.rows[0];

      if (items && items.length > 0) {
        for (const item of items) {
          await client.query(
            `INSERT INTO question_set_items (question_set_id, source_type, standardized_question_id, custom_question_id, question_text_snapshot, display_order)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              questionSet.question_set_id,
              item.source_type,
              item.standardized_question_id || null,
              item.custom_question_id || null,
              item.question_text_snapshot,
              item.display_order,
            ],
          );
        }
      }

      await client.query("COMMIT");
      return questionSet;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findItemsBySetId(setId) {
    const result = await db.query(
      `SELECT qi.id, qi.source_type, qi.standardized_question_id, qi.custom_question_id,
              qi.question_text_snapshot, qi.display_order,
              sq.question_code, sq.category AS sq_category, sq.version AS sq_version, sq.review_status,
              cq.category AS cq_category
       FROM question_set_items qi
       LEFT JOIN standardized_questions sq ON qi.standardized_question_id = sq.id
       LEFT JOIN custom_questions cq ON qi.custom_question_id = cq.id
       WHERE qi.question_set_id = $1
       ORDER BY qi.display_order`,
      [setId],
    );
    return result.rows;
  }
}
