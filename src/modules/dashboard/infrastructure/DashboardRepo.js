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
      `SELECT p.patient_id as id, CONCAT(p.f_name, ' ', COALESCE(p.m_name || ' ', ''), p.l_name) as name,
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

  async getFollowUpCounts(therapistId) {
    const result = await db.query(
      `SELECT
        COALESCE(SUM(CASE WHEN status IN ('recommended', 'scheduled') AND recommended_date > CURRENT_DATE THEN 1 ELSE 0 END), 0)::int as upcoming,
        COALESCE(SUM(CASE WHEN status IN ('recommended', 'scheduled') AND recommended_date = CURRENT_DATE THEN 1 ELSE 0 END), 0)::int as due_today,
        COALESCE(SUM(CASE WHEN status IN ('recommended', 'scheduled') AND recommended_date < CURRENT_DATE THEN 1 ELSE 0 END), 0)::int as overdue
       FROM follow_ups
       WHERE therapist_id = $1`,
      [therapistId],
    );
    return result.rows[0] || { upcoming: 0, due_today: 0, overdue: 0 };
  }

  async getUpcomingFollowUps(therapistId, limit = 5) {
    const result = await db.query(
      `SELECT fu.follow_up_id as id, fu.recommended_date, fu.appointment_time, fu.status,
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
