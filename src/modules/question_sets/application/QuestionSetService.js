import AppError from "../../../core/errors/AppError.js";
import NotFoundError from "../../../core/errors/NotFoundError.js";
import { validateQuestionSet, validateQuestionSetUpdate } from "./validators/questionSetValidator.js";

export default class QuestionSetService {
  constructor(questionSetRepo) {
    this.questionSetRepo = questionSetRepo;
  }

  async create(therapistId, data) {
    const validated = validateQuestionSet(data);

    return this.questionSetRepo.create({
      ...validated,
      therapist_id: therapistId,
    });
  }

  async getById(therapistId, id) {
    const qs = await this.questionSetRepo.findById(id);

    if (!qs) {
      throw new NotFoundError("Question set not found");
    }

    if (qs.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    return qs;
  }

  async getAll(therapistId) {
    return this.questionSetRepo.findByTherapistId(therapistId);
  }

  async update(therapistId, id, data) {
    const validated = validateQuestionSetUpdate(data);

    if (Object.keys(validated).length === 0) {
      throw new AppError("No fields to update", 400, "NO_FIELDS");
    }

    const qs = await this.questionSetRepo.findById(id);

    if (!qs) {
      throw new NotFoundError("Question set not found");
    }

    if (qs.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    return this.questionSetRepo.update(id, validated);
  }

  async remove(therapistId, id) {
    const qs = await this.questionSetRepo.findById(id);

    if (!qs) {
      throw new NotFoundError("Question set not found");
    }

    if (qs.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    return this.questionSetRepo.remove(id);
  }
}
