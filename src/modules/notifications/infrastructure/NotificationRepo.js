import db from "../../../core/database/db.js";

export default class NotificationRepo {
  /**
   * Create a notification. Interview notifications are de-duplicated per
   * (interview_link_id, type) — a retried upload doesn't notify twice.
   * Returns the new row, or null if it already existed.
   */
  async create({ user_id, type, title, message = null, link = null, patient_id = null, interview_link_id = null }) {
    const { rows } = await db.query(
      `INSERT INTO notifications (user_id, type, title, message, link, patient_id, interview_link_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (interview_link_id, type) WHERE interview_link_id IS NOT NULL DO NOTHING
       RETURNING *`,
      [user_id, type, title, message, link, patient_id, interview_link_id],
    );
    return rows[0] ?? null;
  }

  async listForUser(userId, limit = 30) {
    const { rows } = await db.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, notification_id DESC LIMIT $2`,
      [userId, limit],
    );
    return rows;
  }

  async countUnread(userId) {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS unread FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );
    return rows[0].unread;
  }

  async markRead(userId, notificationId) {
    const { rowCount } = await db.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, NOW())
       WHERE notification_id = $1 AND user_id = $2`,
      [notificationId, userId],
    );
    return rowCount > 0;
  }

  async markAllRead(userId) {
    const { rowCount } = await db.query(
      `UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );
    return rowCount;
  }
}
