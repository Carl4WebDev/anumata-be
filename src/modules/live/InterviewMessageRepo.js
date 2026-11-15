import db from "../../core/database/db.js";

/** Messages between therapist and patient during a live interview (table interview_messages). */
export default class InterviewMessageRepo {
  /** Save one message or pause/resume. Returns the new message_id. */
  async save({ linkId, sender, kind, body = null, questionIndex = null }) {
    const { rows } = await db.query(
      `INSERT INTO interview_messages (interview_link_id, sender, kind, body, question_index)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING message_id`,
      [linkId, sender, kind, body, questionIndex],
    );
    return rows[0]?.message_id ?? null;
  }

  /** The patient's screen showed this therapist message. */
  async markSeen(messageId) {
    await db.query(
      `UPDATE interview_messages SET seen_at = COALESCE(seen_at, NOW())
       WHERE message_id = $1 AND sender = 'therapist'`,
      [messageId],
    );
  }

  /** Everything said in one interview, oldest first. */
  async listByLink(linkId) {
    const { rows } = await db.query(
      `SELECT message_id, sender, kind, body, question_index, seen_at, created_at
       FROM interview_messages WHERE interview_link_id = $1
       ORDER BY created_at, message_id`,
      [linkId],
    );
    return rows;
  }
}
