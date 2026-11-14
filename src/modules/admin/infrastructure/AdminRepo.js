import db from "../../../core/database/db.js";

/**
 * Therapist accounts as the admin sees them: account and PRC license details plus
 * counts only — never patient names, sessions or notes.
 */
const THERAPIST_COLUMNS = `
  u.user_id, u.email, u.f_name, u.m_name, u.l_name, u.profession, u.license_number, u.license_name,
  u.license_status, u.license_note, u.license_checked_at, u.is_active, u.deactivated_at, u.created_at,
  checker.email AS license_checked_by_email,
  (SELECT COUNT(*)::int FROM patients p WHERE p.therapist_id = u.user_id) AS patient_count,
  (SELECT COUNT(*)::int FROM interview_links l WHERE l.therapist_id = u.user_id) AS interview_link_count`;

export default class AdminRepo {
  async listTherapists({ status = null, search = null } = {}) {
    const { rows } = await db.query(
      `SELECT ${THERAPIST_COLUMNS}
       FROM users u
       LEFT JOIN users checker ON checker.user_id = u.license_checked_by
       WHERE u.role = 'THERAPIST'
         AND ($1::varchar IS NULL OR
              ($1 = 'deactivated' AND NOT u.is_active) OR
              ($1 <> 'deactivated' AND u.license_status = $1))
         AND ($2::varchar IS NULL OR
              u.email ILIKE '%' || $2 || '%' OR u.full_name ILIKE '%' || $2 || '%' OR
              u.license_name ILIKE '%' || $2 || '%' OR u.license_number ILIKE '%' || $2 || '%')
       ORDER BY (u.license_status = 'pending') DESC, u.created_at DESC
       LIMIT 500`,
      [status, search],
    );
    return rows;
  }

  async findTherapist(userId) {
    const { rows } = await db.query(
      `SELECT ${THERAPIST_COLUMNS}
       FROM users u
       LEFT JOIN users checker ON checker.user_id = u.license_checked_by
       WHERE u.user_id = $1 AND u.role = 'THERAPIST'`,
      [userId],
    );
    return rows[0] ?? null;
  }

