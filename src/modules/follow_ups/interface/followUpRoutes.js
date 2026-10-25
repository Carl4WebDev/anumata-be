import express from "express";
import {
  createFollowUp,
  getFollowUp,
  getPatientFollowUps,
  getFollowUps,
  getUpcomingFollowUps,
  getDueTodayFollowUps,
  getFollowUpCounts,
  updateFollowUp,
  deleteFollowUp,
} from "./controller/FollowUpController.js";

const router = express.Router();

import authMiddleware from "../../../core/middleware/Auth.js";
import { requireTherapist } from "../../../core/middleware/requireUser.js";

router.use(authMiddleware, requireTherapist);

router.post("/", createFollowUp);
router.post("/patient/:patientId", (req, res, next) => {
  req.body = { ...req.body, patient_id: req.params.patientId };
  createFollowUp(req, res, next);
});
router.get("/", getFollowUps);
router.get("/upcoming", getUpcomingFollowUps);
router.get("/due-today", getDueTodayFollowUps);
router.get("/counts", getFollowUpCounts);
router.get("/patient/:patientId", getPatientFollowUps);
router.get("/:id", getFollowUp);
router.patch("/:id", updateFollowUp);
router.delete("/:id", deleteFollowUp);

export default router;