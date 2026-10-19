import express from "express";
import {
  createQuestionSet,
  getQuestionSets,
  getQuestionSet,
  updateQuestionSet,
  deleteQuestionSet,
  createQuestionSetWithItems,
  getQuestionSetItems,
} from "./controller/QuestionSetController.js";
import {
  aiGenerateQuestions,
  aiReviewQuestions,
  aiRefineQuestion,
} from "./controller/QuestionSetAiController.js";

import authMiddleware from "../../../core/middleware/Auth.js";
import { requireTherapist } from "../../../core/middleware/requireUser.js";

const router = express.Router();

router.use(authMiddleware, requireTherapist);

// AI-assisted question set development
// These proxy to the Python AI service (Ollama / Llama 3.2:3B)
router.post("/ai/generate", aiGenerateQuestions);
router.post("/ai/review", aiReviewQuestions);
router.post("/ai/refine", aiRefineQuestion);

// Standard CRUD
router.post("/", createQuestionSet);
router.post("/with-items", createQuestionSetWithItems);
router.get("/", getQuestionSets);
router.get("/:id", getQuestionSet);
router.get("/:id/items", getQuestionSetItems);
router.patch("/:id", updateQuestionSet);
router.delete("/:id", deleteQuestionSet);

export default router;
