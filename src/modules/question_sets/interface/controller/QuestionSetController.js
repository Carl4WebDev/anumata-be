import { sendSuccess } from "../../../../core/http/apiResponse.js";
import { asyncHandler } from "../../../../core/middleware/asyncHandler.js";
import QuestionSetRepo from "../../infrastructure/QuestionSetRepo.js";
import QuestionSetService from "../../application/QuestionSetService.js";

const repo = new QuestionSetRepo();
const service = new QuestionSetService(repo);

export const createQuestionSet = asyncHandler(async (req, res) => {
  const result = await service.create(req.user.id, req.body);
  return sendSuccess(res, {
    statusCode: 201,
    message: "Question set created",
    data: result,
  });
});

export const getQuestionSets = asyncHandler(async (req, res) => {
  const result = await service.getAll(req.user.id);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Question sets fetched",
    data: result,
  });
});

export const getQuestionSet = asyncHandler(async (req, res) => {
  const result = await service.getById(req.user.id, req.params.id);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Question set fetched",
    data: result,
  });
});

export const updateQuestionSet = asyncHandler(async (req, res) => {
  const result = await service.update(req.user.id, req.params.id, req.body);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Question set updated",
    data: result,
  });
});

export const deleteQuestionSet = asyncHandler(async (req, res) => {
  await service.remove(req.user.id, req.params.id);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Question set removed",
  });
});
