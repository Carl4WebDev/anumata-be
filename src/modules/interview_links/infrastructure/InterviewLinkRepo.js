import IInterviewLinkRepo from "../domain/IInterviewLinkRepo.js";
import db from "../../../core/database/db.js";

export default class InterviewLinkRepo extends IInterviewLinkRepo {
  async create(link) {
    const result = await db.query(
      `INSERT INTO interview_links (therapist_id, patient_id, question_set_id, token, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING interview_link_id, therapist_id, patient_id, question_set_id, token, status, created_at`,
      [link.therapist_id, link.patient_id, link.question_set_id, link.token, link.status],
    );

    return result.rows[0];
  }

  async findById(id) {
    const result = await db.query(
      `SELECT il.*, CONCAT(p.f_name, ' ', COALESCE(p.m_name || ' ', ''), p.l_name) as patient_name, p.age as patient_age, p.gender as patient_gender,
              qs.name as question_set_name, qs.questions
       FROM interview_links il
       JOIN patients p ON p.patient_id = il.patient_id
       JOIN question_sets qs ON qs.question_set_id = il.question_set_id
       WHERE il.interview_link_id = $1`,
      [id],
    );

    return result.rows[0] || null;
  }

  async findByToken(token) {
    const result = await db.query(
      `SELECT il.*, CONCAT(p.f_name, ' ', COALESCE(p.m_name || ' ', ''), p.l_name) as patient_name, p.age as patient_age, p.gender as patient_gender,
              qs.name as question_set_name, qs.questions
       FROM interview_links il
       JOIN patients p ON p.patient_id = il.patient_id
       JOIN question_sets qs ON qs.question_set_id = il.question_set_id
       WHERE il.token = $1`,
      [token],
    );

    if (!result.rows[0]) return null;

    const link = result.rows[0];

    // Try to load snapshots first (new system)
    const snapshots = await this.findSnapshotsByToken(token);
    if (snapshots.length > 0) {
      link.questions = snapshots.map((s) => ({
        text: s.question_text,
        order: s.display_order,
        source_type: s.source_type,
        source_id: s.source_id,
        snapshot_version: s.snapshot_version,
      }));
      link._from_snapshots = true;
    }
    // else: link.questions is already set from qs.questions via JOIN

    return link;
  }

  async findByTherapistId(therapistId, { status, limit = 20, offset = 0 } = {}) {
    const params = [therapistId];
    let whereClause = "WHERE il.therapist_id = $1";

    if (status) {
      params.push(status);
      whereClause += ` AND il.status = $${params.length}`;
    }

    params.push(limit);
    const limitParam = params.length;
    params.push(offset);
    const offsetParam = params.length;

    const countParams = [therapistId];
    let countWhere = "WHERE il.therapist_id = $1";
    if (status) {
      countParams.push(status);
      countWhere += ` AND il.status = $${countParams.length}`;
    }

    const [links, countResult] = await Promise.all([
      db.query(
        `SELECT il.interview_link_id, il.token, il.status, il.created_at,
                p.patient_id, CONCAT(p.f_name, ' ', COALESCE(p.m_name || ' ', ''), p.l_name) as patient_name,
                qs.question_set_id, qs.name as question_set_name
         FROM interview_links il
         JOIN patients p ON p.patient_id = il.patient_id
         JOIN question_sets qs ON qs.question_set_id = il.question_set_id
         ${whereClause}
         ORDER BY il.created_at DESC
         LIMIT $${limitParam} OFFSET $${offsetParam}`,
        params,
      ),
      db.query(
        `SELECT COUNT(*) as total FROM interview_links il ${countWhere}`,
        countParams,
      ),
    ]);

    return {
      links: links.rows,
      total: parseInt(countResult.rows[0].total),
      page: Math.floor(offset / limit) + 1,
      limit,
    };
  }

  async updateStatus(id, status) {
    const result = await db.query(
      `UPDATE interview_links SET status = $2, updated_at = NOW()
       WHERE interview_link_id = $1
       RETURNING interview_link_id, therapist_id, patient_id, question_set_id, token, status, created_at, updated_at`,
      [id, status],
    );

    return result.rows[0];
  }

  async remove(id) {
    await db.query(`DELETE FROM interview_links WHERE interview_link_id = $1`, [id]);
    return { deleted: true };
  }

  async createWithSnapshot(link, snapshots) {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");

      const linkResult = await client.query(
        `INSERT INTO interview_links (therapist_id, patient_id, question_set_id, token, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING interview_link_id, therapist_id, patient_id, question_set_id, token, status, created_at`,
        [link.therapist_id, link.patient_id, link.question_set_id, link.token, link.status],
      );
      const createdLink = linkResult.rows[0];

      if (snapshots && snapshots.length > 0) {
        for (const snap of snapshots) {
          await client.query(
            `INSERT INTO interview_question_snapshots (interview_link_id, question_text, source_type, source_id, display_order, snapshot_version)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [createdLink.interview_link_id, snap.question_text, snap.source_type, snap.source_id || null, snap.display_order, snap.snapshot_version || null],
          );
        }
      }

      await client.query("COMMIT");
      return createdLink;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findSnapshotsByLinkId(linkId) {
    const result = await db.query(
      `SELECT id, question_text, source_type, source_id, display_order, snapshot_version, created_at
       FROM interview_question_snapshots
       WHERE interview_link_id = $1
       ORDER BY display_order`,
      [linkId],
    );
    return result.rows;
  }

  async findSnapshotsByToken(token) {
    const result = await db.query(
      `SELECT iqs.id, iqs.question_text, iqs.source_type, iqs.source_id, iqs.display_order, iqs.snapshot_version, iqs.created_at
       FROM interview_question_snapshots iqs
       JOIN interview_links il ON il.interview_link_id = iqs.interview_link_id
       WHERE il.token = $1
       ORDER BY iqs.display_order`,
      [token],
    );
    return result.rows;
  }
}
