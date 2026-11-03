import db from "../../../core/database/db.js";
import AppError from "../../../core/errors/AppError.js";
import {
  PRE_SESSION_INTERVIEW_COLUMNS,
  PRE_SESSION_INTERVIEW_JOIN,
  withInterview,
} from "../application/preSessionInterview.js";

// PostgreSQL exclusion_violation — raised by appointments_no_overlap.
const EXCLUSION_VIOLATION = "23P01";
const UNIQUE_VIOLATION = "23505";

// How closing an appointment moves the follow-up it was booked from. A
// cancelled appointment hands the follow-up back to 'recommended' so it can
// be rebooked — the clinical recommendation still stands.
const FOLLOW_UP_STATUS_ON_CLOSE = {
  completed: "completed",
  no_show: "missed",
  cancelled: "recommended",
};

// Each appointment carries its pre-session interview (see preSessionInterview.js)
// and, in a recurring series, its position ("3 of 8", cancelled sessions included).
const APPOINTMENT_SELECT = `
  SELECT a.*, TRIM(p.full_name) as patient_name, ${PRE_SESSION_INTERVIEW_COLUMNS},
         CASE WHEN a.series_id IS NULL THEN NULL ELSE
           (SELECT COUNT(*)::int FROM appointments s WHERE s.series_id = a.series_id AND s.start_at <= a.start_at) END
           AS series_index,
         CASE WHEN a.series_id IS NULL THEN NULL ELSE
           (SELECT COUNT(*)::int FROM appointments s WHERE s.series_id = a.series_id) END
           AS series_total
  FROM appointments a
  JOIN patients p ON p.patient_id = a.patient_id
  ${PRE_SESSION_INTERVIEW_JOIN}`;

function slotConflict(err) {
  if (err.code === EXCLUSION_VIOLATION) {
    return new AppError("That time is already booked.", 409, "SLOT_TAKEN");
  }
  if (err.code === UNIQUE_VIOLATION && err.constraint === "appointments_one_scheduled_per_follow_up") {
    return new AppError("This follow-up already has a scheduled appointment.", 409, "FOLLOW_UP_ALREADY_BOOKED");
  }
  return err;
}

function sessionTypeConflict(err) {
  if (err.code === UNIQUE_VIOLATION && err.constraint === "session_types_unique_active_name") {
    return new AppError("You already have a session type with this name.", 409, "SESSION_TYPE_EXISTS");
  }
  return err;
}

export default class AppointmentRepo {
  // ---------- settings ----------

  async getOrCreateSettings(therapistId) {
    await db.query(
      `INSERT INTO appointment_settings (therapist_id) VALUES ($1) ON CONFLICT (therapist_id) DO NOTHING`,
      [therapistId],
    );
    const { rows } = await db.query(`SELECT * FROM appointment_settings WHERE therapist_id = $1`, [therapistId]);
    return rows[0];
  }

  /** Changes only the fields given (default session length and/or break). */
  async updateSettings(therapistId, { slot_minutes = null, break_minutes = null }) {
    await this.getOrCreateSettings(therapistId);
    const { rows } = await db.query(
      `UPDATE appointment_settings
       SET slot_minutes = COALESCE($2, slot_minutes),
           break_minutes = COALESCE($3, break_minutes),
           updated_at = NOW()
       WHERE therapist_id = $1
       RETURNING *`,
      [therapistId, slot_minutes, break_minutes],
    );
    return rows[0];
  }

  // ---------- session types ----------

  async listSessionTypes(therapistId) {
    const { rows } = await db.query(
      `SELECT * FROM session_types WHERE therapist_id = $1 AND is_active ORDER BY duration_minutes, name`,
      [therapistId],
    );
    return rows;
  }

  async findSessionType(therapistId, sessionTypeId) {
    const { rows } = await db.query(
      `SELECT * FROM session_types WHERE session_type_id = $1 AND therapist_id = $2 AND is_active`,
      [sessionTypeId, therapistId],
    );
    return rows[0] ?? null;
  }

  async createSessionType(therapistId, { name, duration_minutes }) {
    try {
      const { rows } = await db.query(
        `INSERT INTO session_types (therapist_id, name, duration_minutes) VALUES ($1, $2, $3) RETURNING *`,
        [therapistId, name, duration_minutes],
      );
      return rows[0];
    } catch (err) {
      throw sessionTypeConflict(err);
    }
  }

