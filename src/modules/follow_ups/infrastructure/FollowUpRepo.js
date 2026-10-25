import IFollowUpRepo from "../domain/IFollowUpRepo.js";
import db from "../../../core/database/db.js";

export default class FollowUpRepo extends IFollowUpRepo {
  async create(data) {
    const result = await db.query(
      `INSERT INTO follow_ups (patient_id, therapist_id, session_id, recommended_date, appointment_time, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING follow_up_id, patient_id, therapist_id, session_id, recommended_date, appointment_time, reason, status, created_at, updated_at`,
      [data.patient_id, data.therapist_id, data.session_id, data.recommended_date, data.appointment_time, data.reason, data.status || "recommended"],
    );
    return result.rows[0];
  }

  async findById(id) {
    const result = await db.query(
      `SELECT fu.*,
              TRIM(p.f_name || ' ' || COALESCE(p.m_name || ' ', '') || p.l_name) as patient_name
       FROM follow_ups fu
       JOIN patients p ON p.patient_id = fu.patient_id
       WHERE fu.follow_up_id = $1`,
      [id],
    );
    return result.rows[0] || null;
  }

  async findByPatientId(patientId, therapistId) {
    const result = await db.query(
      `SELECT fu.*
       FROM follow_ups fu
       WHERE fu.patient_id = $1 AND fu.therapist_id = $2
       ORDER BY fu.recommended_date DESC`,
      [patientId, therapistId],
    );
    return result.rows;
  }

  async findByTherapistId(therapistId, { limit = 50, offset = 0, status } = {}) {
    const params = [therapistId];
    let whereClause = "WHERE fu.therapist_id = $1";

    if (status) {
      params.push(status);
      whereClause += ` AND fu.status = $${params.length}`;
    }

    params.push(limit);
    const limitParam = params.length;
    params.push(offset);
    const offsetParam = params.length;

    const result = await db.query(
      `SELECT fu.*,
              TRIM(p.f_name || ' ' || COALESCE(p.m_name || ' ', '') || p.l_name) as patient_name
       FROM follow_ups fu
       JOIN patients p ON p.patient_id = fu.patient_id
       ${whereClause}
       ORDER BY fu.recommended_date ASC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    );

    return result.rows;
  }

  async findUpcoming(therapistId, limit = 10) {
    const result = await db.query(
      `SELECT fu.*,
              TRIM(p.f_name || ' ' || COALESCE(p.m_name || ' ', '') || p.l_name) as patient_name
       FROM follow_ups fu
       JOIN patients p ON p.patient_id = fu.patient_id
       WHERE fu.therapist_id = $1
         AND fu.status IN ('recommended', 'scheduled')
         AND fu.recommended_date >= CURRENT_DATE
       ORDER BY fu.recommended_date ASC
       LIMIT $2`,
      [therapistId, limit],
    );
    return result.rows;
  }

  async findDueToday(therapistId) {
    const result = await db.query(
      `SELECT fu.*,
              TRIM(p.f_name || ' ' || COALESCE(p.m_name || ' ', '') || p.l_name) as patient_name
       FROM follow_ups fu
       JOIN patients p ON p.patient_id = fu.patient_id
       WHERE fu.therapist_id = $1
         AND fu.status IN ('recommended', 'scheduled')
         AND fu.recommended_date = CURRENT_DATE
       ORDER BY fu.appointment_time ASC NULLS LAST`,
      [therapistId],
    );
    return result.rows;
  }

  async findOverdue(therapistId) {
    const result = await db.query(
      `SELECT fu.*,
              TRIM(p.f_name || ' ' || COALESCE(p.m_name || ' ', '') || p.l_name) as patient_name
       FROM follow_ups fu
       JOIN patients p ON p.patient_id = fu.patient_id
       WHERE fu.therapist_id = $1
         AND fu.status IN ('recommended', 'scheduled')
         AND fu.recommended_date < CURRENT_DATE
       ORDER BY fu.recommended_date ASC`,
      [therapistId],
    );
    return result.rows;
  }

  async update(id, data) {
    const setClauses = [];
    const params = [id];
    let paramIndex = 2;

    for (const [key, value] of Object.entries(data)) {
      setClauses.push(`${key} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }

    setClauses.push(`updated_at = NOW()`);

    const result = await db.query(
      `UPDATE follow_ups SET ${setClauses.join(", ")} WHERE follow_up_id = $1
       RETURNING follow_up_id, patient_id, therapist_id, session_id, recommended_date, appointment_time, reason, status, created_at, updated_at`,
      params,
    );

    return result.rows[0];
  }

  async remove(id) {
    await db.query(`DELETE FROM follow_ups WHERE follow_up_id = $1`, [id]);
    return { deleted: true };
  }

  async countByStatus(therapistId) {
    const result = await db.query(
      `SELECT
        COALESCE(SUM(CASE WHEN status IN ('recommended', 'scheduled') AND recommended_date > CURRENT_DATE THEN 1 ELSE 0 END), 0)::int as upcoming,
        COALESCE(SUM(CASE WHEN status IN ('recommended', 'scheduled') AND recommended_date = CURRENT_DATE THEN 1 ELSE 0 END), 0)::int as due_today,
        COALESCE(SUM(CASE WHEN status IN ('recommended', 'scheduled') AND recommended_date < CURRENT_DATE THEN 1 ELSE 0 END), 0)::int as overdue
       FROM follow_ups
       WHERE therapist_id = $1`,
      [therapistId],
    );
    return result.rows[0];
  }
}