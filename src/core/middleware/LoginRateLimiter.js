// src/core/middlewares/loginRateLimiter.js
import rateLimit from "express-rate-limit";

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again later.",
    code: "TOO_MANY_LOGIN_ATTEMPTS",
  },
});

export default loginRateLimiter;
