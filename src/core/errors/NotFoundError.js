import AppError from "./AppError.js";

export default class NotFoundError extends AppError {
  constructor(
    message = "Resource not found",
    code = "NOT_FOUND",
    details = null,
  ) {
    super(message, 404, code, details);
  }
}
