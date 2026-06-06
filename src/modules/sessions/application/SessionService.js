import AppError from "../../../core/errors/AppError.js";
import NotFoundError from "../../../core/errors/NotFoundError.js";
import { validateCreateSession, validateUpdateNotes } from "./validators/sessionValidator.js";

export default class SessionService {
  constructor(sessionRepo, interviewLinkRepo) {
    this.sessionRepo = sessionRepo;
    this.interviewLinkRepo = interviewLinkRepo;
  }

  async create(therapistId, data) {
    const validated = validateCreateSession(data);

    const link = await this.interviewLinkRepo.findById(validated.interview_link_id);
    if (!link) {
      throw new NotFoundError("Interview link not found");
    }

    if (link.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    const session = await this.sessionRepo.create({
      ...validated,
      patient_id: link.patient_id,
      therapist_id: therapistId,
    });

    // Mark interview link as completed
    await this.interviewLinkRepo.updateStatus(validated.interview_link_id, "completed");

    return session;
  }

  async getById(therapistId, sessionId) {
    const session = await this.sessionRepo.findById(sessionId);

    if (!session) {
      throw new NotFoundError("Session not found");
    }

    if (session.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    return session;
  }

  async getByPatientId(therapistId, patientId, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    return this.sessionRepo.findByPatientId(patientId, {
      therapistId,
      limit,
      offset,
    });
  }

  async getAll(therapistId, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    return this.sessionRepo.findByTherapistId(therapistId, {
      limit,
      offset,
    });
  }

  async updateNotes(therapistId, sessionId, data) {
    const validated = validateUpdateNotes(data);

    const session = await this.sessionRepo.findById(sessionId);

    if (!session) {
      throw new NotFoundError("Session not found");
    }

    if (session.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    return this.sessionRepo.updateNotes(sessionId, validated.notes);
  }

  async remove(therapistId, sessionId) {
    const session = await this.sessionRepo.findById(sessionId);

    if (!session) {
      throw new NotFoundError("Session not found");
    }

    if (session.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    return this.sessionRepo.remove(sessionId);
  }
}
