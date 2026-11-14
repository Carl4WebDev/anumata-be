import NotFoundError from "../../../core/errors/NotFoundError.js";

/** Builds the therapist's interview notifications and serves their inbox. */
export default class NotificationService {
  constructor(repo) {
    this.repo = repo;
  }

  async getInbox(userId) {
    const [items, unread_count] = await Promise.all([this.repo.listForUser(userId), this.repo.countUnread(userId)]);
    return { items, unread_count };
  }

  async markRead(userId, notificationId) {
    const updated = await this.repo.markRead(userId, notificationId);
    if (!updated) throw new NotFoundError("Notification not found.");
    return { read: true };
  }

  async markAllRead(userId) {
    return { updated: await this.repo.markAllRead(userId) };
  }

  /**
   * Notify the therapist about an interview event. Never throws: a failed
   * notification must not break the interview or its analysis.
   * `link` is the interview link row (with patient_name).
   * Returns the notification, { already_notified: true }, or null if it failed.
   */
  async notifyInterview(link, type, { sessionId = null } = {}) {
    const name = (link.patient_name || "Your patient").trim();
    const content = {
      // The patient entered the interview room: one click to watch live.
      interview_started: {
        title: `${name} started the interview`,
        message: "They're answering now. Open this to watch live.",
        route: `/interview-links/${link.interview_link_id}/live`,
      },
      interview_finished: {
        title: `${name} finished the interview`,
        message: "Their answers are being analysed. You'll be notified when the results are ready.",
        route: `/patients/${link.patient_id}`,
      },
      results_ready: {
        title: `Results ready for ${name}`,
        message: "The AI analysis of the interview is complete and ready for your review.",
        route: sessionId ? `/sessions/${sessionId}` : `/patients/${link.patient_id}`,
      },
      analysis_failed: {
        title: `Analysis didn't finish for ${name}`,
        message: "The interview was recorded, but the AI analysis failed. Check that the AI service is running.",
        route: `/patients/${link.patient_id}`,
      },
      // Raised live from the interview room. What was said stays in the transcript.
      crisis_flag: {
        title: `Urgent: please check on ${name}`,
        message:
          "During the interview they said something that may mean thoughts of self-harm. Amumata showed them crisis hotlines. You can watch the interview live now, and please contact them as soon as you can.",
        route: `/patients/${link.patient_id}`,
      },
    }[type];
    if (!content) return null;

    try {
      return await this.repo.create({
        user_id: link.therapist_id,
        type,
        title: content.title,
        message: content.message,
        link: content.route,
        patient_id: link.patient_id,
        interview_link_id: link.interview_link_id,
      });
    } catch (err) {
      // One of each kind per interview (unique index): this one was sent before.
      if (err.code === "23505") return { already_notified: true };
      console.error(`[NOTIFY] Could not create ${type} notification:`, err.message);
      return null;
    }
  }

  /**
   * Notify a therapist about their own account (e.g. the PRC license check result).
   * Opens Settings, where the license details are. Never throws.
   */
  async notifyAccount(userId, { type, title, message }) {
    try {
      return await this.repo.create({ user_id: userId, type, title, message, link: "/settings" });
    } catch (err) {
      console.error(`[NOTIFY] Could not create ${type} notification:`, err.message);
      return null;
    }
  }
}
