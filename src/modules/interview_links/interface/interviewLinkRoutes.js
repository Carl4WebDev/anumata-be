import express from "express";
import {
  createInterviewLink,
  getInterviewLinks,
  getInterviewLinkByToken,
  updateInterviewLinkStatus,
  startInterview,
  completeInterview,
  deleteInterviewLink,
} from "./controller/InterviewLinkController.js";

import authMiddleware from "../../../core/middleware/Auth.js";
import { requireTherapist } from "../../../core/middleware/requireUser.js";

const router = express.Router();

// Protected therapist routes
router.post("/", authMiddleware, requireTherapist, createInterviewLink);
router.get("/", authMiddleware, requireTherapist, getInterviewLinks);
router.patch("/:id/status", authMiddleware, requireTherapist, updateInterviewLinkStatus);
router.delete("/:id", authMiddleware, requireTherapist, deleteInterviewLink);

// Public routes (client opens link via token)
router.get("/token/:token", getInterviewLinkByToken);
router.post("/token/:token/start", startInterview);
router.post("/token/:token/complete", completeInterview);

export default router;
