import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import authMiddleware from "./core/middleware/Auth.js";

import userRoutes from "./modules/users/interface/userRoutes.js";
import patientRoutes from "./modules/patients/interface/patientRoutes.js";
import questionSetRoutes from "./modules/question_sets/interface/questionSetRoutes.js";
import interviewLinkRoutes from "./modules/interview_links/interface/interviewLinkRoutes.js";
import sessionRoutes from "./modules/sessions/interface/sessionRoutes.js";
import emotionAnalysisRoutes from "./modules/emotion_analysis/interface/emotionAnalysisRoutes.js";
import dashboardRoutes from "./modules/dashboard/interface/dashboardRoutes.js";
import standardizedQuestionRoutes from "./modules/standardized_questions/interface/standardizedQuestionRoutes.js";
import customQuestionRoutes from "./modules/custom_questions/interface/customQuestionRoutes.js";
import followUpRoutes from "./modules/follow_ups/interface/followUpRoutes.js";
import appointmentRoutes from "./modules/appointments/interface/appointmentRoutes.js";
import notificationRoutes from "./modules/notifications/interface/notificationRoutes.js";
import aiJobRoutes from "./modules/ai_jobs/aiJobRoutes.js";
import adminRoutes from "./modules/admin/interface/adminRoutes.js";
import liveRoutes from "./modules/live/liveRoutes.js";
import translationRoutes from "./modules/translations/translationRoutes.js";

import multer from "multer";
import errorHandler from "./core/middleware/errorHandler.js";
import notFoundHandler from "./core/middleware/notFoundHandler.js";
import healthRoute from "./core/http/healthRoutes.js";
import { sttLimiter, translateLimiter } from "./core/middleware/PublicApiRateLimiter.js";

import { AI_SERVICE_URL, aiServiceHeaders } from "./core/http/aiService.js";
const sttUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

dotenv.config();

const app = express();
app.set("trust proxy", 1);
export default app;

// CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : [];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

// Security & parsing
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health check
app.use(healthRoute);

// Public routes
app.use("/api/auth", userRoutes);

// Public interview routes (client opens link)
app.use("/api/interview-links", interviewLinkRoutes);

// Public emotion analysis routes (patient submits media via token)
app.use("/api/emotion", emotionAnalysisRoutes);

// Public STT proxy — forwards audio to Python AI service for Whisper transcription
app.post("/api/stt/transcribe", sttLimiter, sttUpload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No audio file provided" });
    const formData = new FormData();
    formData.append("file", new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname || "audio.webm");
    // Optional: purpose=caption (fast live-caption mode), language_hint=en|tl|ceb.
    const { purpose, language_hint } = req.body || {};
    if (purpose === "caption" || purpose === "rapport") formData.append("purpose", purpose);
    if (["en", "tl", "ceb"].includes(language_hint)) formData.append("language_hint", language_hint);
    const response = await fetch(`${AI_SERVICE_URL}/api/stt/transcribe`, {
      method: "POST",
      headers: aiServiceHeaders(),
      body: formData,
      signal: AbortSignal.timeout(60000),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json({ status: "ok", data });
  } catch (err) {
    next(err);
  }
});

// Public question translation proxy — translates interview questions to the
// patient's language via the Python AI service (Ollama). Failure returns ok:false
// and the interview continues in English.
app.post("/api/ai/translate", translateLimiter, async (req, res, next) => {
  try {
    const { text, target } = req.body || {};
    if (typeof text !== "string" || text.length > 2000 || !["tl", "ceb"].includes(target)) {
      return res.status(400).json({ status: "error", message: "text and target (tl|ceb) required" });
    }
    const response = await fetch(`${AI_SERVICE_URL}/api/ai/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...aiServiceHeaders() },
      body: JSON.stringify({ text, target }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json({ status: "ok", data });
  } catch (err) {
    next(err);
  }
});

// Protected routes
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/question-sets", questionSetRoutes);
app.use("/api/standardized-questions", standardizedQuestionRoutes);
app.use("/api/custom-questions", customQuestionRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/follow-ups", followUpRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/ai-jobs", aiJobRoutes);
// Admin: therapist accounts and PRC license checks (account data only, no patient data)
app.use("/api/admin", adminRoutes);
// Live viewing: which interviews are live now (the video itself goes over WebRTC, see modules/live)
app.use("/api/live", liveRoutes);
// Saved Tagalog/Bisaya translations of interview questions (interview room + therapist review)
app.use("/api/translations", translationRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);
