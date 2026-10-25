import IUserRepo from "../domain/Users/IUserRepo.js";
import db from "../../../core/database/db.js";
import User from "../domain/Users/User.js";

export default class UserRepo extends IUserRepo {
  async create(user) {
    const fullName = `${user.f_name} ${user.m_name ? user.m_name + " " : ""}${user.l_name}`.trim();
    const result = await db.query(
      `INSERT INTO users (email, password_hash, f_name, m_name, l_name, full_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING user_id, email, f_name, m_name, l_name`,
      [user.email, user.password_hash, user.f_name, user.m_name || null, user.l_name, fullName],
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
      `SELECT user_id, email, f_name, m_name, l_name, profile_image, phone, specialization, license_number, affiliation, created_at FROM users WHERE user_id = $1`,
      [id],
    );

    if (!result.rows[0]) return null;

    return result.rows[0];
  }

  async updateProfile(id, data) {
    // Keys come from AuthService's fixed field list, never from request input.
    const fields = Object.keys(data);
    const sets = fields.map((key, i) => `${key} = $${i + 2}`);
    const result = await db.query(
      `UPDATE users SET ${sets.join(", ")}, updated_at = NOW() WHERE user_id = $1 RETURNING user_id, email, f_name, m_name, l_name, profile_image, phone, specialization, license_number, affiliation`,
      [id, ...fields.map((key) => data[key])],
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
