import ISessionRepo from "../domain/ISessionRepo.js";
import db from "../../../core/database/db.js";

export default class SessionRepo extends ISessionRepo {
  async create(session) {
    const result = await db.query(
      `INSERT INTO sessions (interview_link_id, patient_id, therapist_id, transcript, emotion_summary, risk_level, emotional_spikes, emotional_events, session_highlights)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7::jsonb, $8::jsonb, $9::jsonb)
       RETURNING session_id, interview_link_id, patient_id, therapist_id, transcript, emotion_summary, risk_level, emotional_spikes, emotional_events, session_highlights, notes, created_at`,
      [
        session.interview_link_id,
        session.patient_id,
        session.therapist_id,
        JSON.stringify(session.transcript),
        JSON.stringify(session.emotion_summary),
        session.risk_level,
        JSON.stringify(session.emotional_spikes || []),
        JSON.stringify(session.emotional_events || []),
        JSON.stringify(session.session_highlights || null),
      ],
    );

    return result.rows[0];
  }

  async findById(id) {
    const result = await db.query(
      `SELECT s.*,
              p.full_name as patient_name, p.age as patient_age, p.gender as patient_gender, p.primary_concern,
              qs.name as template_name
       FROM sessions s
       JOIN patients p ON p.patient_id = s.patient_id
       JOIN interview_links il ON il.interview_link_id = s.interview_link_id
       JOIN question_sets qs ON qs.question_set_id = il.question_set_id
       WHERE s.session_id = $1`,
      [id],
    );

    return result.rows[0] || null;
  }

  async findByPatientId(patientId, { therapistId, limit = 20, offset = 0 } = {}) {
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM sessions WHERE patient_id = $1 AND therapist_id = $2`,
      [patientId, therapistId],
    );

    const result = await db.query(
      `SELECT s.session_id, s.emotion_summary, s.risk_level, s.emotional_spikes, s.transcript, s.notes, s.created_at,
              p.full_name as patient_name,
              qs.name as template_name
       FROM sessions s
       JOIN patients p ON p.patient_id = s.patient_id
       JOIN interview_links il ON il.interview_link_id = s.interview_link_id
       JOIN question_sets qs ON qs.question_set_id = il.question_set_id
       WHERE s.patient_id = $1 AND s.therapist_id = $2
       ORDER BY s.created_at DESC
       LIMIT $3 OFFSET $4`,
      [patientId, therapistId, limit, offset],
    );

    return {
      sessions: result.rows,
      total: parseInt(countResult.rows[0].total),
      page: Math.floor(offset / limit) + 1,
      limit,
    };
  }

  async findByTherapistId(therapistId, { limit = 20, offset = 0 } = {}) {
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM sessions WHERE therapist_id = $1`,
      [therapistId],
    );

    const result = await db.query(
      `SELECT s.session_id, s.emotion_summary, s.risk_level, s.emotional_spikes, s.transcript, s.notes, s.created_at,
              p.patient_id, p.full_name as patient_name,
              qs.name as template_name
       FROM sessions s
       JOIN patients p ON p.patient_id = s.patient_id
       JOIN interview_links il ON il.interview_link_id = s.interview_link_id
       JOIN question_sets qs ON qs.question_set_id = il.question_set_id
       WHERE s.therapist_id = $1
       ORDER BY s.created_at DESC
       LIMIT $2 OFFSET $3`,
      [therapistId, limit, offset],
    );

    return {
      sessions: result.rows,
      total: parseInt(countResult.rows[0].total),
      page: Math.floor(offset / limit) + 1,
      limit,
    };
  }

  async findByInterviewLinkId(interviewLinkId) {
    const result = await db.query(
      `SELECT * FROM sessions WHERE interview_link_id = $1`,
      [interviewLinkId],
    );

    return result.rows[0] || null;
  }

  async updateNotes(id, notes) {
    const result = await db.query(
      `UPDATE sessions SET notes = $2, updated_at = NOW()
       WHERE session_id = $1
       RETURNING session_id, notes, updated_at`,
      [id, notes],
    );

    return result.rows[0];
  }

  async remove(id) {
    await db.query(`DELETE FROM sessions WHERE session_id = $1`, [id]);
    return { deleted: true };
  }
}
