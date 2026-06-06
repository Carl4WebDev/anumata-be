export default class IUserRepo {
  async create(user) {
    throw new Error("Not implemented");
  }

  async findByEmail(email) {
    throw new Error("Not implemented");
  }

  async findById(id) {
    throw new Error("Not implemented");
  }

  async updateFullName(id, fullName) {
    throw new Error("Not implemented");
  }

  async updatePassword(id, passwordHash) {
    throw new Error("Not implemented");
  }

  async findByIdWithPassword(id) {
    throw new Error("Not implemented");
  }
}
