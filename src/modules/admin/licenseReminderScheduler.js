import db from "../../core/database/db.js";

const EVERY_MS = 60 * 60 * 1000;
const FIRST_RUN_MS = 60 * 1000;

/**
 * Once a day (Philippine time), remind each active therapist whose PRC license
 * isn't verified yet. One reminder per therapist per day, however often this runs.
 * Returns how many reminders were created.
 */
export async function sendLicenseReminders() {
  const { rowCount } = await db.query(
    `INSERT INTO notifications (user_id, type, title, message, link)
     SELECT u.user_id, 'license_reminder',
            CASE WHEN u.license_status = 'not_matched'
                 THEN 'Your PRC license details didn''t match'
                 ELSE 'Your PRC license isn''t verified yet' END,
            CASE WHEN u.license_status = 'not_matched'
                 THEN 'Please check your license number and the name on your PRC ID in Settings.'
                 WHEN u.profession IS NULL OR u.license_number IS NULL OR u.license_name IS NULL
                 THEN 'Add your profession, PRC license number and the name on your PRC ID in Settings so it can be verified.'
                 ELSE 'Your license is waiting to be checked on the PRC verification service. You can keep using Amumata meanwhile.' END,
            '/settings'
     FROM users u
     WHERE u.role = 'THERAPIST' AND u.is_active AND u.license_status <> 'verified'
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.user_id = u.user_id AND n.type = 'license_reminder'
           AND n.created_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila')
       )`,
  );
  return rowCount;
}

/** Checks every hour; each therapist still gets at most one reminder a day. */
export function startLicenseReminderScheduler() {
  const run = async () => {
    try {
      const sent = await sendLicenseReminders();
      if (sent) console.log(`[LICENSE] Sent ${sent} PRC license reminder(s).`);
    } catch (err) {
      console.error("[LICENSE] Reminder check failed:", err.message);
    }
  };
  setTimeout(run, FIRST_RUN_MS);
  setInterval(run, EVERY_MS);
}
