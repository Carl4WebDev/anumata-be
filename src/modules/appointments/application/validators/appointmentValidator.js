import ValidationError from "../../../../core/errors/ValidationError.js";

export const APPOINTMENT_STATUSES = ["scheduled", "completed", "no_show", "cancelled"];

export const APPOINTMENT_TRANSITIONS = {
  scheduled: ["completed", "no_show", "cancelled"],
  completed: [],
  no_show: [],
  cancelled: [],
};

export function validateStatusTransition(from, to) {
  const allowed = APPOINTMENT_TRANSITIONS[from];
  if (!allowed) return { ok: false, errors: [`Unknown status '${from}'`] };
  if (!allowed.includes(to)) return { ok: false, errors: [`Cannot change an appointment from '${from}' to '${to}'`] };
  return { ok: true };
}

const MAX_REASON = 255;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parsePositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseReason(value, errors) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    errors.push("Reason must be text.");
    return null;
  }
  const reason = value.trim();
  if (reason.length > MAX_REASON) errors.push(`Reason must be ${MAX_REASON} characters or fewer.`);
  return reason || null;
}

function parseStart(value, errors) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    errors.push("A valid appointment time is required.");
    return null;
  }
  return date;
}

/** Booking a patient: patient + slot start + optional reason / follow-up it fulfils. */
export function validateBookAppointment(data) {
  const errors = [];
  const patientId = parsePositiveInt(data?.patient_id);
  if (!patientId) errors.push("A patient is required.");
  const startAt = parseStart(data?.start_at, errors);
  const reason = parseReason(data?.reason, errors);
  let followUpId = null;
  if (data?.follow_up_id !== undefined && data?.follow_up_id !== null && data?.follow_up_id !== "") {
    followUpId = parsePositiveInt(data.follow_up_id);
    if (!followUpId) errors.push("follow_up_id must be a positive integer.");
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data: { patient_id: patientId, start_at: startAt, reason, follow_up_id: followUpId } };
}

/** Editing: new time and/or reason. At least one must be present. */
export function validateUpdateAppointment(data) {
  const errors = [];
  const out = {};
  if (data?.start_at !== undefined) out.start_at = parseStart(data.start_at, errors);
  if (data?.reason !== undefined) out.reason = parseReason(data.reason, errors);
  if (errors.length === 0 && Object.keys(out).length === 0) errors.push("Nothing to update.");
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data: out };
}

/** Slot lookup: a Manila calendar date, optionally ignoring one appointment (when rescheduling it). */
export function validateSlotQuery(query) {
  const errors = [];
  const date = query?.date;
  if (typeof date !== "string" || !DATE_RE.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) {
    errors.push("date must be YYYY-MM-DD.");
  }
  let excludeId = null;
  if (query?.exclude !== undefined && query.exclude !== "") {
    excludeId = parsePositiveInt(query.exclude);
    if (!excludeId) errors.push("exclude must be an appointment id.");
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data: { date, excludeId } };
}

export function validateListQuery(query) {
  const errors = [];
  const out = {};
  if (query?.status) {
    if (!APPOINTMENT_STATUSES.includes(query.status)) errors.push(`Unknown status '${query.status}'.`);
    else out.status = query.status;
  }
  if (query?.patient_id) {
    const patientId = parsePositiveInt(query.patient_id);
    if (!patientId) errors.push("patient_id must be a positive integer.");
    else out.patient_id = patientId;
  }
  for (const key of ["from", "to"]) {
    if (!query?.[key]) continue;
    const date = new Date(query[key]);
    if (Number.isNaN(date.getTime())) errors.push(`'${key}' must be a valid date.`);
    else out[key] = date.toISOString();
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data: out };
}

export function parseAppointmentId(value) {
  const id = parsePositiveInt(value);
  if (!id) return { ok: false, errors: ["Invalid id."] };
  return { ok: true, data: id };
}

export function validateCancel(data) {
  const errors = [];
  const reason = parseReason(data?.reason, errors);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data: { reason } };
}

/** completed / no_show require the appointment time to have started. */
export function canRecordOutcome(appointment, now) {
  const startMs = new Date(appointment.start_at).getTime();
  if (Number.isNaN(startMs)) return { ok: false, errors: ["Appointment has an invalid time."] };
  if (now.getTime() < startMs) {
    return { ok: false, errors: ["The appointment time has not started yet."] };
  }
  return { ok: true };
}

export function validateAvailabilityWindow(data) {
  const errors = [];
  const weekday = Number(data?.weekday);
  const startTime = typeof data?.start_time === "string" ? data.start_time : "";
  const endTime = typeof data?.end_time === "string" ? data.end_time : "";
  const timeRe = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) errors.push("Weekday must be 0 (Monday) to 6 (Sunday).");
  if (!timeRe.test(startTime)) errors.push("Start time must be HH:MM.");
  if (!timeRe.test(endTime)) errors.push("End time must be HH:MM.");
  if (!errors.length && startTime >= endTime) errors.push("Start time must be before end time.");

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data: { weekday, start_time: startTime.slice(0, 5), end_time: endTime.slice(0, 5) } };
}

/** Windows on the same weekday must not overlap each other. */
export function validateAvailabilityWindows(windows) {
  const errors = [];
  const valid = [];
  for (const w of windows) {
    const result = validateAvailabilityWindow(w);
    if (!result.ok) errors.push(...result.errors);
    else valid.push(result.data);
  }
  if (errors.length > 0) return { ok: false, errors: [...new Set(errors)] };
  const sorted = [...valid].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev.weekday === cur.weekday && cur.start_time < prev.end_time) {
      return { ok: false, errors: ["Working hours on the same day must not overlap."] };
    }
  }
  return { ok: true, data: sorted };
}

export function validateUnavailableRange(data) {
  const errors = [];
  const startAt = data?.start_at;
  const endAt = data?.end_at;
  if (!startAt || Number.isNaN(new Date(startAt).getTime())) errors.push("A valid start is required.");
  if (!endAt || Number.isNaN(new Date(endAt).getTime())) errors.push("A valid end is required.");
  if (!errors.length && new Date(startAt).getTime() >= new Date(endAt).getTime()) {
    errors.push("Start must be before end.");
  }
  const reason = parseReason(data?.reason, errors);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data: { start_at: new Date(startAt), end_at: new Date(endAt), reason } };
}

export function validateSettings(data) {
  const value = Number(data?.slot_minutes);
  if (!Number.isInteger(value) || value < 15 || value > 240) {
    return { ok: false, errors: ["Session length must be a whole number of minutes between 15 and 240."] };
  }
  return { ok: true, data: { slot_minutes: value } };
}

export function assertValid(result) {
  if (!result.ok) throw new ValidationError(result.errors.join(" "), result.errors);
  return result.data;
}
