/**
 * EMOTION ANALYSIS CONTROLLER
 *
 * Entry point for the emotion analysis HTTP endpoints.
 *
 * Routes:
 *   POST /api/emotion/token/:token/staged-files — Early upload of finished answers
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
import { notificationService } from "../../../notifications/notificationServiceInstance.js";
import { createJobRegistry } from "../../application/analysisJobs.js";
import { createStagingStore, mergeFiles, STAGED_NAME } from "../../application/analysisStaging.js";
import AppError from "../../../../core/errors/AppError.js";
import ValidationError from "../../../../core/errors/ValidationError.js";

const interviewLinkRepo = new InterviewLinkRepo();
const sessionRepo = new SessionRepo();
const emotionService = new EmotionAnalysisService(interviewLinkRepo, sessionRepo, notificationService);
const analysisJobs = createJobRegistry();
const staging = createStagingStore();

/** `staged` form field: JSON list of file names uploaded earlier via /staged-files. */
function parseStagedNames(raw) {
  if (!raw) return [];
  let names;
  try {
    names = JSON.parse(raw);
  } catch {
    throw new ValidationError("staged must be a JSON list of file names");
  }
  if (!Array.isArray(names) || names.length > 500 || !names.every((n) => typeof n === "string" && STAGED_NAME.test(n))) {
    throw new ValidationError("staged must be a JSON list of file names");
  }
  return names;
}

/**
 * Early upload: the interview room sends each answer's recordings while the
 * patient answers the next question, so the final upload is small.
 */
export const stageFiles = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const files = req.files || [];
  if (files.length === 0) throw new ValidationError("No files uploaded");

  await emotionService.assertLink(token);
  const added = staging.add(token, files);
  if (!added.ok) throw new ValidationError(added.reason);
  return sendSuccess(res, { statusCode: 200, message: "Files received", data: { staged: added.count } });
});

export const analyzeInterview = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const stagedNames = parseStagedNames(req.body?.staged);
  const { files: stagedFiles, missing } = staging.collect(token, stagedNames);
  if (missing.length > 0) {
    // Lost (e.g. the server restarted): the browser re-sends them from its copy.
    throw new AppError("Some early-uploaded recordings are missing", 409, "STAGED_FILES_MISSING", { missing });
  }
  const files = mergeFiles(stagedFiles, req.files || []);

  if (files.length === 0) {
    return res.status(400).json({
      status: "error",
      message: "No files uploaded. Send frames (frame_N.jpg) and audio (audio_N.wav).",
    });
  }

  // Long interviews take minutes to analyse: run it as a background job and
  // answer at once. The patient's page polls GET .../analysis-status.
  await emotionService.assertLink(token);
  const { started } = analysisJobs.start(token, () => emotionService.analyzeByToken(token, files));
  staging.clear(token); // the job holds the files now
  return sendSuccess(res, {
    statusCode: 202,
    message: started ? "Analysis started" : "Analysis already in progress",
    data: { status: "processing" },
  });
});

export const getAnalysisStatus = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const job = analysisJobs.get(token);

  if (!job) {
    // No job here (e.g. the server restarted): report what the database knows.
    await emotionService.assertLink(token);
    return sendSuccess(res, { statusCode: 200, message: "No analysis running", data: { status: "not_started" } });
  }

  const elapsed_s = Math.round((Date.now() - job.startedAt) / 1000);
  if (job.status === "processing") {
    const progress = await emotionService.getProgress(token);
    return sendSuccess(res, { statusCode: 200, message: "Analysis in progress", data: { status: "processing", elapsed_s, progress } });
  }
  if (job.status === "completed") {
    return sendSuccess(res, { statusCode: 200, message: "Analysis complete", data: { status: "completed", elapsed_s, result: job.result } });
  }
  return sendSuccess(res, { statusCode: 200, message: "Analysis failed", data: { status: "failed", elapsed_s, error: job.error } });
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
