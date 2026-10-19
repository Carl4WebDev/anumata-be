import IPatientRepo from "../domain/IPatientRepo.js";
import db from "../../../core/database/db.js";

export default class PatientRepo extends IPatientRepo {
  async create(patient) {
    const fullName = `${patient.f_name} ${patient.m_name ? patient.m_name + " " : ""}${patient.l_name}`.trim();
    const result = await db.query(
      `INSERT INTO patients (therapist_id, f_name, m_name, l_name, full_name, age, gender, primary_concern)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING patient_id, therapist_id, f_name, m_name, l_name, age, gender, primary_concern, created_at`,
      [patient.therapist_id, patient.f_name, patient.m_name || null, patient.l_name, fullName, patient.age, patient.gender, patient.primary_concern],
    );

    return { ...result.rows[0], session_count: 0, risk_level: null, last_interview: null };
  }

  async findDuplicate(therapistId, fName, lName, age, gender) {
    const result = await db.query(
      `SELECT patient_id, f_name, l_name FROM patients
       WHERE therapist_id = $1 AND LOWER(TRIM(f_name)) = LOWER(TRIM($2)) AND LOWER(TRIM(l_name)) = LOWER(TRIM($3)) AND age = $4 AND LOWER(gender) = LOWER($5)`,
      [therapistId, fName, lName, age, gender],
    );
    return result.rows[0] || null;
  }

  async findById(id) {
    const result = await db.query(
      `SELECT p.patient_id, p.therapist_id, p.f_name, p.m_name, p.l_name, p.age, p.gender, p.primary_concern,
              p.created_at, p.updated_at, p.longitudinal_report,
              (SELECT COUNT(*) FROM sessions s WHERE s.patient_id = p.patient_id)::int as session_count,
              (SELECT s.risk_level FROM sessions s WHERE s.patient_id = p.patient_id ORDER BY s.created_at DESC LIMIT 1) as risk_level,
              (SELECT s.created_at FROM sessions s WHERE s.patient_id = p.patient_id ORDER BY s.created_at DESC LIMIT 1) as last_interview
       FROM patients p
       WHERE p.patient_id = $1`,
      [id],
    );

    return result.rows[0] || null;
  }

  async findByTherapistId(therapistId, { search, limit = 20, offset = 0 } = {}) {
    const params = [therapistId];
    let whereClause = "WHERE p.therapist_id = $1";

    if (search) {
      params.push(`%${search}%`);
      const sp = params.length;
      whereClause += ` AND (p.f_name ILIKE $${sp} OR p.l_name ILIKE $${sp})`;
    }

    params.push(limit);
    const limitParam = params.length;
    params.push(offset);
    const offsetParam = params.length;

    const countParams = [therapistId];
    let countWhere = "WHERE therapist_id = $1";
    if (search) {
      countParams.push(`%${search}%`);
      const csp = countParams.length;
      countWhere += ` AND (f_name ILIKE $${csp} OR l_name ILIKE $${csp})`;
    }

    const [patients, countResult] = await Promise.all([
      db.query(
        `SELECT p.patient_id, p.therapist_id, p.f_name, p.m_name, p.l_name, p.age, p.gender, p.primary_concern, p.created_at,
                (SELECT COUNT(*) FROM sessions s WHERE s.patient_id = p.patient_id)::int as session_count,
                (SELECT s.risk_level FROM sessions s WHERE s.patient_id = p.patient_id ORDER BY s.created_at DESC LIMIT 1) as risk_level,
                (SELECT s.created_at FROM sessions s WHERE s.patient_id = p.patient_id ORDER BY s.created_at DESC LIMIT 1) as last_interview
         FROM patients p
         ${whereClause}
         ORDER BY p.created_at DESC
         LIMIT $${limitParam} OFFSET $${offsetParam}`,
        params,
      ),
      db.query(
        `SELECT COUNT(*) as total FROM patients ${countWhere}`,
        countParams,
      ),
    ]);

    return {
      patients: patients.rows,
      total: parseInt(countResult.rows[0].total),
      page: Math.floor(offset / limit) + 1,
      limit,
    };
  }

  async update(id, data) {
    const setClauses = [];
    const params = [id];
    let paramIndex = 2;

    for (const [key, value] of Object.entries(data)) {
      setClauses.push(`${key} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }

    setClauses.push(`updated_at = NOW()`);

    const result = await db.query(
      `UPDATE patients SET ${setClauses.join(", ")} WHERE patient_id = $1
       RETURNING patient_id, therapist_id, f_name, m_name, l_name, age, gender, primary_concern, created_at, updated_at`,
      params,
    );

    return result.rows[0];
  }

  async remove(id) {
    await db.query(`DELETE FROM patients WHERE patient_id = $1`, [id]);
    return { deleted: true };
  }

  async countByTherapistId(therapistId) {
    const result = await db.query(
      `SELECT COUNT(*) as total FROM patients WHERE therapist_id = $1`,
      [therapistId],
    );

    return parseInt(result.rows[0].total);
  }

  async updateLongitudinalReport(patientId, report) {
    const result = await db.query(
      `UPDATE patients SET longitudinal_report = $2::jsonb, updated_at = NOW()
       WHERE patient_id = $1
       RETURNING patient_id, longitudinal_report, updated_at`,
      [patientId, JSON.stringify(report)],
    );

    return result.rows[0];
  }

  async findRecent(therapistId, limit = 4) {
    const result = await db.query(
      `SELECT p.patient_id as id,
              TRIM(p.f_name || ' ' || COALESCE(p.m_name || ' ', '') || p.l_name) as name,
              (SELECT s.risk_level FROM sessions s WHERE s.patient_id = p.patient_id ORDER BY s.created_at DESC LIMIT 1) as risk,
              (SELECT s.created_at FROM sessions s WHERE s.patient_id = p.patient_id ORDER BY s.created_at DESC LIMIT 1) as last_interview
       FROM patients p
       WHERE p.therapist_id = $1
       ORDER BY p.created_at DESC
       LIMIT $2`,
      [therapistId, limit],
    );

    return result.rows;
  }
}