  async updateSessionType(therapistId, sessionTypeId, { name = null, duration_minutes = null }) {
    try {
      const { rows } = await db.query(
        `UPDATE session_types
         SET name = COALESCE($3, name), duration_minutes = COALESCE($4, duration_minutes), updated_at = NOW()
         WHERE session_type_id = $1 AND therapist_id = $2 AND is_active
         RETURNING *`,
        [sessionTypeId, therapistId, name, duration_minutes],
      );
      return rows[0] ?? null;
    } catch (err) {
      throw sessionTypeConflict(err);
    }
  }

  async deactivateSessionType(therapistId, sessionTypeId) {
    const { rowCount } = await db.query(
      `UPDATE session_types SET is_active = false, updated_at = NOW()
       WHERE session_type_id = $1 AND therapist_id = $2 AND is_active`,
      [sessionTypeId, therapistId],
    );
    return rowCount > 0;
  }

  // ---------- working hours & blocked periods ----------

  async getAvailability(therapistId, client = db) {
    const { rows } = await client.query(
      `SELECT * FROM therapist_availability WHERE therapist_id = $1 ORDER BY weekday, start_time`,
      [therapistId],
    );
    return rows;
  }

  async replaceAvailability(therapistId, windows) {
    return db.transaction(async (client) => {
      await client.query(`DELETE FROM therapist_availability WHERE therapist_id = $1`, [therapistId]);
      for (const w of windows) {
        await client.query(
          `INSERT INTO therapist_availability (therapist_id, weekday, start_time, end_time)
           VALUES ($1, $2, $3, $4)`,
          [therapistId, w.weekday, w.start_time, w.end_time],
        );
      }
      return this.getAvailability(therapistId, client);
    });
  }

  /** Blocked periods that have not ended yet. */
  async getUnavailable(therapistId) {
    const { rows } = await db.query(
      `SELECT * FROM therapist_unavailable WHERE therapist_id = $1 AND end_at > NOW() ORDER BY start_at`,
      [therapistId],
    );
    return rows;
  }

