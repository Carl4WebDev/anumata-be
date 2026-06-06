// src/core/middleware/errorHandler.js
import AppError from "../errors/AppError.js";

const isDev = process.env.NODE_ENV === "development";

export default function errorHandler(err, req, res, next) {
  // 1. Normalize to AppError
  let appError;

  if (err instanceof AppError) {
    appError = err;
  } else {
    console.error("[UNEXPECTED ERROR]", err);

    // Do NOT leak internals to client
    appError = new AppError("Internal server error", 500, "INTERNAL_ERROR");
  }

  const { statusCode, code, message, details } = appError;

  const payload = {
    status: "error",
    message,
    code,
  };

  if (details) {
    payload.details = details;
  }

  if (isDev) {
    payload.stack = err.stack;
  }

  return res.status(statusCode).json(payload);
}
