export default class IFollowUpRepo {
  async create(data) {
    throw new Error("Not implemented");
  }

  async findById(id) {
    throw new Error("Not implemented");
  }

  async findByPatientId(patientId, therapistId) {
    throw new Error("Not implemented");
  }

  async findByTherapistId(therapistId, options) {
    throw new Error("Not implemented");
  }

  async update(id, data) {
    throw new Error("Not implemented");
  }

  async findUpcoming(therapistId, limit) {
    throw new Error("Not implemented");
  }

  async findDueToday(therapistId) {
    throw new Error("Not implemented");
  }

  async countByStatus(therapistId) {
    throw new Error("Not implemented");
  }
}