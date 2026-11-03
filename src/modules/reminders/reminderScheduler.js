import ReminderRepo from "./infrastructure/ReminderRepo.js";
import ReminderService from "./application/ReminderService.js";
import { isEmailConfigured, sendEmail } from "./infrastructure/emailjsSender.js";
import { enabledKinds } from "./application/reminderSchedule.js";

const EVERY_MS = 5 * 60 * 1000;
const FIRST_RUN_MS = 30 * 1000;

/**
 * Checks for due appointment reminders every 5 minutes while the server runs.
 * Off when EmailJS isn't configured or REMINDERS_ENABLED=false (e.g. local testing).
 */
export function startReminderScheduler() {
  if (process.env.REMINDERS_ENABLED === "false") {
    console.log("[REMINDERS] Turned off (REMINDERS_ENABLED=false).");
    return;
  }
  if (!isEmailConfigured()) {
    console.log("[REMINDERS] EmailJS is not configured — appointment reminders are off.");
    return;
  }
  const service = new ReminderService(new ReminderRepo(), sendEmail, enabledKinds(process.env.REMINDER_KINDS));
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const { sent, failed } = await service.sendDue();
      if (sent || failed) console.log(`[REMINDERS] Sent ${sent}, failed ${failed}.`);
    } catch (err) {
      console.error("[REMINDERS] Check failed:", err.message);
    } finally {
      running = false;
    }
  };
  setTimeout(run, FIRST_RUN_MS);
  setInterval(run, EVERY_MS);
  console.log("[REMINDERS] Appointment reminder emails are on.");
}
