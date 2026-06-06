// src/core/errors/AppError.js
export default class AppError extends Error {
  /**
   * HTTP STATUS CODE REFERENCE (STANDARD)
   *
   * SUCCESS
   * 200 OK                   - General successful request
   * 201 CREATED              - Resource successfully created
   * 204 NO_CONTENT           - Successful request, no body returned
   *
   * CLIENT ERRORS (4xx)
   * 400 BAD_REQUEST          - Invalid request payload or parameters
   * 401 UNAUTHORIZED         - Missing/invalid auth token
   * 403 FORBIDDEN            - User authenticated but not allowed
   * 404 NOT_FOUND            - Resource does not exist
   * 409 CONFLICT             - Already exists / duplicates / state conflict
   * 422 UNPROCESSABLE_ENTITY - Validation failed (preferred over 400 for DTO errors)
   *
   * SERVER ERRORS (5xx)
   * 500 INTERNAL_SERVER_ERROR - Unexpected server crash/bug
   * 503 SERVICE_UNAVAILABLE   - Database down / external service unreachable
   */

  /**
   * @param {string} message   Safe, client-facing message
   * @param {number} statusCode HTTP status code (400, 404, 500...)
   * @param {string} code      Machine-readable error code (e.g., "EMAIL_EXISTS")
   * @param {object|null} details Additional structured info (validation errors, etc.)
   */
  constructor(
    message,
    statusCode = 500,
    code = "INTERNAL_ERROR",
    details = null,
  ) {
    super(message);

    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true; // Distinguish expected (safe) vs unexpected errors

    Error.captureStackTrace(this, this.constructor);
  }
}
