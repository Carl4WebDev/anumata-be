import crypto from "crypto";
import AppError from "../../../core/errors/AppError.js";
import NotFoundError from "../../../core/errors/NotFoundError.js";
import { validateCreateInterviewLink } from "./validators/interviewLinkValidator.js";

export default class InterviewLinkService {
  constructor(interviewLinkRepo, patientRepo, questionSetRepo) {
    this.interviewLinkRepo = interviewLinkRepo;
    this.patientRepo = patientRepo;
    this.questionSetRepo = questionSetRepo;
  }

  async create(therapistId, data) {
    const validated = validateCreateInterviewLink(data);

    const patient = await this.patientRepo.findById(validated.patient_id);
    if (!patient || patient.therapist_id !== therapistId) {
      throw new AppError("Patient not found", 404, "PATIENT_NOT_FOUND");
    }

    const qs = await this.questionSetRepo.findById(validated.question_set_id);
    if (!qs || qs.therapist_id !== therapistId) {
      throw new AppError("Question set not found", 404, "QUESTION_SET_NOT_FOUND");
    }

    const token = crypto.randomUUID();

    // Try to get items from question_set_items (new system)
    let snapshots = [];
    if (this.questionSetRepo.findItemsBySetId) {
      const items = await this.questionSetRepo.findItemsBySetId(validated.question_set_id);
      if (items.length > 0) {
        snapshots = items.map((item) => ({
          question_text: item.question_text_snapshot,
          source_type: item.source_type,
          source_id: item.standardized_question_id || item.custom_question_id,
          display_order: item.display_order,
          snapshot_version: item.sq_version || null,
        }));
      }
    }

    // Fallback: snapshot from JSONB questions (existing sets)
    if (snapshots.length === 0 && qs.questions && qs.questions.length > 0) {
      snapshots = qs.questions.map((q, i) => ({
        question_text: typeof q === "string" ? q : q.text,
        source_type: "legacy",
        source_id: null,
        display_order: i + 1,
        snapshot_version: null,
      }));
    }

    return this.interviewLinkRepo.createWithSnapshot(
      {
        therapist_id: therapistId,
        patient_id: validated.patient_id,
        question_set_id: validated.question_set_id,
        token,
        status: "pending",
      },
      snapshots,
    );
  }

  async getByToken(token) {
    const link = await this.interviewLinkRepo.findByToken(token);

    if (!link) {
      throw new NotFoundError("Interview link not found or expired");
    }

    if (link.status === "expired") {
      throw new AppError("This interview link has expired", 410, "LINK_EXPIRED");
    }

    return link;
  }

  async getAll(therapistId, { status, page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    return this.interviewLinkRepo.findByTherapistId(therapistId, {
      status,
      limit,
      offset,
    });
  }

  async updateStatus(therapistId, linkId, status) {
    const validStatuses = ["pending", "in_progress", "completed", "expired"];
    if (!validStatuses.includes(status)) {
      throw new AppError("Invalid status", 400, "INVALID_STATUS");
    }

    const link = await this.interviewLinkRepo.findById(linkId);

    if (!link) {
      throw new NotFoundError("Interview link not found");
    }

    if (link.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    return this.interviewLinkRepo.updateStatus(linkId, status);
  }

  async startInterview(token) {
    const link = await this.getByToken(token);

    if (link.status !== "pending") {
      throw new AppError("Interview already started or completed", 400, "INVALID_STATUS");
    }

    return this.interviewLinkRepo.updateStatus(link.interview_link_id, "in_progress");
  }

  async completeInterview(token) {
    const link = await this.getByToken(token);

    if (link.status !== "in_progress") {
      throw new AppError("Interview not in progress", 400, "INVALID_STATUS");
    }

    return this.interviewLinkRepo.updateStatus(link.interview_link_id, "completed");
  }

  async remove(therapistId, linkId) {
    const link = await this.interviewLinkRepo.findById(linkId);

    if (!link) {
      throw new NotFoundError("Interview link not found");
    }

    if (link.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    return this.interviewLinkRepo.remove(linkId);
  }
}
