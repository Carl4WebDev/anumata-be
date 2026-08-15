import express from "express";
import {
  createPatient,
  getPatients,
  getPatient,
  updatePatient,
  deletePatient,
  generateLongitudinalReport,
} from "./controller/PatientController.js";

const router = express.Router();

import authMiddleware from "../../../core/middleware/Auth.js";
import { requireTherapist } from "../../../core/middleware/requireUser.js";

router.use(authMiddleware, requireTherapist);

router.post("/", createPatient);
router.get("/", getPatients);
router.get("/:id", getPatient);
router.patch("/:id", updatePatient);
router.delete("/:id", deletePatient);
router.post("/:id/longitudinal-report", generateLongitudinalReport);

export default router;
