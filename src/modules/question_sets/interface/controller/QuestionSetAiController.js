import { sendSuccess } from "../../../../core/http/apiResponse.js";
import { asyncHandler } from "../../../../core/middleware/asyncHandler.js";
import AppError from "../../../../core/errors/AppError.js";

/**
 * Question Set AI Controller — proxies to Python AI service (Ollama / Llama 3.2:3B).
 *
 * These endpoints do NOT save to the database.
 * They return draft results for therapist review.
 * Only the standard CRUD endpoints (QuestionSetController) persist data.
 */

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8001";

/**
 * POST /api/question-sets/ai/generate
 *
 * FRONTEND → BACKEND → OLLAMA
 * Sends therapist's requirements to Llama 3.2:3B for draft question generation.
 * OLLAMA → BACKEND → FRONTEND
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

  const response = await fetch(`${AI_SERVICE_URL}/api/question-sets/ai/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: title.trim(),
      focus: focus.trim(),
      description: description?.trim() || "",
      num_questions: num_questions || 5,
      language: language || "English",
      additional_instructions: additional_instructions?.trim() || "",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 503) {
      throw new AppError(
        "AI question generation is currently unavailable. You may create the question set manually.",
        503,
        "AI_UNAVAILABLE"
      );
    }
    throw new AppError(`AI service error: ${text}`, 502, "AI_SERVICE_ERROR");
  }

  const data = await response.json();
  return sendSuccess(res, {
    statusCode: 200,
    message: "Draft questions generated",
    data,
  });
});

/**
 * POST /api/question-sets/ai/review
 *
 * FRONTEND → BACKEND → OLLAMA
 * Sends draft questions to Llama 3.2:3B for quality review.
 * OLLAMA → BACKEND → FRONTEND
 * Returns quality issues and suggested revisions.
 */
export const aiReviewQuestions = asyncHandler(async (req, res) => {
  const { questions, focus } = req.body;

  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    throw new AppError("Questions array is required", 400, "MISSING_QUESTIONS");
  }

  const response = await fetch(`${AI_SERVICE_URL}/api/question-sets/ai/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questions, focus: focus || "" }),
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 503) {
      throw new AppError(
        "AI question review is currently unavailable. Please review the questions manually.",
        503,
        "AI_UNAVAILABLE"
      );
    }
    throw new AppError(`AI service error: ${text}`, 502, "AI_SERVICE_ERROR");
  }

  const data = await response.json();
  return sendSuccess(res, {
    statusCode: 200,
    message: "Question review complete",
    data,
  });
});

/**
 * POST /api/question-sets/ai/refine
 *
 * FRONTEND → BACKEND → OLLAMA
 * Sends a single question to Llama 3.2:3B for improvement.
 * OLLAMA → BACKEND → FRONTEND
 * Returns original + revised question with explanation.
 */
export const aiRefineQuestion = asyncHandler(async (req, res) => {
  const { question_text } = req.body;

  if (!question_text?.trim()) {
    throw new AppError("Question text is required", 400, "MISSING_QUESTION_TEXT");
  }

  const response = await fetch(`${AI_SERVICE_URL}/api/question-sets/ai/refine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question_text: question_text.trim() }),
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 503) {
      throw new AppError(
        "AI question refinement is currently unavailable. Please edit the question manually.",
        503,
        "AI_UNAVAILABLE"
      );
    }
    throw new AppError(`AI service error: ${text}`, 502, "AI_SERVICE_ERROR");
  }

  const data = await response.json();
  return sendSuccess(res, {
    statusCode: 200,
    message: "Question refinement complete",
    data,
  });
});
