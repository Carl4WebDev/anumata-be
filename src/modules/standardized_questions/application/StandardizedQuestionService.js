import StandardizedQuestionRepo from "../infrastructure/StandardizedQuestionRepo.js";
import AppError from "../../../core/errors/AppError.js";

export default class StandardizedQuestionService {
  constructor() {
    this.repo = new StandardizedQuestionRepo();
  }

  async getAll() {
    return this.repo.findAll();
  }

  async getById(id) {
    const question = await this.repo.findById(id);
    if (!question) {
      throw new AppError("Standardized question not found", 404, "NOT_FOUND");
    }
    return question;
  }

  async getByCategory(category) {
    return this.repo.findByCategory(category);
  }
}