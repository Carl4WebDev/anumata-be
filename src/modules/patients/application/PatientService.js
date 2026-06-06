import AppError from "../../../core/errors/AppError.js";
import NotFoundError from "../../../core/errors/NotFoundError.js";
import { validateCreatePatient, validateUpdatePatient } from "./validators/patientValidator.js";

export default class PatientService {
  constructor(patientRepository) {
    this.patientRepository = patientRepository;
  }

  async create(therapistId, data) {
    const validated = validateCreatePatient(data);

    return this.patientRepository.create({
      ...validated,
      therapist_id: therapistId,
    });
  }

  async getById(therapistId, patientId) {
    const patient = await this.patientRepository.findById(patientId);

    if (!patient) {
      throw new NotFoundError("Patient not found");
    }

    if (patient.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    return patient;
  }

  async getAll(therapistId, { search, page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    return this.patientRepository.findByTherapistId(therapistId, {
      search,
      limit,
      offset,
    });
  }

  async update(therapistId, patientId, data) {
    const validated = validateUpdatePatient(data);

    if (Object.keys(validated).length === 0) {
      throw new AppError("No fields to update", 400, "NO_FIELDS");
    }

    const patient = await this.patientRepository.findById(patientId);

    if (!patient) {
      throw new NotFoundError("Patient not found");
    }

    if (patient.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    return this.patientRepository.update(patientId, validated);
  }

  async remove(therapistId, patientId) {
    const patient = await this.patientRepository.findById(patientId);

    if (!patient) {
      throw new NotFoundError("Patient not found");
    }

    if (patient.therapist_id !== therapistId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    return this.patientRepository.remove(patientId);
  }

  async count(therapistId) {
    return this.patientRepository.countByTherapistId(therapistId);
  }
}
