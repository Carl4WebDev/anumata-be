import { Router } from "express";
import authMiddleware from "../../../core/middleware/Auth.js";
import { getAllQuestions, getQuestion } from "./controller/StandardizedQuestionController.js";

const router = Router();

router.get("/", authMiddleware, getAllQuestions);
router.get("/:id", authMiddleware, getQuestion);

export default router;