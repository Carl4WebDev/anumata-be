import db from "../../../core/database/db.js";

const CHANNEL = "email";

export default class ReminderRepo {
  /**
   * Scheduled appointments in the next 24 hours whose patient has an email and
   * agreed to reminders, with the reminder kinds already sent for each.
   */
  async findUpcoming() {
    const { rows } = await db.query(
      `SELECT a.appointment_id, a.start_at, a.session_type,
              p.f_name AS patient_first_name, p.email AS patient_email,
              COALESCE(NULLIF(TRIM(u.full_name), ''), TRIM(CONCAT_WS(' ', u.f_name, u.l_name))) AS therapist_name,
              COALESCE(
                (SELECT array_agg(r.kind) FROM appointment_reminders r
                 WHERE r.appointment_id = a.appointment_id AND r.channel = $1),
                '{}'
              ) AS sent_kinds
       FROM appointments a
       JOIN patients p ON p.patient_id = a.patient_id
       JOIN users u ON u.user_id = a.therapist_id
       WHERE a.status = 'scheduled'
         AND a.start_at > NOW() AND a.start_at <= NOW() + INTERVAL '24 hours'
         AND p.email IS NOT NULL AND p.reminder_consent
         AND p.is_archived IS DISTINCT FROM TRUE
       ORDER BY a.start_at
       LIMIT 200`,
      [CHANNEL],
    );
    return rows;
  }

  /**
   * Reserve a reminder before sending it, so two runs can never send the same
   * one. Returns its id, or null when it was already taken.
   */
  async claim(appointmentId, kind) {
    const { rows } = await db.query(
      `INSERT INTO appointment_reminders (appointment_id, kind, channel, status)
       VALUES ($1, $2, $3, 'sending')
       ON CONFLICT (appointment_id, kind, channel) DO NOTHING
       RETURNING reminder_id`,
      [appointmentId, kind, CHANNEL],
    );
    return rows[0]?.reminder_id ?? null;
  }

  async finish(reminderId, status, error = null) {
    await db.query(`UPDATE appointment_reminders SET status = $2, error = $3, sent_at = NOW() WHERE reminder_id = $1`, [
      reminderId,
      status,
      error,
    ]);
  }
}
