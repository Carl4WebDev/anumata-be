import rateLimit from "express-rate-limit";

/**
 * Per-IP limits for public endpoints that reach the AI service (no login).
 * Generous enough for a real interview, low enough that nobody can use the
 * server's GPU as a free transcription/translation service or flood uploads.
 */
export function publicRateLimiter({ max, what }) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: `Too many ${what} requests. Please wait a few minutes and try again.`,
      code: "TOO_MANY_REQUESTS",
    },
  });
}

// A 30-minute interview captions roughly one phrase every few seconds.
export const sttLimiter = publicRateLimiter({ max: 400, what: "transcription" });
export const translateLimiter = publicRateLimiter({ max: 150, what: "translation" });
// One early upload per answered question, plus retries.
export const stagedUploadLimiter = publicRateLimiter({ max: 200, what: "upload" });
export const analyzeLimiter = publicRateLimiter({ max: 20, what: "analysis" });
