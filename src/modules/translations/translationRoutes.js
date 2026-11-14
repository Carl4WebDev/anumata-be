import express from "express";
import authMiddleware from "../../core/middleware/Auth.js";
import { requireTherapist } from "../../core/middleware/requireUser.js";
import { asyncHandler } from "../../core/middleware/asyncHandler.js";
import { sendSuccess } from "../../core/http/apiResponse.js";
import { translateLimiter } from "../../core/middleware/PublicApiRateLimiter.js";
import { AI_SERVICE_URL, aiServiceHeaders } from "../../core/http/aiService.js";
import InterviewLinkRepo from "../interview_links/infrastructure/InterviewLinkRepo.js";
import QuestionSetRepo from "../question_sets/infrastructure/QuestionSetRepo.js";
import TranslationRepo from "./infrastructure/TranslationRepo.js";
import TranslationService from "./application/TranslationService.js";

/** The AI service's translator (Ollama). Returns null on any failure. */
async function translateWithAI(text, target) {
  try {
    const response = await fetch(`${AI_SERVICE_URL}/api/ai/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...aiServiceHeaders() },
      body: JSON.stringify({ text, target }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json();
    return response.ok && data?.ok && data?.translated ? String(data.translated) : null;
  } catch {
    return null;
  }
}

const service = new TranslationService(new TranslationRepo(), new InterviewLinkRepo(), new QuestionSetRepo(), translateWithAI);
const router = express.Router();

// ── Interview room (public, by interview token) ─────────────────────────────
router.get(
  "/interview/:token",
  asyncHandler(async (req, res) =>
    sendSuccess(res, { data: { translations: await service.forInterview(req.params.token, req.query.lang) } }),
  ),
);

router.post(
  "/interview/:token",
  translateLimiter,
  asyncHandler(async (req, res) =>
    sendSuccess(res, { data: await service.translateForInterview(req.params.token, req.body?.text, req.body?.lang) }),
  ),
);

// ── Therapist: review and edit a question set's translations ────────────────
router.get(
  "/question-sets/:id",
  authMiddleware,
  requireTherapist,
  asyncHandler(async (req, res) => sendSuccess(res, { data: await service.forQuestionSet(req.user.id, req.params.id) })),
);

router.put(
  "/question-sets/:id",
  authMiddleware,
  requireTherapist,
  asyncHandler(async (req, res) =>
    sendSuccess(res, {
      message: "Translation saved",
      data: await service.saveForQuestionSet(req.user.id, req.params.id, req.body ?? {}),
    }),
  ),
);

export default router;
