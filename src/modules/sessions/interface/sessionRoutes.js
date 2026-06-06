import express from "express";
import {
  createSession,
  getSessions,
  getSession,
  getPatientSessions,
  updateSessionNotes,
  deleteSession,
} from "./controller/SessionController.js";

import authMiddleware from "../../../core/middleware/Auth.js";
import { requireTherapist } from "../../../core/middleware/requireUser.js";

const router = express.Router();

router.use(authMiddleware, requireTherapist);

router.post("/", createSession);
router.get("/", getSessions);
router.get("/:id", getSession);
router.get("/patient/:patientId", getPatientSessions);
router.patch("/:id/notes", updateSessionNotes);
router.delete("/:id", deleteSession);

export default router;
