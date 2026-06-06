import express from "express";
import {
  createQuestionSet,
  getQuestionSets,
  getQuestionSet,
  updateQuestionSet,
  deleteQuestionSet,
} from "./controller/QuestionSetController.js";

import authMiddleware from "../../../core/middleware/Auth.js";
import { requireTherapist } from "../../../core/middleware/requireUser.js";

const router = express.Router();

router.use(authMiddleware, requireTherapist);

router.post("/", createQuestionSet);
router.get("/", getQuestionSets);
router.get("/:id", getQuestionSet);
router.patch("/:id", updateQuestionSet);
router.delete("/:id", deleteQuestionSet);

export default router;
