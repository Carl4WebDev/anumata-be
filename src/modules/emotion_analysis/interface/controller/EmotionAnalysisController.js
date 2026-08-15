/**
 * EMOTION ANALYSIS CONTROLLER
 *
 * Entry point for the emotion analysis HTTP endpoints.
 *
 * Routes:
 *   POST /api/emotion/token/:token/analyze — Patient submits interview files
 *   GET  /api/emotion/token/:token/results — Retrieve existing analysis results
 *
 * DATA FLOW:
 *   Frontend (FormData with files) → multer → THIS CONTROLLER → EmotionAnalysisService → Python AI → PostgreSQL
 *
 * The analyze endpoint is PUBLIC (no auth) — patients submit via token.
 * The results endpoint is also PUBLIC — used by the patient results page.
 */

import { sendSuccess } from "../../../../core/http/apiResponse.js";
import { asyncHandler } from "../../../../core/middleware/asyncHandler.js";
import EmotionAnalysisService from "../../application/EmotionAnalysisService.js";
import InterviewLinkRepo from "../../../interview_links/infrastructure/InterviewLinkRepo.js";
import SessionRepo from "../../../sessions/infrastructure/SessionRepo.js";

const interviewLinkRepo = new InterviewLinkRepo();
const sessionRepo = new SessionRepo();
const emotionService = new EmotionAnalysisService(interviewLinkRepo, sessionRepo);

export const analyzeInterview = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const files = req.files || [];

  if (files.length === 0) {
    return res.status(400).json({
      status: "error",
      message: "No files uploaded. Send frames (frame_N.jpg) and audio (audio_N.wav).",
    });
  }

  const result = await emotionService.analyzeByToken(token, files);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Analysis complete",
    data: result,
  });
});

export const getAnalysisResults = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const result = await emotionService.getResultsByToken(token);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Results fetched",
    data: result,
  });
});
