/**
 * Where the Python AI service runs, and the credentials it needs.
 *
 * Locally: http://localhost:8001, no credentials.
 * On Modal: AI_SERVICE_URL is the Modal URL, and AI_SERVICE_KEY / AI_SERVICE_SECRET
 * are a Modal proxy token (Dashboard → Settings → Proxy Auth Tokens). Modal
 * rejects requests without them, so nobody else can use the GPU.
 */
export const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8001";

/** Headers every request to the AI service must carry ({} when running locally). */
export function aiServiceHeaders() {
  const key = process.env.AI_SERVICE_KEY;
  const secret = process.env.AI_SERVICE_SECRET;
  return key && secret ? { "Modal-Key": key, "Modal-Secret": secret } : {};
}
