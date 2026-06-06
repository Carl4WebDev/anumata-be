import AppError from "./AppError.js";

export default class ValidationError extends AppError {
  constructor(
    message = "Validation failed",
    details = null,
    code = "VALIDATION_ERROR",
  ) {
    super(message, 422, code, details);
  }
}
