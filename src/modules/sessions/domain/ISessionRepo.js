export default class ISessionRepo {
  async create(session) {
    throw new Error("Not implemented");
  }

  async findById(id) {
    throw new Error("Not implemented");
  }

  async findByPatientId(patientId, options) {
    throw new Error("Not implemented");
  }

  async findByTherapistId(therapistId, options) {
    throw new Error("Not implemented");
  }

  async findByInterviewLinkId(interviewLinkId) {
    throw new Error("Not implemented");
  }

  async updateNotes(id, notes) {
    throw new Error("Not implemented");
  }

  async remove(id) {
    throw new Error("Not implemented");
  }
}