  async addUnavailable(therapistId, range) {
    const { rows } = await db.query(
      `INSERT INTO therapist_unavailable (therapist_id, start_at, end_at, reason)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [therapistId, range.start_at, range.end_at, range.reason],
    );
    return rows[0];
  }

  async removeUnavailable(therapistId, unavailableId) {
    const { rowCount } = await db.query(
      `DELETE FROM therapist_unavailable WHERE unavailable_id = $1 AND therapist_id = $2`,
      [unavailableId, therapistId],
    );
    return rowCount > 0;
  }

  /** Scheduled appointments overlapping [from, to), optionally ignoring one (when rescheduling it). */
  async getBusyRanges(therapistId, fromMs, toMs, excludeId = null) {
    const { rows } = await db.query(
      `SELECT start_at, end_at FROM appointments
       WHERE therapist_id = $1 AND status = 'scheduled'
         AND end_at > to_timestamp($2 / 1000.0) AND start_at < to_timestamp($3 / 1000.0)
         AND ($4::int IS NULL OR appointment_id <> $4::int)`,
      [therapistId, fromMs, toMs, excludeId],
    );
    return rows;
  }

  // ---------- appointments ----------

  async findActivePatient(therapistId, patientId) {
    const { rows } = await db.query(
      `SELECT patient_id, TRIM(full_name) as full_name FROM patients
       WHERE patient_id = $1 AND therapist_id = $2 AND (is_archived IS DISTINCT FROM TRUE)`,
      [patientId, therapistId],
    );
    return rows[0] ?? null;
  }

  /** Follow-up owned by the therapist, plus whether it already has a scheduled appointment. */
  async findFollowUpForBooking(therapistId, followUpId) {
    const { rows } = await db.query(
      `SELECT fu.follow_up_id, fu.patient_id, fu.status,
              EXISTS (SELECT 1 FROM appointments a
                      WHERE a.follow_up_id = fu.follow_up_id AND a.status = 'scheduled') AS is_booked
       FROM follow_ups fu
       WHERE fu.follow_up_id = $1 AND fu.therapist_id = $2`,
      [followUpId, therapistId],
    );
    return rows[0] ?? null;
  }

  /** Follow-up is now booked: scheduled, with the appointment's Manila date and time. */
  async markFollowUpBooked(client, followUpId, startAt) {
    await client.query(
      `UPDATE follow_ups
       SET status = 'scheduled',
           recommended_date = ($2::timestamptz AT TIME ZONE 'Asia/Manila')::date,
           appointment_time = ($2::timestamptz AT TIME ZONE 'Asia/Manila')::time,
           updated_at = NOW()
       WHERE follow_up_id = $1`,
      [followUpId, startAt],
    );
  }

  async markFollowUpClosed(client, followUpId, appointmentStatus) {
    const status = FOLLOW_UP_STATUS_ON_CLOSE[appointmentStatus];
    await client.query(
      `UPDATE follow_ups
       SET status = $2::varchar,
           appointment_time = CASE WHEN $2::varchar = 'recommended' THEN NULL ELSE appointment_time END,
           updated_at = NOW()
       WHERE follow_up_id = $1`,
      [followUpId, status],
    );
  }

  async logEvent(client, appointmentId, action, detail = null) {
    await client.query(
      `INSERT INTO appointment_events (appointment_id, action, detail) VALUES ($1, $2, $3)`,
      [appointmentId, action, detail],
    );
  }

  async create(data) {
    try {
      return await db.transaction(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO appointments
             (therapist_id, patient_id, follow_up_id, start_at, end_at, reason, session_type_id, session_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING appointment_id`,
          [
            data.therapist_id,
            data.patient_id,
            data.follow_up_id ?? null,
            data.start_at,
            data.end_at,
            data.reason,
            data.session_type_id ?? null,
            data.session_type ?? null,
          ],
        );
        const id = rows[0].appointment_id;
        await this.logEvent(client, id, "booked", data.reason);
        if (data.follow_up_id) await this.markFollowUpBooked(client, data.follow_up_id, data.start_at);
        return this.findById(id, data.therapist_id, client);
      });
    } catch (err) {
      throw slotConflict(err);
    }
  }

  /**
   * A recurring series in one transaction: every session or none (a clash on
   * any date rolls them all back). The follow-up, if any, goes on the first session.
   */
  async createSeries({
    series_id,
    therapist_id,
    patient_id,
    follow_up_id,
    reason,
    duration_minutes,
    session_type_id = null,
    session_type = null,
    starts,
  }) {
    try {
      return await db.transaction(async (client) => {
        const ids = [];
        for (const [i, start] of starts.entries()) {
          const followUpId = i === 0 ? (follow_up_id ?? null) : null;
          const end = new Date(start.getTime() + duration_minutes * 60 * 1000);
          const { rows } = await client.query(
            `INSERT INTO appointments
               (therapist_id, patient_id, follow_up_id, start_at, end_at, reason, series_id, session_type_id, session_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING appointment_id`,
            [therapist_id, patient_id, followUpId, start, end, reason, series_id, session_type_id, session_type],
          );
          const id = rows[0].appointment_id;
          await this.logEvent(client, id, "booked", `Session ${i + 1} of ${starts.length} (recurring)${reason ? ` — ${reason}` : ""}`);
          if (followUpId) await this.markFollowUpBooked(client, followUpId, start);
          ids.push(id);
        }
        // Read back only once every session exists, so each shows its full "n of total".
        const created = [];
        for (const id of ids) created.push(await this.findById(id, therapist_id, client));
        return created;
      });
    } catch (err) {
      throw slotConflict(err);
    }
  }

  /** Scheduled sessions of a series from `fromStart` onwards (inclusive), in order. */
  async findSeriesFrom(therapistId, seriesId, fromStart) {
    const { rows } = await db.query(
      `SELECT * FROM appointments
       WHERE therapist_id = $1 AND series_id = $2 AND status = 'scheduled' AND start_at >= $3
       ORDER BY start_at`,
      [therapistId, seriesId, fromStart],
    );
    return rows;
  }

  /**
   * Change time and/or reason of a still-scheduled appointment. `patch` holds
   * only the fields being changed; `event` is the history entry to record.
   */
  async updateScheduled(appointmentId, therapistId, patch, event) {
    try {
      return await db.transaction(async (client) => {
        const { rows } = await client.query(
          `UPDATE appointments
           SET start_at = COALESCE($3, start_at),
               end_at = COALESCE($4, end_at),
               reason = CASE WHEN $5::boolean THEN $6 ELSE reason END,
               updated_at = NOW()
           WHERE appointment_id = $1 AND therapist_id = $2 AND status = 'scheduled'
           RETURNING follow_up_id, start_at`,
          [
            appointmentId,
            therapistId,
            patch.start_at ?? null,
            patch.end_at ?? null,
            "reason" in patch,
            patch.reason ?? null,
          ],
        );
        if (rows.length === 0) return null;
        await this.logEvent(client, appointmentId, event.action, event.detail);
        if (rows[0].follow_up_id && patch.start_at) {
          await this.markFollowUpBooked(client, rows[0].follow_up_id, rows[0].start_at);
        }
        return this.findById(appointmentId, therapistId, client);
      });
    } catch (err) {
      throw slotConflict(err);
    }
  }

  /** scheduled → completed | no_show | cancelled, guarded against concurrent changes. */
  async closeScheduled(appointmentId, therapistId, toStatus, reason = null) {
    return db.transaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE appointments
         SET status = $3::varchar, updated_at = NOW(),
             cancel_reason = CASE WHEN $3::varchar = 'cancelled' THEN $4::text ELSE cancel_reason END
         WHERE appointment_id = $1 AND therapist_id = $2 AND status = 'scheduled'
         RETURNING follow_up_id`,
        [appointmentId, therapistId, toStatus, reason],
      );
      if (rows.length === 0) return null;
      await this.logEvent(client, appointmentId, toStatus, reason);
      if (rows[0].follow_up_id) await this.markFollowUpClosed(client, rows[0].follow_up_id, toStatus);
      return this.findById(appointmentId, therapistId, client);
    });
  }

  /**
   * completed | no_show | cancelled → scheduled again (undo). Its follow-up,
   * if any, is booked again. The overlap / one-per-follow-up constraints
   * reject it if the time or follow-up was rebooked meanwhile.
   */
  async reopenClosed(appointmentId, therapistId, fromStatus) {
    try {
      return await db.transaction(async (client) => {
        const { rows } = await client.query(
          `UPDATE appointments
           SET status = 'scheduled', cancel_reason = NULL, updated_at = NOW()
           WHERE appointment_id = $1 AND therapist_id = $2 AND status = $3
           RETURNING follow_up_id, start_at`,
          [appointmentId, therapistId, fromStatus],
        );
        if (rows.length === 0) return null;
        await this.logEvent(client, appointmentId, "reopened", `Undid ${fromStatus.replace("_", "-")}`);
        if (rows[0].follow_up_id) await this.markFollowUpBooked(client, rows[0].follow_up_id, rows[0].start_at);
        return this.findById(appointmentId, therapistId, client);
      });
    } catch (err) {
      throw slotConflict(err);
    }
  }

  /** Scheduled appointments overlapping [from, to) — open-ended when `to` is omitted — with the patient's name. */
  async findScheduled(therapistId, { from, to = null }) {
    const { rows } = await db.query(
      `SELECT a.appointment_id, TRIM(p.full_name) AS patient_name, a.start_at, a.end_at
       FROM appointments a
       JOIN patients p ON p.patient_id = a.patient_id
       WHERE a.therapist_id = $1 AND a.status = 'scheduled'
         AND a.end_at > $2 AND ($3::timestamptz IS NULL OR a.start_at < $3)
       ORDER BY a.start_at`,
      [therapistId, from, to],
    );
    return rows;
  }

  async findById(appointmentId, therapistId, client = db) {
    const { rows } = await client.query(
      `${APPOINTMENT_SELECT}
       WHERE a.appointment_id = $1 AND a.therapist_id = $2`,
      [appointmentId, therapistId],
    );
    return rows[0] ? withInterview(rows[0]) : null;
  }

  async list(therapistId, { status, patient_id, from, to, limit = 500 } = {}) {
    const conditions = ["a.therapist_id = $1"];
    const params = [therapistId];
    const add = (sql, value) => {
      params.push(value);
      conditions.push(sql.replace("?", `$${params.length}`));
    };
    if (status) add("a.status = ?", status);
    if (patient_id) add("a.patient_id = ?", patient_id);
    if (from) add("a.start_at >= ?", from);
    if (to) add("a.start_at < ?", to);
    params.push(limit);
    const { rows } = await db.query(
      `${APPOINTMENT_SELECT}
       WHERE ${conditions.join(" AND ")}
       ORDER BY a.start_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return rows.map(withInterview);
  }

  async getEvents(appointmentId) {
    const { rows } = await db.query(
      `SELECT * FROM appointment_events WHERE appointment_id = $1 ORDER BY created_at ASC, event_id ASC`,
      [appointmentId],
    );
    return rows;
  }
}
