import { sendSuccess } from "../../../../core/http/apiResponse.js";
import { asyncHandler } from "../../../../core/middleware/asyncHandler.js";
import ValidationError from "../../../../core/errors/ValidationError.js";
import { notificationService } from "../../notificationServiceInstance.js";

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError("Invalid id.");
  return id;
}

export const getNotifications = asyncHandler(async (req, res) => {
  const result = await notificationService.getInbox(req.user.id);
  return sendSuccess(res, { statusCode: 200, message: "Notifications fetched", data: result });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markRead(req.user.id, parseId(req.params.id));
  return sendSuccess(res, { statusCode: 200, message: "Notification marked as read", data: result });
});

export const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllRead(req.user.id);
  return sendSuccess(res, { statusCode: 200, message: "Notifications marked as read", data: result });
});
