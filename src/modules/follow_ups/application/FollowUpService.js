import AppError from "../../../core/errors/AppError.js";
import NotFoundError from "../../../core/errors/NotFoundError.js";
import { validateCreateFollowUp, validateUpdateFollowUp, validateStatusTransition } from "./validators/followUpValidator.js";
import PatientRepo from "../../patients/infrastructure/PatientRepo.js";

const patientRepo = new PatientRepo();

export default class FollowUpService {
  constructor(followUpRepo) {
    this.followUpRepo = followUpRepo;
  }

  async create(therapistId, data) {
    const result = validateCreateFollowUp(data);
    if (!result.ok) {
      throw new AppError("Validation failed", 400, "VALIDATION_ERROR", result.errors);
    }
    const validated = result.data;

    // Verify patient belongs to therapist
    const patient = await patientRepo.findById(validated.patient_id);
    if (!patient) {
      throw new NotFoundError("Patient not found");
    }
    if (patient.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    return this.followUpRepo.create({
      ...validated,
      therapist_id: therapistId,
    });
  }

  async getById(therapistId, followUpId) {
    const followUp = await this.followUpRepo.findById(followUpId);
    if (!followUp) {
      throw new NotFoundError("Follow-up not found");
    }
    if (followUp.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }
    return followUp;
  }

  async getByPatientId(therapistId, patientId) {
    // Verify patient belongs to therapist
    const patient = await patientRepo.findById(patientId);
    if (!patient) {
      throw new NotFoundError("Patient not found");
    }
    if (patient.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    return this.followUpRepo.findByPatientId(patientId, therapistId);
  }

  async getAll(therapistId, { status, page = 1, limit = 50 } = {}) {
    const offset = (page - 1) * limit;
    return this.followUpRepo.findByTherapistId(therapistId, { status, limit, offset });
  }

  async getUpcoming(therapistId, limit = 10) {
    return this.followUpRepo.findUpcoming(therapistId, limit);
  }

  async getDueToday(therapistId) {
    return this.followUpRepo.findDueToday(therapistId);
  }

  async getCounts(therapistId) {
    return this.followUpRepo.countByStatus(therapistId);
  }

  async update(therapistId, followUpId, data) {
    const followUp = await this.followUpRepo.findById(followUpId);
    if (!followUp) {
      throw new NotFoundError("Follow-up not found");
    }
    if (followUp.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    const result = validateUpdateFollowUp(data);
    if (!result.ok) {
      throw new AppError("Validation failed", 400, "VALIDATION_ERROR", result.errors);
    }

    if (Object.keys(result.data).length === 0) {
      throw new AppError("No fields to update", 400, "NO_FIELDS");
    }

    if (result.data.status !== undefined && result.data.status !== followUp.status) {
      const transition = validateStatusTransition(followUp.status, result.data.status);
      if (!transition.ok) {
        throw new AppError("Invalid status transition", 400, "VALIDATION_ERROR", { error: transition.error });
      }
    }

    return this.followUpRepo.update(followUpId, result.data);
  }

  async remove(therapistId, followUpId) {
    const followUp = await this.followUpRepo.findById(followUpId);
    if (!followUp) {
      throw new NotFoundError("Follow-up not found");
    }
    if (followUp.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    return this.followUpRepo.remove(followUpId);
  }
}