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

// Public routes — patient accesses via interview link token
router.post("/token/:token/analyze", upload.array("files", 500), analyzeInterview);
router.get("/token/:token/results", getAnalysisResults);

export default router;
