import rateLimit from "express-rate-limit";

// Changing the password requires the current one — throttle so a hijacked
// session can't be used to brute-force it.
const passwordChangeRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many password change attempts. Please try again later.",
    code: "TOO_MANY_PASSWORD_ATTEMPTS",
  },
});

export default passwordChangeRateLimiter;
