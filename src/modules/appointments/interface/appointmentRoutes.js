import { Router } from "express";
import authMiddleware from "../../../core/middleware/Auth.js";
import { requireTherapist } from "../../../core/middleware/requireUser.js";
import {
  listAppointments,
  getAppointment,
  bookAppointment,
  updateAppointment,
  cancelAppointment,
  completeAppointment,
  markNoShow,
  getFreeSlots,
  getSchedule,
  updateSettings,
  setAvailability,
  addUnavailable,
  removeUnavailable,
} from "./controller/AppointmentController.js";

// Therapist-only. Ownership (therapist_id = req.user.id) is enforced in the
// service/repo layer. Mount: app.use("/api/appointments", appointmentRoutes)
const router = Router();

router.use(authMiddleware, requireTherapist);

// Schedule setup
router.get("/schedule", getSchedule);
router.put("/schedule/settings", updateSettings);
router.put("/schedule/availability", setAvailability);
router.post("/schedule/unavailable", addUnavailable);
router.delete("/schedule/unavailable/:id", removeUnavailable);

// Free slots for one day: ?date=YYYY-MM-DD[&exclude=<appointment id being moved>]
router.get("/slots", getFreeSlots);

// Appointments
router.get("/", listAppointments);
router.post("/", bookAppointment);
router.get("/:id", getAppointment);
router.patch("/:id", updateAppointment);
router.post("/:id/cancel", cancelAppointment);
router.post("/:id/complete", completeAppointment);
router.post("/:id/no-show", markNoShow);

export default router;
