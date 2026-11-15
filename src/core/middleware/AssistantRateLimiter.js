import rateLimit from "express-rate-limit";

/**
 * Ask Amumata (admin): at most 20 questions per 15 minutes per admin account,
 * so the shared GPU stays free for interviews. Runs after the login check.
 */
export const ASSISTANT_MAX_PER_WINDOW = 20;

export const assistantLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: ASSISTANT_MAX_PER_WINDOW,
  keyGenerator: (req) => `assistant:${req.user.id}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "You've asked a lot of questions in a short time. Please wait a few minutes and try again.",
    code: "TOO_MANY_REQUESTS",
  },
});
