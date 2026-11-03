import { dueReminder } from "./reminderSchedule.js";
import { reminderTemplateParams } from "./reminderEmail.js";

/**
 * Sends the appointment reminder emails that are due. Each reminder is
 * reserved in the log before sending, so it goes out at most once even if a
 * run overlaps another; a failed send is logged (with the error) and not retried.
 */
export default class ReminderService {
  /**
   * @param {{ findUpcoming(): Promise<object[]>, claim(id: number, kind: string): Promise<number|null>, finish(id: number, status: string, error?: string|null): Promise<void> }} repo
   * @param {(params: Record<string, string>) => Promise<{ ok: boolean, error?: string }>} sendEmail
   * @param {string[]} kinds reminder kinds turned on
   */
  constructor(repo, sendEmail, kinds) {
    this.repo = repo;
    this.sendEmail = sendEmail;
    this.kinds = kinds;
  }

  /** One pass: returns how many reminders were sent and how many failed. */
  async sendDue(now = new Date()) {
    const upcoming = await this.repo.findUpcoming();
    let sent = 0;
    let failed = 0;
    for (const appt of upcoming) {
      const kind = dueReminder(new Date(appt.start_at).getTime(), now.getTime(), this.kinds, new Set(appt.sent_kinds ?? []));
      if (!kind) continue;
      const reminderId = await this.repo.claim(appt.appointment_id, kind);
      if (!reminderId) continue;
      const result = await this.sendEmail(reminderTemplateParams(appt, kind));
      if (result.ok) {
        await this.repo.finish(reminderId, "sent");
        sent += 1;
      } else {
        await this.repo.finish(reminderId, "failed", result.error ?? "unknown error");
        console.error(`[REMINDERS] Appointment ${appt.appointment_id} (${kind}) failed: ${result.error}`);
        failed += 1;
      }
    }
    return { sent, failed };
  }
}
