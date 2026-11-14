import express from "express";
import authMiddleware from "../../../core/middleware/Auth.js";
import { requireAdmin, forgetAccount } from "../../../core/middleware/requireUser.js";
import { asyncHandler } from "../../../core/middleware/asyncHandler.js";
import { sendSuccess } from "../../../core/http/apiResponse.js";
import AdminRepo from "../infrastructure/AdminRepo.js";
import AdminService from "../application/AdminService.js";
import { notificationService } from "../../notifications/notificationServiceInstance.js";

const service = new AdminService(new AdminRepo(), notificationService, forgetAccount);
const router = express.Router();

router.use(authMiddleware, requireAdmin);

router.get(
  "/usage",
  asyncHandler(async (req, res) => sendSuccess(res, { data: await service.usage() })),
);

router.get(
  "/therapists",
  asyncHandler(async (req, res) =>
    sendSuccess(res, { data: await service.overview({ status: req.query.status, search: req.query.search }) }),
  ),
);

router.get(
  "/therapists/:id",
  asyncHandler(async (req, res) => sendSuccess(res, { data: await service.therapist(Number(req.params.id)) })),
);

router.patch(
  "/therapists/:id/license",
  asyncHandler(async (req, res) =>
    sendSuccess(res, {
      message: "License status saved",
      data: await service.setLicense(req.user.id, Number(req.params.id), req.body ?? {}),
    }),
  ),
);

router.patch(
  "/therapists/:id/active",
  asyncHandler(async (req, res) =>
    sendSuccess(res, {
      message: req.body?.active ? "Account reactivated" : "Account deactivated",
      data: await service.setActive(req.user.id, Number(req.params.id), req.body ?? {}),
    }),
  ),
);

export default router;
