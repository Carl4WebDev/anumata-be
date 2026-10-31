import NotificationRepo from "./infrastructure/NotificationRepo.js";
import NotificationService from "./application/NotificationService.js";

/** Shared instance — used by the notifications API and by other modules that notify. */
export const notificationService = new NotificationService(new NotificationRepo());
