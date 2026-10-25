import { sendSuccess } from "../../../../core/http/apiResponse.js";
import { asyncHandler } from "../../../../core/middleware/asyncHandler.js";
import FollowUpRepo from "../../infrastructure/FollowUpRepo.js";
import FollowUpService from "../../application/FollowUpService.js";

const followUpRepo = new FollowUpRepo();
const followUpService = new FollowUpService(followUpRepo);

export const createFollowUp = asyncHandler(async (req, res) => {
  const result = await followUpService.create(req.user.id, req.body);
  return sendSuccess(res, {
    statusCode: 201,
    message: "Follow-up created",
    data: result,
  });
});

export const getFollowUp = asyncHandler(async (req, res) => {
  const result = await followUpService.getById(req.user.id, req.params.id);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Follow-up fetched",
    data: result,
  });
});

export const getPatientFollowUps = asyncHandler(async (req, res) => {
  const result = await followUpService.getByPatientId(req.user.id, req.params.patientId);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Patient follow-ups fetched",
    data: result,
  });
});

export const getFollowUps = asyncHandler(async (req, res) => {
  const { status, page, limit } = req.query;
  const result = await followUpService.getAll(req.user.id, {
    status,
    page: page ? parseInt(page) : 1,
    limit: limit ? parseInt(limit) : 50,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: "Follow-ups fetched",
    data: result,
  });
});

export const getUpcomingFollowUps = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit) : 10;
  const result = await followUpService.getUpcoming(req.user.id, limit);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Upcoming follow-ups fetched",
    data: result,
  });
});

export const getDueTodayFollowUps = asyncHandler(async (req, res) => {
  const result = await followUpService.getDueToday(req.user.id);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Due today follow-ups fetched",
    data: result,
  });
});

export const getFollowUpCounts = asyncHandler(async (req, res) => {
  const result = await followUpService.getCounts(req.user.id);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Follow-up counts fetched",
    data: result,
  });
});

export const updateFollowUp = asyncHandler(async (req, res) => {
  const result = await followUpService.update(req.user.id, req.params.id, req.body);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Follow-up updated",
    data: result,
  });
});

export const deleteFollowUp = asyncHandler(async (req, res) => {
  await followUpService.remove(req.user.id, req.params.id);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Follow-up removed",
  });
});