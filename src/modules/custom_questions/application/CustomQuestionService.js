import CustomQuestionRepo from "../infrastructure/CustomQuestionRepo.js";
import AppError from "../../../core/errors/AppError.js";

export default class CustomQuestionService {
  constructor() {
    this.repo = new CustomQuestionRepo();
  }

  async create(therapistId, data) {
    if (!data.text || !data.text.trim()) {
      throw new AppError("Question text is required", 400, "VALIDATION_ERROR");
    }
    if (data.text.length > 2000) {
      throw new AppError("Question text must be 2000 characters or less", 400, "VALIDATION_ERROR");
    }
    return this.repo.create({
      therapist_id: therapistId,
      text: data.text.trim(),
      category: data.category,
    });
  }

  async getAll(therapistId) {
    return this.repo.findByTherapistId(therapistId);
  }

  async getById(therapistId, id) {
    const question = await this.repo.findById(id);
    if (!question) {
      throw new AppError("Custom question not found", 404, "NOT_FOUND");
    }
    if (question.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }
    return question;
  }

  async update(therapistId, id, data) {
    const question = await this.repo.findById(id);
    if (!question) {
      throw new AppError("Custom question not found", 404, "NOT_FOUND");
    }
    if (question.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }
    if (data.text !== undefined) {
      if (!data.text.trim()) {
        throw new AppError("Question text cannot be empty", 400, "VALIDATION_ERROR");
      }
      if (data.text.length > 2000) {
        throw new AppError("Question text must be 2000 characters or less", 400, "VALIDATION_ERROR");
      }
      data.text = data.text.trim();
    }
    return this.repo.update(id, data);
  }

  async deactivate(therapistId, id) {
    const question = await this.repo.findById(id);
    if (!question) {
      throw new AppError("Custom question not found", 404, "NOT_FOUND");
    }
    if (question.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }
    return this.repo.deactivate(id);
  }

  async remove(therapistId, id) {
    const question = await this.repo.findById(id);
    if (!question) {
      throw new AppError("Custom question not found", 404, "NOT_FOUND");
    }
    if (question.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }
    return this.repo.remove(id);
  }
}