  /** Counts for the overview cards. */
  async summary() {
    const { rows } = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE role = 'THERAPIST')::int AS therapists,
         COUNT(*) FILTER (WHERE role = 'THERAPIST' AND license_status = 'pending')::int AS pending,
         COUNT(*) FILTER (WHERE role = 'THERAPIST' AND license_status = 'verified')::int AS verified,
         COUNT(*) FILTER (WHERE role = 'THERAPIST' AND license_status = 'not_matched')::int AS not_matched,
         COUNT(*) FILTER (WHERE role = 'THERAPIST' AND NOT is_active)::int AS deactivated
       FROM users`,
    );
    return rows[0];
  }

  /**
   * How the system is used — aggregate counts and times only, no patient data.
   * `days` windows: 7 and 30. An analysed interview creates a sessions row.
   */
  async usage() {
    const [counts, weekly, failures] = await Promise.all([
      db.query(
        `SELECT
           (SELECT COUNT(*)::int FROM users WHERE role = 'THERAPIST') AS therapists,
           (SELECT COUNT(*)::int FROM users WHERE role = 'THERAPIST' AND license_status = 'verified') AS therapists_verified,
           (SELECT COUNT(*)::int FROM users WHERE role = 'THERAPIST' AND created_at > NOW() - interval '30 days') AS therapists_new_30d,
           (SELECT COUNT(*)::int FROM interview_links WHERE created_at > NOW() - interval '7 days') AS links_sent_7d,
           (SELECT COUNT(*)::int FROM interview_links WHERE created_at > NOW() - interval '30 days') AS links_sent_30d,
           (SELECT COUNT(*)::int FROM interview_links WHERE status = 'completed' AND updated_at > NOW() - interval '7 days') AS interviews_completed_7d,
           (SELECT COUNT(*)::int FROM interview_links WHERE status = 'completed' AND updated_at > NOW() - interval '30 days') AS interviews_completed_30d,
           (SELECT COUNT(*)::int FROM interview_links
             WHERE status = 'expired' OR (status = 'pending' AND created_at < NOW() - interval '7 days')) AS links_unused,
           (SELECT COUNT(*)::int FROM sessions WHERE created_at > NOW() - interval '7 days') AS analyses_ready_7d,
           (SELECT COUNT(*)::int FROM sessions WHERE created_at > NOW() - interval '30 days') AS analyses_ready_30d,
           (SELECT COUNT(*)::int FROM notifications WHERE type = 'analysis_failed' AND created_at > NOW() - interval '7 days') AS analyses_failed_7d,
           (SELECT COUNT(*)::int FROM notifications WHERE type = 'analysis_failed' AND created_at > NOW() - interval '30 days') AS analyses_failed_30d,
           (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (r.created_at - f.created_at))))::int
              FROM notifications f
              JOIN notifications r ON r.interview_link_id = f.interview_link_id AND r.type = 'results_ready'
             WHERE f.type = 'interview_finished' AND r.created_at > NOW() - interval '30 days'
               AND r.created_at >= f.created_at) AS avg_seconds_to_results_30d,
           (SELECT COUNT(*)::int FROM appointments WHERE created_at > NOW() - interval '7 days') AS appointments_7d,
           (SELECT COUNT(*)::int FROM appointments WHERE created_at > NOW() - interval '30 days') AS appointments_30d,
           (SELECT COUNT(*)::int FROM follow_ups WHERE created_at > NOW() - interval '30 days') AS follow_ups_30d`,
      ),
      // Analysed interviews per week for the last 8 weeks (weeks with none show 0).
      db.query(
        `SELECT to_char(w.week, 'YYYY-MM-DD') AS week_start, COUNT(s.session_id)::int AS interviews
         FROM generate_series(date_trunc('week', NOW()) - interval '7 weeks', date_trunc('week', NOW()), interval '1 week') AS w(week)
         LEFT JOIN sessions s ON s.created_at >= w.week AND s.created_at < w.week + interval '1 week'
         GROUP BY w.week
         ORDER BY w.week`,
      ),
      // Recent analysis failures: when, and whose interview (therapist email only).
      db.query(
        `SELECT n.notification_id, n.created_at, u.email AS therapist_email
         FROM notifications n
         JOIN users u ON u.user_id = n.user_id
         WHERE n.type = 'analysis_failed' AND n.created_at > NOW() - interval '30 days'
         ORDER BY n.created_at DESC
         LIMIT 10`,
      ),
    ]);
    return { counts: counts.rows[0], weekly: weekly.rows, failures: failures.rows };
  }

  async setLicenseStatus(userId, status, note, adminId) {
    await db.query(
      `UPDATE users SET license_status = $2, license_note = $3, license_checked_at = NOW(),
                        license_checked_by = $4, updated_at = NOW()
       WHERE user_id = $1`,
      [userId, status, note, adminId],
    );
  }

  async setActive(userId, active) {
    await db.query(
      `UPDATE users SET is_active = $2, deactivated_at = CASE WHEN $2 THEN NULL ELSE NOW() END, updated_at = NOW()
       WHERE user_id = $1`,
      [userId, active],
    );
  }

  async logAction(adminId, targetUserId, action, note) {
    await db.query(
      `INSERT INTO admin_actions (admin_id, target_user_id, action, note) VALUES ($1, $2, $3, $4)`,
      [adminId, targetUserId, action, note],
    );
  }

  async listActions(targetUserId) {
    const { rows } = await db.query(
      `SELECT a.action_id, a.action, a.note, a.created_at, admin.email AS admin_email
       FROM admin_actions a
       LEFT JOIN users admin ON admin.user_id = a.admin_id
       WHERE a.target_user_id = $1
       ORDER BY a.created_at DESC
       LIMIT 50`,
      [targetUserId],
    );
    return rows;
  }
}
