import IUserRepo from "../domain/Users/IUserRepo.js";
import db from "../../../core/database/db.js";
import User from "../domain/Users/User.js";

/** What the therapist (and the admin) sees of an account — never the password hash. */
const PROFILE_COLUMNS = `user_id, email, f_name, m_name, l_name, profile_image, phone, specialization, license_number,
  affiliation, created_at, role, profession, license_name, license_status, license_note, license_checked_at, is_active`;

export default class UserRepo extends IUserRepo {
  async create(user) {
    const fullName = `${user.f_name} ${user.m_name ? user.m_name + " " : ""}${user.l_name}`.trim();
    // terms_accepted_at is set by the database clock at the moment of creation.
    const result = await db.query(
      `INSERT INTO users (email, password_hash, f_name, m_name, l_name, full_name, terms_version, terms_accepted_at,
                          profession, license_number, license_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $7::varchar IS NULL THEN NULL ELSE NOW() END, $8, $9, $10)
       RETURNING user_id, email, f_name, m_name, l_name, terms_version, terms_accepted_at,
                 profession, license_number, license_name, license_status`,
      [
        user.email,
        user.password_hash,
        user.f_name,
        user.m_name || null,
        user.l_name,
        fullName,
        user.terms_version ?? null,
        user.profession ?? null,
        user.license_number ?? null,
        user.license_name ?? null,
      ],
    );

    return result.rows[0];
  }

  /** Another account already using this PRC license number for the same profession, if any. */
  async findByLicense(profession, licenseNumber, excludeUserId = null) {
    const result = await db.query(
      `SELECT user_id FROM users
       WHERE profession = $1 AND license_number = $2 AND ($3::int IS NULL OR user_id <> $3)
       LIMIT 1`,
      [profession, licenseNumber, excludeUserId],
    );
    return result.rows[0] ?? null;
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
      `SELECT ${PROFILE_COLUMNS} FROM users WHERE user_id = $1`,
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
      `UPDATE users SET ${sets.join(", ")}, updated_at = NOW() WHERE user_id = $1 RETURNING ${PROFILE_COLUMNS}`,
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
