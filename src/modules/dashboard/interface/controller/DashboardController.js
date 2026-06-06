import { sendSuccess } from "../../../../core/http/apiResponse.js";
import { asyncHandler } from "../../../../core/middleware/asyncHandler.js";
import DashboardRepo from "../../infrastructure/DashboardRepo.js";
import DashboardService from "../../application/DashboardService.js";

const repo = new DashboardRepo();
const service = new DashboardService(repo);

export const getDashboardStats = asyncHandler(async (req, res) => {
  const result = await service.getStats(req.user.id);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Dashboard stats fetched",
    data: result,
  });
});
