import express from "express";
import multer from "multer";
import { analyzeInterview, getAnalysisResults } from "./controller/EmotionAnalysisController.js";

const router = express.Router();

// Multer: store files in memory, max 50MB total
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 50 },
});

// Public routes — patient accesses via interview link token
router.post("/token/:token/analyze", upload.array("files", 50), analyzeInterview);
router.get("/token/:token/results", getAnalysisResults);

export default router;
