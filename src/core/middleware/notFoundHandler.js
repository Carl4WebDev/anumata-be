// src/core/middleware/notFoundHandler.js
export default function notFoundHandler(req, res, next) {
  return res.status(404).json({
    status: "error",
    message: "Route not found",
    code: "ROUTE_NOT_FOUND",
  });
}
