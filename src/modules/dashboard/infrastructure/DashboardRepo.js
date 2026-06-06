import db from "../../../core/database/db.js";

export default class DashboardRepo {
  async getStats(therapistId) {
    const result = await db.query(
      `SELECT
        (SELECT COUNT(*)::int FROM patients WHERE therapist_id = $1) as total_patients,
        (SELECT COUNT(*)::int FROM interview_links WHERE therapist_id = $1 AND status = 'pending') as pending_interviews,
        (SELECT COUNT(*)::int FROM sessions s
         JOIN patients p ON p.patient_id = s.patient_id
         WHERE p.therapist_id = $1 AND LOWER(s.risk_level) = 'high'
         AND s.created_at = (SELECT MAX(s2.created_at) FROM sessions s2 WHERE s2.patient_id = s.patient_id)
        ) as high_risk_cases,
        (SELECT COUNT(*)::int FROM sessions
         WHERE therapist_id = $1 AND created_at >= date_trunc('week', CURRENT_DATE)
        ) as completed_this_week,
        (SELECT COALESCE(SUM(CASE WHEN LOWER(s.risk_level) = 'high' THEN 1 ELSE 0 END), 0)::int FROM sessions s
         JOIN patients p ON p.patient_id = s.patient_id
         WHERE p.therapist_id = $1
         AND s.created_at = (SELECT MAX(s2.created_at) FROM sessions s2 WHERE s2.patient_id = s.patient_id)
        ) as risk_high,
        (SELECT COALESCE(SUM(CASE WHEN LOWER(s.risk_level) = 'moderate' THEN 1 ELSE 0 END), 0)::int FROM sessions s
         JOIN patients p ON p.patient_id = s.patient_id
         WHERE p.therapist_id = $1
         AND s.created_at = (SELECT MAX(s2.created_at) FROM sessions s2 WHERE s2.patient_id = s.patient_id)
        ) as risk_moderate,
        (SELECT COALESCE(SUM(CASE WHEN LOWER(s.risk_level) = 'low' THEN 1 ELSE 0 END), 0)::int FROM sessions s
         JOIN patients p ON p.patient_id = s.patient_id
         WHERE p.therapist_id = $1
         AND s.created_at = (SELECT MAX(s2.created_at) FROM sessions s2 WHERE s2.patient_id = s.patient_id)
        ) as risk_low`,
      [therapistId],
    );

    return result.rows[0];
  }

  async getRecentPatients(therapistId, limit = 4) {
    const result = await db.query(
      `SELECT p.patient_id as id, p.full_name as name,
              COALESCE(s.risk_level, 'N/A') as risk,
              p.primary_concern as status,
              s.created_at as last_interview
       FROM patients p
       LEFT JOIN LATERAL (
         SELECT s.risk_level, s.created_at
         FROM sessions s WHERE s.patient_id = p.patient_id
         ORDER BY s.created_at DESC LIMIT 1
       ) s ON true
       WHERE p.therapist_id = $1
       ORDER BY p.created_at DESC
       LIMIT $2`,
      [therapistId, limit],
    );

    return result.rows;
  }

  async getEmotionTrend(therapistId) {
    const result = await db.query(
      `SELECT
        COALESCE(AVG((s.emotion_summary->>'happy')::numeric), 0)::int as happy,
        COALESCE(AVG((s.emotion_summary->>'sad')::numeric), 0)::int as sad,
        COALESCE(AVG((s.emotion_summary->>'angry')::numeric), 0)::int as angry
       FROM sessions s
       JOIN patients p ON p.patient_id = s.patient_id
       WHERE p.therapist_id = $1`,
      [therapistId],
    );

    return result.rows[0] || { happy: 0, sad: 0, angry: 0 };
  }
}
