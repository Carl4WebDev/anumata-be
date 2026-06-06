// src/core/http/apiResponse.js
export const sendSuccess = (
  res,
  { statusCode = 200, message = null, data = null, meta = null } = {}
) => {
  return res.status(statusCode).json({
    status: "success",
    message,
    data,
    meta,
  });
};
