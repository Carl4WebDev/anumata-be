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

import errorHandler from "./core/middleware/errorHandler.js";
import notFoundHandler from "./core/middleware/notFoundHandler.js";
import healthRoute from "./core/http/healthRoutes.js";

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

// Protected routes
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/question-sets", questionSetRoutes);
app.use("/api/sessions", sessionRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);
