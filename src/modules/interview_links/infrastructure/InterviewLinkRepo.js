import IInterviewLinkRepo from "../domain/IInterviewLinkRepo.js";
import db from "../../../core/database/db.js";

export default class InterviewLinkRepo extends IInterviewLinkRepo {
  async create(link) {
    const result = await db.query(
      `INSERT INTO interview_links (therapist_id, patient_id, question_set_id, token, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING interview_link_id, therapist_id, patient_id, question_set_id, token, status, created_at`,
      [link.therapist_id, link.patient_id, link.question_set_id, link.token, link.status],
    );

    return result.rows[0];
  }

  async findById(id) {
    const result = await db.query(
      `SELECT il.*, p.full_name as patient_name, p.age as patient_age, p.gender as patient_gender,
              qs.name as question_set_name, qs.questions
       FROM interview_links il
       JOIN patients p ON p.patient_id = il.patient_id
       JOIN question_sets qs ON qs.question_set_id = il.question_set_id
       WHERE il.interview_link_id = $1`,
      [id],
    );

    return result.rows[0] || null;
  }

  async findByToken(token) {
    const result = await db.query(
      `SELECT il.*, p.full_name as patient_name, p.age as patient_age, p.gender as patient_gender,
              qs.name as question_set_name, qs.questions
       FROM interview_links il
       JOIN patients p ON p.patient_id = il.patient_id
       JOIN question_sets qs ON qs.question_set_id = il.question_set_id
       WHERE il.token = $1`,
      [token],
    );

    return result.rows[0] || null;
  }

  async findByTherapistId(therapistId, { status, limit = 20, offset = 0 } = {}) {
    const params = [therapistId];
    let whereClause = "WHERE il.therapist_id = $1";

    if (status) {
      params.push(status);
      whereClause += ` AND il.status = $${params.length}`;
    }

    params.push(limit);
    const limitParam = params.length;
    params.push(offset);
    const offsetParam = params.length;

    const countParams = [therapistId];
    let countWhere = "WHERE il.therapist_id = $1";
    if (status) {
      countParams.push(status);
      countWhere += ` AND il.status = $${countParams.length}`;
    }

    const [links, countResult] = await Promise.all([
      db.query(
        `SELECT il.interview_link_id, il.token, il.status, il.created_at,
                p.patient_id, p.full_name as patient_name,
                qs.question_set_id, qs.name as question_set_name
         FROM interview_links il
         JOIN patients p ON p.patient_id = il.patient_id
         JOIN question_sets qs ON qs.question_set_id = il.question_set_id
         ${whereClause}
         ORDER BY il.created_at DESC
         LIMIT $${limitParam} OFFSET $${offsetParam}`,
        params,
      ),
      db.query(
        `SELECT COUNT(*) as total FROM interview_links il ${countWhere}`,
        countParams,
      ),
    ]);

    return {
      links: links.rows,
      total: parseInt(countResult.rows[0].total),
      page: Math.floor(offset / limit) + 1,
      limit,
    };
  }

  async updateStatus(id, status) {
    const result = await db.query(
      `UPDATE interview_links SET status = $2, updated_at = NOW()
       WHERE interview_link_id = $1
       RETURNING interview_link_id, therapist_id, patient_id, question_set_id, token, status, created_at, updated_at`,
      [id, status],
    );

    return result.rows[0];
  }

  async remove(id) {
    await db.query(`DELETE FROM interview_links WHERE interview_link_id = $1`, [id]);
    return { deleted: true };
  }
}
