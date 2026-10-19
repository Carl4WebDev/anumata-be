import { Router } from "express";
import authMiddleware from "../../../core/middleware/Auth.js";
import {
  createQuestion,
  getQuestions,
  getQuestion,
  updateQuestion,
  deactivateQuestion,
  deleteQuestion,
} from "./controller/CustomQuestionController.js";

const router = Router();

router.post("/", authMiddleware, createQuestion);
router.get("/", authMiddleware, getQuestions);
router.get("/:id", authMiddleware, getQuestion);
router.patch("/:id", authMiddleware, updateQuestion);
router.patch("/:id/deactivate", authMiddleware, deactivateQuestion);
router.delete("/:id", authMiddleware, deleteQuestion);

export default router;