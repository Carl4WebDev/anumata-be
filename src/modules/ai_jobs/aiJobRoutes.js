import { Router } from "express";
import authMiddleware from "../../core/middleware/Auth.js";
import { requireTherapist } from "../../core/middleware/requireUser.js";
import { asyncHandler } from "../../core/middleware/asyncHandler.js";
import { sendSuccess } from "../../core/http/apiResponse.js";
import { aiJobs } from "./aiJobs.js";

// Therapist-only; a job is visible only to the therapist who started it.
// Mount: app.use("/api/ai-jobs", aiJobRoutes)
const router = Router();

router.use(authMiddleware, requireTherapist);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = aiJobs.status(req.params.id, req.user.id);
    return sendSuccess(res, { statusCode: 200, message: `AI request ${data.status}`, data });
  }),
);

export default router;
