import IUserRepo from "../domain/Users/IUserRepo.js";
import db from "../../../core/database/db.js";
import User from "../domain/Users/User.js";

export default class UserRepo extends IUserRepo {
  async create(user) {
    const result = await db.query(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ($1, $2, $3)
       RETURNING user_id, email, full_name`,
      [user.email, user.password_hash, user.full_name],
    );

    return result.rows[0];
  }

  async findByEmail(email) {
    const result = await db.query(`SELECT * FROM users WHERE email = $1`, [
      email,
    ]);

    if (!result.rows[0]) return null;

    return new User(result.rows[0]);
  }

  async findById(id) {
    const result = await db.query(
      `SELECT user_id, email, full_name, created_at FROM users WHERE user_id = $1`,
      [id],
    );

    if (!result.rows[0]) return null;

    return result.rows[0];
  }

  async updateFullName(id, fullName) {
    const result = await db.query(
      `UPDATE users SET full_name = $2, updated_at = NOW() WHERE user_id = $1 RETURNING user_id, email, full_name`,
      [id, fullName],
    );

    return result.rows[0];
  }

  async updatePassword(id, passwordHash) {
    await db.query(
      `UPDATE users SET password_hash = $2, updated_at = NOW() WHERE user_id = $1`,
      [id, passwordHash],
    );
  }

  async findByIdWithPassword(id) {
    const result = await db.query(
      `SELECT * FROM users WHERE user_id = $1`,
      [id],
    );

    if (!result.rows[0]) return null;

    return new User(result.rows[0]);
  }
}
