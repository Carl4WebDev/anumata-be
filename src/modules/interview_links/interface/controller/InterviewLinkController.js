import { sendSuccess } from "../../../../core/http/apiResponse.js";
import { asyncHandler } from "../../../../core/middleware/asyncHandler.js";
import InterviewLinkRepo from "../../infrastructure/InterviewLinkRepo.js";
import InterviewLinkService from "../../application/InterviewLinkService.js";
import PatientRepo from "../../../patients/infrastructure/PatientRepo.js";
import QuestionSetRepo from "../../../question_sets/infrastructure/QuestionSetRepo.js";

const interviewLinkRepo = new InterviewLinkRepo();
const patientRepo = new PatientRepo();
const questionSetRepo = new QuestionSetRepo();
const service = new InterviewLinkService(interviewLinkRepo, patientRepo, questionSetRepo);

export const createInterviewLink = asyncHandler(async (req, res) => {
  const result = await service.create(req.user.id, req.body);
  return sendSuccess(res, {
    statusCode: 201,
    message: "Interview link generated",
    data: result,
  });
});

export const getInterviewLinks = asyncHandler(async (req, res) => {
  const { status, page, limit } = req.query;
  const result = await service.getAll(req.user.id, {
    status,
    page: page ? parseInt(page) : 1,
    limit: limit ? parseInt(limit) : 20,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: "Interview links fetched",
    data: result.links,
    meta: { total: result.total, page: result.page, limit: result.limit },
  });
});

export const getInterviewLinkByToken = asyncHandler(async (req, res) => {
  const result = await service.getByToken(req.params.token);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Interview link fetched",
    data: result,
  });
});

export const updateInterviewLinkStatus = asyncHandler(async (req, res) => {
  const result = await service.updateStatus(req.user.id, req.params.id, req.body.status);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Status updated",
    data: result,
  });
});

export const startInterview = asyncHandler(async (req, res) => {
  const result = await service.startInterview(req.params.token);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Interview started",
    data: result,
  });
});

export const completeInterview = asyncHandler(async (req, res) => {
  const result = await service.completeInterview(req.params.token);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Interview completed",
    data: result,
  });
});

export const deleteInterviewLink = asyncHandler(async (req, res) => {
  await service.remove(req.user.id, req.params.id);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Interview link removed",
  });
});
