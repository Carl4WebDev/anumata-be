import express from "express";
import { getDashboardStats } from "./controller/DashboardController.js";

import authMiddleware from "../../../core/middleware/Auth.js";
import { requireTherapist } from "../../../core/middleware/requireUser.js";

const router = express.Router();

router.get("/stats", authMiddleware, requireTherapist, getDashboardStats);

export default router;
