import { asyncHandler } from "../../../../core/middleware/asyncHandler.js";
import AppError from "../../../../core/errors/AppError.js";
import { aiJobs, AI_REQUEST_TIMEOUT_MS } from "../../../ai_jobs/aiJobs.js";
import { postJson } from "../../../../core/http/httpPost.js";
import { AI_SERVICE_URL, aiServiceHeaders } from "../../../../core/http/aiService.js";

/**
 * Question Set AI Controller — proxies to Python AI service (Ollama / Llama 3.2:3B).
 *
 * These endpoints do NOT save to the database.
 * They return draft results for therapist review.
 * Only the standard CRUD endpoints (QuestionSetController) persist data.
 *
 * The AI can take minutes, so each request runs as a background job: the
 * endpoint answers 202 { job_id } and the page polls GET /api/ai-jobs/:id.
 */

/** POST to the AI service; a 503 there means the AI is off → `unavailableMessage`. */
async function callQuestionSetAi(path, body, unavailableMessage) {
  const response = await postJson(`${AI_SERVICE_URL}/api/question-sets/ai/${path}`, body, {
    timeoutMs: AI_REQUEST_TIMEOUT_MS,
    headers: aiServiceHeaders(),
  });

  if (!response.ok) {
    if (response.status === 503) {
      throw new AppError(unavailableMessage, 503, "AI_UNAVAILABLE");
    }
    throw new AppError(`AI service error: ${response.text}`, 502, "AI_SERVICE_ERROR");
  }

  return JSON.parse(response.text);
}

/**
 * POST /api/question-sets/ai/generate
 *
 * FRONTEND → BACKEND → OLLAMA
 * Sends therapist's requirements to Llama 3.2:3B for draft question generation.
 * OLLAMA → BACKEND → FRONTEND (via the job)
 * Returns validated draft questions for therapist review.
 */
export const aiGenerateQuestions = asyncHandler(async (req, res) => {
  const { title, focus, description, num_questions, language, additional_instructions } = req.body;

  if (!title?.trim()) {
    throw new AppError("Title is required", 400, "MISSING_TITLE");
  }
  if (!focus?.trim()) {
    throw new AppError("Focus/topic is required", 400, "MISSING_FOCUS");
  }

  const body = {
    title: title.trim(),
    focus: focus.trim(),
    description: description?.trim() || "",
    num_questions: num_questions || 5,
    language: language || "English",
    additional_instructions: additional_instructions?.trim() || "",
  };
  return aiJobs.start(res, {
    userId: req.user.id,
    run: () =>
      callQuestionSetAi("generate", body, "AI question generation is currently unavailable. You may create the question set manually."),
  });
});

/**
 * POST /api/question-sets/ai/review
 *
 * FRONTEND → BACKEND → OLLAMA
 * Sends draft questions to Llama 3.2:3B for quality review.
 * OLLAMA → BACKEND → FRONTEND (via the job)
 * Returns quality issues and suggested revisions.
 */
export const aiReviewQuestions = asyncHandler(async (req, res) => {
  const { questions, focus } = req.body;

  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    throw new AppError("Questions array is required", 400, "MISSING_QUESTIONS");
  }

  return aiJobs.start(res, {
    userId: req.user.id,
    run: () =>
      callQuestionSetAi(
        "review",
        { questions, focus: focus || "" },
        "AI question review is currently unavailable. Please review the questions manually.",
      ),
  });
});

/**
 * POST /api/question-sets/ai/refine
 *
 * FRONTEND → BACKEND → OLLAMA
 * Sends a single question to Llama 3.2:3B for improvement.
 * OLLAMA → BACKEND → FRONTEND (via the job)
 * Returns original + revised question with explanation.
 */
export const aiRefineQuestion = asyncHandler(async (req, res) => {
  const { question_text } = req.body;

  if (!question_text?.trim()) {
    throw new AppError("Question text is required", 400, "MISSING_QUESTION_TEXT");
  }

  return aiJobs.start(res, {
    userId: req.user.id,
    run: () =>
      callQuestionSetAi(
        "refine",
        { question_text: question_text.trim() },
        "AI question refinement is currently unavailable. Please edit the question manually.",
      ),
  });
});
