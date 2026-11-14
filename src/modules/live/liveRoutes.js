import express from "express";
import authMiddleware from "../../core/middleware/Auth.js";
import { requireTherapist } from "../../core/middleware/requireUser.js";
import { sendSuccess } from "../../core/http/apiResponse.js";
import { liveHub } from "./liveServer.js";

const router = express.Router();

/** The therapist's interviews with the patient in the room right now (for the "Live now" badges). */
router.get("/status", authMiddleware, requireTherapist, (req, res) =>
  sendSuccess(res, { data: { live: liveHub.liveFor(req.user.id) } }),
);

export default router;
