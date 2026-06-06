export default class IPatientRepo {
  async create(patient) {
    throw new Error("Not implemented");
  }

  async findById(id) {
    throw new Error("Not implemented");
  }

  async findByTherapistId(therapistId, options) {
    throw new Error("Not implemented");
  }

  async update(id, data) {
    throw new Error("Not implemented");
  }

  async remove(id) {
    throw new Error("Not implemented");
  }

  async countByTherapistId(therapistId) {
    throw new Error("Not implemented");
  }

  async findRecent(therapistId, limit) {
    throw new Error("Not implemented");
  }
}
