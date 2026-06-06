import { sendSuccess } from "../../../../core/http/apiResponse.js";
import { asyncHandler } from "../../../../core/middleware/asyncHandler.js";
import SessionRepo from "../../infrastructure/SessionRepo.js";
import SessionService from "../../application/SessionService.js";
import InterviewLinkRepo from "../../../interview_links/infrastructure/InterviewLinkRepo.js";

const sessionRepo = new SessionRepo();
const interviewLinkRepo = new InterviewLinkRepo();
const sessionService = new SessionService(sessionRepo, interviewLinkRepo);

export const createSession = asyncHandler(async (req, res) => {
  const result = await sessionService.create(req.user.id, req.body);
  return sendSuccess(res, {
    statusCode: 201,
    message: "Session recorded",
    data: result,
  });
});

export const getSessions = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await sessionService.getAll(req.user.id, {
    page: page ? parseInt(page) : 1,
    limit: limit ? parseInt(limit) : 20,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: "Sessions fetched",
    data: result.sessions,
    meta: { total: result.total, page: result.page, limit: result.limit },
  });
});

export const getSession = asyncHandler(async (req, res) => {
  const result = await sessionService.getById(req.user.id, req.params.id);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Session fetched",
    data: result,
  });
});

export const getPatientSessions = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await sessionService.getByPatientId(req.user.id, req.params.patientId, {
    page: page ? parseInt(page) : 1,
    limit: limit ? parseInt(limit) : 20,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: "Patient sessions fetched",
    data: result.sessions,
    meta: { total: result.total, page: result.page, limit: result.limit },
  });
});

export const updateSessionNotes = asyncHandler(async (req, res) => {
  const result = await sessionService.updateNotes(req.user.id, req.params.id, req.body);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Notes updated",
    data: result,
  });
});

export const deleteSession = asyncHandler(async (req, res) => {
  await sessionService.remove(req.user.id, req.params.id);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Session removed",
  });
});
