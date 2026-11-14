// Must be the first import: ES imports run before this file's code, so a
// plain dotenv.config() here would load .env after the other modules have
// already read process.env (AI_SERVICE_URL etc. would silently be defaults).
import "dotenv/config";

import app from "./app.js";
import { startReminderScheduler } from "./modules/reminders/reminderScheduler.js";
import { startLicenseReminderScheduler } from "./modules/admin/licenseReminderScheduler.js";

const PORT = process.env.PORT || 5000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

app.listen(PORT, () => {
  console.log(`Amumata backend running on port ${PORT}`);
  startReminderScheduler();
  startLicenseReminderScheduler();
});

// Self-ping to prevent Render free tier cold start (every 10 min)
if (process.env.NODE_ENV === "production") {
  setInterval(async () => {
    try {
      await fetch(`${APP_URL}/health`);
    } catch {
      // silent — expected if Render is spinning down
    }
  }, 10 * 60 * 1000);
}
