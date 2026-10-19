import CustomQuestionService from "../../application/CustomQuestionService.js";
import { sendSuccess } from "../../../../core/http/apiResponse.js";

const service = new CustomQuestionService();

export async function createQuestion(req, res, next) {
  try {
    const question = await service.create(req.user.id, req.body);
    return sendSuccess(res, { statusCode: 201, message: "Custom question created", data: question });
  } catch (error) {
    next(error);
  }
}

export async function getQuestions(req, res, next) {
  try {
    const questions = await service.getAll(req.user.id);
    return sendSuccess(res, { statusCode: 200, message: "Custom questions retrieved", data: questions });
  } catch (error) {
    next(error);
  }
}

export async function getQuestion(req, res, next) {
  try {
    const question = await service.getById(req.user.id, Number(req.params.id));
    return sendSuccess(res, { statusCode: 200, message: "Custom question retrieved", data: question });
  } catch (error) {
    next(error);
  }
}

export async function updateQuestion(req, res, next) {
  try {
    const question = await service.update(req.user.id, Number(req.params.id), req.body);
    return sendSuccess(res, { statusCode: 200, message: "Custom question updated", data: question });
  } catch (error) {
    next(error);
  }
}

export async function deactivateQuestion(req, res, next) {
  try {
    const question = await service.deactivate(req.user.id, Number(req.params.id));
    return sendSuccess(res, { statusCode: 200, message: "Custom question deactivated", data: question });
  } catch (error) {
    next(error);
  }
}

export async function deleteQuestion(req, res, next) {
  try {
    const result = await service.remove(req.user.id, Number(req.params.id));
    return sendSuccess(res, { statusCode: 200, message: "Custom question deleted", data: result });
  } catch (error) {
    next(error);
  }
}