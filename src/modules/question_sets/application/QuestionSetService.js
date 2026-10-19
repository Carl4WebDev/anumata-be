import AppError from "../../../core/errors/AppError.js";
import NotFoundError from "../../../core/errors/NotFoundError.js";
import { validateQuestionSet, validateQuestionSetUpdate } from "./validators/questionSetValidator.js";

export default class QuestionSetService {
  constructor(questionSetRepo, standardizedQuestionRepo = null, customQuestionRepo = null) {
    this.questionSetRepo = questionSetRepo;
    this.standardizedQuestionRepo = standardizedQuestionRepo;
    this.customQuestionRepo = customQuestionRepo;
  }

  async create(therapistId, data) {
    const validated = validateQuestionSet(data);

    return this.questionSetRepo.create({
      ...validated,
      therapist_id: therapistId,
    });
  }

  async createWithItems(therapistId, data) {
    if (!data.name || !data.name.trim()) {
      throw new AppError("Question set name is required", 400, "VALIDATION_ERROR");
    }
    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      throw new AppError("At least one question item is required", 400, "VALIDATION_ERROR");
    }
    if (data.items.length > 20) {
      throw new AppError("Maximum 20 questions per set", 400, "VALIDATION_ERROR");
    }

    const items = [];
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];

      if (item.source_type === "standardized") {
        if (!this.standardizedQuestionRepo) {
          throw new AppError("Standardized questions not available", 500, "INTERNAL_ERROR");
        }
        const sq = await this.standardizedQuestionRepo.findById(item.standardized_question_id);
        if (!sq) {
          throw new AppError(`Standardized question ${item.standardized_question_id} not found`, 404, "NOT_FOUND");
        }
        items.push({
          source_type: "standardized",
          standardized_question_id: sq.id,
          custom_question_id: null,
          question_text_snapshot: sq.text,
          display_order: i + 1,
        });
      } else if (item.source_type === "custom") {
        if (!this.customQuestionRepo) {
          throw new AppError("Custom questions not available", 500, "INTERNAL_ERROR");
        }
        const cq = await this.customQuestionRepo.findById(item.custom_question_id);
        if (!cq) {
          throw new AppError(`Custom question ${item.custom_question_id} not found`, 404, "NOT_FOUND");
        }
        if (cq.therapist_id !== therapistId) {
          throw new AppError("Access denied to custom question", 403, "FORBIDDEN");
        }
        items.push({
          source_type: "custom",
          standardized_question_id: null,
          custom_question_id: cq.id,
          question_text_snapshot: cq.text,
          display_order: i + 1,
        });
      } else {
        throw new AppError("Invalid source_type. Must be 'standardized' or 'custom'", 400, "VALIDATION_ERROR");
      }
    }

    // Determine source_type for the set
    const hasStandardized = items.some((i) => i.source_type === "standardized");
    const hasCustom = items.some((i) => i.source_type === "custom");
    const sourceType = hasStandardized && hasCustom ? "mixed" : hasStandardized ? "standardized" : "custom";

    return this.questionSetRepo.createWithItems(
      {
        therapist_id: therapistId,
        name: data.name.trim(),
        description: data.description || "",
        source_type: sourceType,
      },
      items,
    );
  }

  async getItems(therapistId, setId) {
    const qs = await this.questionSetRepo.findById(setId);
    if (!qs) {
      throw new NotFoundError("Question set not found");
    }
    if (qs.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }
    return this.questionSetRepo.findItemsBySetId(setId);
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
