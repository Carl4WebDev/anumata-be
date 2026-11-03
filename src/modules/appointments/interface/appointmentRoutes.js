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
  undoOutcome,
  getFreeSlots,
  getSchedule,
  updateSettings,
  setAvailability,
  addUnavailable,
  removeUnavailable,
  createSessionType,
  updateSessionType,
  removeSessionType,
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
router.post("/schedule/session-types", createSessionType);
router.put("/schedule/session-types/:id", updateSessionType);
router.delete("/schedule/session-types/:id", removeSessionType);

// Free slots for one day:
// ?date=YYYY-MM-DD[&exclude=<appointment id being moved>][&session_type_id=<type to book>]
router.get("/slots", getFreeSlots);

// Appointments
router.get("/", listAppointments);
router.post("/", bookAppointment);
router.get("/:id", getAppointment);
router.patch("/:id", updateAppointment);
router.post("/:id/cancel", cancelAppointment);
router.post("/:id/complete", completeAppointment);
router.post("/:id/no-show", markNoShow);
router.post("/:id/undo", undoOutcome); // within 15 minutes of completed / no-show / cancelled

export default router;
