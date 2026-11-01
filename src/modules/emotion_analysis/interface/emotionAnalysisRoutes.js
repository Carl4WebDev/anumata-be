import express from "express";
import multer from "multer";
import { analyzeInterview, getAnalysisResults, getAnalysisStatus, reportCrisis, stageFiles } from "./controller/EmotionAnalysisController.js";
import InterviewLinkRepo from "../../interview_links/infrastructure/InterviewLinkRepo.js";
import { analyzeLimiter, crisisAlertLimiter, stagedUploadLimiter, sttLimiter } from "../../../core/middleware/PublicApiRateLimiter.js";

const interviewLinkRepo = new InterviewLinkRepo();

/**
 * Check the interview token BEFORE accepting uploads, so nobody can make the
 * server buffer hundreds of megabytes for a link that doesn't exist.
 */
const requireInterviewLink = async (req, res, next) => {
  try {
    const link = await interviewLinkRepo.findByToken(req.params.token);
    if (!link) return res.status(404).json({ status: "error", message: "Interview link not found" });
    next();
  } catch (err) {
    next(err);
  }
};

const router = express.Router();

// Multer: store files in memory, max 500 files (was 50, caused LIMIT_FILE_COUNT error)
// Each question captures ~10-15 frames (every 3s) + 1 audio file.
// With 25 questions: ~250 frames + 25 audio = ~275 files. 500 gives headroom.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 500 },
});

// Lightweight STT transcription for rapport phase (no FER/SER/LER)
const sttUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

import { AI_SERVICE_URL, aiServiceHeaders } from "../../../core/http/aiService.js";

router.post("/stt/transcribe", sttLimiter, sttUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: "error", message: "No audio file provided" });
    }

    const formData = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
    formData.append("file", blob, req.file.originalname);

    const response = await fetch(`${AI_SERVICE_URL}/api/stt/transcribe`, {
      method: "POST",
      headers: aiServiceHeaders(),
      body: formData,
      signal: AbortSignal.timeout(60000),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ status: "error", message: data.detail || "Transcription failed" });
    }

    res.json({ status: "success", data });
  } catch (err) {
    console.error("STT proxy error:", err);
    res.status(500).json({ status: "error", message: "Transcription service unavailable" });
  }
});

// Public routes — patient accesses via interview link token
router.post("/token/:token/staged-files", stagedUploadLimiter, requireInterviewLink, upload.array("files", 500), stageFiles);
router.post("/token/:token/analyze", analyzeLimiter, requireInterviewLink, upload.array("files", 500), analyzeInterview);
router.get("/token/:token/analysis-status", getAnalysisStatus);
router.get("/token/:token/results", getAnalysisResults);
router.post("/token/:token/crisis-alert", crisisAlertLimiter, requireInterviewLink, reportCrisis);

export default router;
