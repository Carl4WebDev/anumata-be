import StandardizedQuestionService from "../../application/StandardizedQuestionService.js";
import { sendSuccess } from "../../../../core/http/apiResponse.js";

const service = new StandardizedQuestionService();

export async function getAllQuestions(req, res, next) {
  try {
    const { category } = req.query;
    const questions = category
      ? await service.getByCategory(category)
      : await service.getAll();
    return sendSuccess(res, { statusCode: 200, message: "Standardized questions retrieved", data: questions });
  } catch (error) {
    next(error);
  }
}

export async function getQuestion(req, res, next) {
  try {
    const question = await service.getById(Number(req.params.id));
    return sendSuccess(res, { statusCode: 200, message: "Standardized question retrieved", data: question });
  } catch (error) {
    next(error);
  }
}