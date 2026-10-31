import { Router } from "express";
import authMiddleware from "../../../core/middleware/Auth.js";
import { requireTherapist } from "../../../core/middleware/requireUser.js";
import { getNotifications, markNotificationRead, markAllNotificationsRead } from "./controller/NotificationController.js";

// Therapist-only; every query is scoped to req.user.id.
// Mount: app.use("/api/notifications", notificationRoutes)
const router = Router();

router.use(authMiddleware, requireTherapist);

router.get("/", getNotifications);
router.post("/read-all", markAllNotificationsRead);
router.post("/:id/read", markNotificationRead);

export default router;
