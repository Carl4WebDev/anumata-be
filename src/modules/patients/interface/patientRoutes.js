import express from "express";
import {
  createPatient,
  getPatients,
  getPatient,
  updatePatient,
  deletePatient,
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

export default router;
