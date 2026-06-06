import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";

const PORT = process.env.PORT || 5000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

app.listen(PORT, () => {
  console.log(`Amumata backend running on port ${PORT}`);
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
