import express from "express";
import multer from "multer";
import { analyzeInterview, getAnalysisResults } from "./controller/EmotionAnalysisController.js";

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

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8001";

router.post("/stt/transcribe", sttUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: "error", message: "No audio file provided" });
    }

    const formData = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
    formData.append("file", blob, req.file.originalname);

    const response = await fetch(`${AI_SERVICE_URL}/api/stt/transcribe`, {
      method: "POST",
      body: formData,
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
router.post("/token/:token/analyze", upload.array("files", 500), analyzeInterview);
router.get("/token/:token/results", getAnalysisResults);

export default router;
