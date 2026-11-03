import { randomUUID } from "node:crypto";
import AppError from "../../../core/errors/AppError.js";
import NotFoundError from "../../../core/errors/NotFoundError.js";
import {
  validateBookAppointment,
  validateUpdateAppointment,
  validateSlotQuery,
  validateListQuery,
  validateCancel,
  validateStatusTransition,
  validateAvailabilityWindows,
  validateUnavailableRange,
  validateSettings,
  validateSessionType,
  canRecordOutcome,
  assertValid,
} from "./validators/appointmentValidator.js";
import { freeSlotsForDay, isWithinHours, phDateOf, phDayRange, toRange } from "./slots.js";

const MAX_AVAILABILITY_WINDOWS = 50;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const UNDO_WINDOW_MINUTES = 15;

const countAppointments = (list) => (list.length === 1 ? "1 appointment is" : `${list.length} appointments are`);

/** An appointment's own length in minutes, or null when its times are unusable. */
function lengthInMinutes(appointment) {
  const ms = new Date(appointment.end_at).getTime() - new Date(appointment.start_at).getTime();
  return ms > 0 ? Math.round(ms / 60000) : null;
}

/** What an appointment records about the type it was booked as (its name is kept as booked). */
const sessionTypeFields = (sessionType) => ({
  session_type_id: sessionType?.session_type_id ?? null,
  session_type: sessionType?.name ?? null,
});

/** 409 listing the booked appointments a schedule change would clash with (the page asks to confirm). */
function scheduleConflict(message, appointments) {
  return new AppError(message, 409, "SCHEDULE_CONFLICT", {
    conflicts: appointments.map(({ appointment_id, patient_name, start_at, end_at }) => ({
      appointment_id,
      patient_name,
      start_at,
      end_at,
    })),
  });
}

/**
 * Appointments are booked by the therapist (or their assistant) for a
 * patient, always into a free slot of the therapist's own schedule.
 */
export default class AppointmentService {
  constructor(repo) {
    this.repo = repo;
  }

  // ---------- schedule ----------

  async getSchedule(therapistId) {
    const [settings, availability, unavailable, sessionTypes] = await Promise.all([
      this.repo.getOrCreateSettings(therapistId),
      this.repo.getAvailability(therapistId),
      this.repo.getUnavailable(therapistId),
      this.repo.listSessionTypes(therapistId),
    ]);
    return { settings, availability, unavailable, session_types: sessionTypes };
  }

  async updateSettings(therapistId, body) {
    return this.repo.updateSettings(therapistId, assertValid(validateSettings(body)));
  }

  // ---------- session types ----------

  async createSessionType(therapistId, body) {
    return this.repo.createSessionType(therapistId, assertValid(validateSessionType(body)));
  }

  /** Renaming or re-timing a type changes future bookings only; booked appointments keep their times. */
  async updateSessionType(therapistId, sessionTypeId, body) {
    const changes = assertValid(validateSessionType(body, { partial: true }));
    const updated = await this.repo.updateSessionType(therapistId, sessionTypeId, changes);
    if (!updated) throw new NotFoundError("Session type not found.");
    return updated;
  }

  /** Hidden rather than deleted, so past appointments keep its name. */
  async removeSessionType(therapistId, sessionTypeId) {
    const removed = await this.repo.deactivateSessionType(therapistId, sessionTypeId);
    if (!removed) throw new NotFoundError("Session type not found.");
    return { removed: true };
  }

  /** The therapist's active session type, or null when none was chosen. */
  async findSessionType(therapistId, sessionTypeId) {
    if (!sessionTypeId) return null;
    const sessionType = await this.repo.findSessionType(therapistId, sessionTypeId);
    if (!sessionType) throw new NotFoundError("Session type not found.");
    return sessionType;
  }

  /**
   * Replace the weekly hours. If that would leave upcoming appointments outside
   * them, nothing is saved until the therapist confirms (`confirm: true`).
   */
  async setAvailability(therapistId, windows, { confirm = false } = {}, now = new Date()) {
    if (!Array.isArray(windows)) {
      throw new AppError("windows must be a list.", 422, "VALIDATION_ERROR");
    }
    if (windows.length > MAX_AVAILABILITY_WINDOWS) {
      throw new AppError(`At most ${MAX_AVAILABILITY_WINDOWS} working-hour windows are allowed.`, 422, "VALIDATION_ERROR");
    }
    const validWindows = assertValid(validateAvailabilityWindows(windows));
    if (!confirm) {
      const upcoming = await this.repo.findScheduled(therapistId, { from: now });
      const outside = upcoming.filter(
        (a) => !isWithinHours(new Date(a.start_at).getTime(), new Date(a.end_at).getTime(), validWindows),
      );
      if (outside.length > 0) {
        throw scheduleConflict(`${countAppointments(outside)} would fall outside these working hours.`, outside);
      }
    }
    return this.repo.replaceAvailability(therapistId, validWindows);
  }

  /**
   * Block a period. If appointments are already booked in it, nothing is saved
   * until the therapist confirms (`confirm: true`); they stay booked either way.
   */
  async addUnavailable(therapistId, body) {
    const range = assertValid(validateUnavailableRange(body));
    if (body?.confirm !== true) {
      const clashing = await this.repo.findScheduled(therapistId, { from: range.start_at, to: range.end_at });
      if (clashing.length > 0) {
        throw scheduleConflict(`${countAppointments(clashing)} already booked in this period.`, clashing);
      }
    }
    return this.repo.addUnavailable(therapistId, range);
  }

  async removeUnavailable(therapistId, unavailableId) {
    const removed = await this.repo.removeUnavailable(therapistId, unavailableId);
    if (!removed) throw new NotFoundError("Blocked period not found.");
    return { removed: true };
  }

  // ---------- slots ----------

  /**
   * Free slots on one Manila calendar day, as ISO strings, for a session of:
   * the chosen type's length, else the length of the appointment being moved
   * (`excludeId`), else the default session length.
   */
  async getFreeSlots(therapistId, query, now = new Date()) {
    const { date, excludeId, sessionTypeId } = assertValid(validateSlotQuery(query));
    let minutes = (await this.findSessionType(therapistId, sessionTypeId))?.duration_minutes ?? null;
    if (minutes === null && excludeId) minutes = lengthInMinutes(await this.findOwned(therapistId, excludeId));
    const { slots, slotMinutes, breakMinutes } = await this.freeSlotMs(therapistId, date, excludeId, now, minutes);
    return {
      date,
      slot_minutes: slotMinutes,
      break_minutes: breakMinutes,
      slots: slots.map((ms) => new Date(ms).toISOString()),
    };
  }

  /** `minutes`: the session's length; the therapist's default session length when omitted. */
  async freeSlotMs(therapistId, date, excludeId, now, minutes = null) {
    const { startMs, endMs } = phDayRange(date);
    const [settings, availability, unavailable, busy] = await Promise.all([
      this.repo.getOrCreateSettings(therapistId),
      this.repo.getAvailability(therapistId),
      this.repo.getUnavailable(therapistId),
      this.repo.getBusyRanges(therapistId, startMs, endMs, excludeId),
    ]);
    const slotMinutes = minutes ?? settings.slot_minutes;
    const breakMinutes = settings.break_minutes ?? 0;
    const slots = freeSlotsForDay({
      availability,
      slotMinutes,
      breakMinutes,
      dateStr: date,
      notBeforeMs: now.getTime(),
      unavailableRanges: toRange(unavailable, "start_at", "end_at"),
      busyRanges: toRange(busy, "start_at", "end_at"),
    });
    return { slots, slotMinutes, breakMinutes };
  }

  /**
   * The start must be one of the day's free slots for a session of `minutes`:
   * in the future, inside working hours, outside blocked periods and not
   * already booked. Returns the session's end. The DB exclusion constraint
   * still guards concurrent bookings.
   */
  async assertBookable(therapistId, startAt, excludeId, now, minutes = null) {
    if (startAt.getTime() <= now.getTime()) {
      throw new AppError("The appointment time must be in the future.", 422, "SLOT_UNAVAILABLE");
    }
    const { slots, slotMinutes } = await this.freeSlotMs(therapistId, phDateOf(startAt.getTime()), excludeId, now, minutes);
    if (!slots.includes(startAt.getTime())) {
      throw new AppError(
        "That time is not available. Choose one of the free slots from your schedule.",
        409,
        "SLOT_UNAVAILABLE",
      );
    }
    return new Date(startAt.getTime() + slotMinutes * 60 * 1000);
  }

  // ---------- appointments ----------

  async listAppointments(therapistId, query) {
    return this.repo.list(therapistId, assertValid(validateListQuery(query)));
  }

  async getAppointment(therapistId, appointmentId) {
    const appointment = await this.findOwned(therapistId, appointmentId);
    const events = await this.repo.getEvents(appointmentId);
    return { ...appointment, events };
  }

  async findOwned(therapistId, appointmentId) {
    const appointment = await this.repo.findById(appointmentId, therapistId);
    if (!appointment) throw new NotFoundError("Appointment not found.");
    return appointment;
  }

  async book(therapistId, body, now = new Date()) {
    const data = assertValid(validateBookAppointment(body));
    const patient = await this.repo.findActivePatient(therapistId, data.patient_id);
    if (!patient) throw new NotFoundError("Patient not found.");
    if (data.follow_up_id) await this.assertFollowUpBookable(therapistId, data.follow_up_id, data.patient_id);
    const sessionType = await this.findSessionType(therapistId, data.session_type_id);
    if (data.repeat) return this.bookSeries(therapistId, data, sessionType, now);
    const endAt = await this.assertBookable(therapistId, data.start_at, null, now, sessionType?.duration_minutes);
    return this.repo.create({
      therapist_id: therapistId,
      patient_id: data.patient_id,
      follow_up_id: data.follow_up_id,
      start_at: data.start_at,
      end_at: endAt,
      reason: data.reason,
      ...sessionTypeFields(sessionType),
    });
  }

  /**
   * A recurring series: the same time every 1 or 2 weeks. Every date must be a
   * free slot; if some aren't, nothing is booked and they're listed (409) —
   * unless skip_unavailable, which books the free ones. All sessions are
   * created in one transaction and share a series_id.
   */
  async bookSeries(therapistId, data, sessionType, now) {
    const { every_weeks, count } = data.repeat;
    const starts = Array.from({ length: count }, (_, i) => new Date(data.start_at.getTime() + i * every_weeks * WEEK_MS));

    const free = [];
    const taken = [];
    let durationMinutes = null;
    for (const start of starts) {
      const { slots, slotMinutes } = await this.freeSlotMs(
        therapistId,
        phDateOf(start.getTime()),
        null,
        now,
        sessionType?.duration_minutes,
      );
      durationMinutes = slotMinutes;
      (start.getTime() > now.getTime() && slots.includes(start.getTime()) ? free : taken).push(start);
    }

    if (free.length === 0) {
      throw new AppError("None of these dates are free. Choose another time.", 409, "SLOT_UNAVAILABLE");
    }
    if (taken.length > 0 && !data.skip_unavailable) {
      throw new AppError(
        `${taken.length} of the ${count} dates ${taken.length === 1 ? "isn't" : "aren't"} free.`,
        409,
        "RECURRENCE_CONFLICT",
        { unavailable: taken.map((d) => d.toISOString()), available_count: free.length },
      );
    }

    const appointments = await this.repo.createSeries({
      series_id: randomUUID(),
      therapist_id: therapistId,
      patient_id: data.patient_id,
      follow_up_id: data.follow_up_id,
      reason: data.reason,
      duration_minutes: durationMinutes,
      ...sessionTypeFields(sessionType),
      starts: free,
    });
    return { appointments, skipped: taken.map((d) => d.toISOString()) };
  }

  /** A follow-up can be booked when it is the therapist's, for this patient, open, and not booked yet. */
  async assertFollowUpBookable(therapistId, followUpId, patientId) {
    const followUp = await this.repo.findFollowUpForBooking(therapistId, followUpId);
    if (!followUp) throw new NotFoundError("Follow-up not found.");
    if (followUp.patient_id !== patientId) {
      throw new AppError("This follow-up belongs to a different patient.", 422, "VALIDATION_ERROR");
    }
    if (followUp.status === "completed" || followUp.status === "cancelled") {
      throw new AppError(`This follow-up is already ${followUp.status}.`, 409, "INVALID_STATE");
    }
    if (followUp.is_booked) {
      throw new AppError("This follow-up already has a scheduled appointment.", 409, "FOLLOW_UP_ALREADY_BOOKED");
    }
  }

  /** Edit a scheduled appointment: move it to another free slot (keeping its length) and/or change the reason. */
  async update(therapistId, appointmentId, body, now = new Date()) {
    const patch = assertValid(validateUpdateAppointment(body));
    const appointment = await this.findOwned(therapistId, appointmentId);
    if (appointment.status !== "scheduled") {
      throw new AppError("Only scheduled appointments can be edited.", 409, "INVALID_STATE");
    }

    const moved = patch.start_at && patch.start_at.getTime() !== new Date(appointment.start_at).getTime();
    const changes = {};
    let event = { action: "updated", detail: "Reason updated" };
    if (moved) {
      changes.start_at = patch.start_at;
      changes.end_at = await this.assertBookable(therapistId, patch.start_at, appointmentId, now, lengthInMinutes(appointment));
      event = {
        action: "rescheduled",
        detail: `${new Date(appointment.start_at).toISOString()} → ${patch.start_at.toISOString()}`,
      };
    }
    if ("reason" in patch) changes.reason = patch.reason;
    if (Object.keys(changes).length === 0) return appointment;

    const updated = await this.repo.updateScheduled(appointmentId, therapistId, changes, event);
    if (!updated) throw new AppError("This appointment changed meanwhile. Please reload.", 409, "INVALID_STATE");
    return updated;
  }

  /** scope "following": this session and every later scheduled session of its series. */
  async cancel(therapistId, appointmentId, body) {
    const { reason, scope } = assertValid(validateCancel(body));
    const appointment = await this.findOwned(therapistId, appointmentId);
    if (scope !== "following" || !appointment.series_id) {
      return this.close(therapistId, appointmentId, "cancelled", reason, appointment);
    }
    const sessions = await this.repo.findSeriesFrom(therapistId, appointment.series_id, appointment.start_at);
    for (const session of sessions) {
      await this.close(therapistId, session.appointment_id, "cancelled", reason, session);
    }
    return { cancelled: sessions.length };
  }

  async recordOutcome(therapistId, appointmentId, toStatus, now = new Date()) {
    const appointment = await this.findOwned(therapistId, appointmentId);
    this.assertTransition(appointment.status, toStatus);
    assertValid(canRecordOutcome(appointment, now));
    return this.close(therapistId, appointmentId, toStatus, null, appointment);
  }

  /**
   * Take back a completed / no-show / cancelled shortly after recording it
   * (a closed appointment is never edited, so updated_at is when it closed).
   * It becomes scheduled again; an undone cancel fails if the time was
   * rebooked meanwhile (409 SLOT_TAKEN from the DB constraint).
   */
  async undoOutcome(therapistId, appointmentId, now = new Date()) {
    const appointment = await this.findOwned(therapistId, appointmentId);
    if (appointment.status === "scheduled") {
      throw new AppError("This appointment has nothing to undo.", 409, "INVALID_STATE");
    }
    if (now.getTime() - new Date(appointment.updated_at).getTime() > UNDO_WINDOW_MINUTES * 60 * 1000) {
      throw new AppError(
        `Undo is only possible within ${UNDO_WINDOW_MINUTES} minutes. Book a new appointment instead.`,
        409,
        "UNDO_EXPIRED",
      );
    }
    const reopened = await this.repo.reopenClosed(appointmentId, therapistId, appointment.status);
    if (!reopened) throw new AppError("This appointment changed meanwhile. Please reload.", 409, "INVALID_STATE");
    return reopened;
  }

  async close(therapistId, appointmentId, toStatus, reason, known = null) {
    const appointment = known ?? (await this.findOwned(therapistId, appointmentId));
    this.assertTransition(appointment.status, toStatus);
    const updated = await this.repo.closeScheduled(appointmentId, therapistId, toStatus, reason);
    if (!updated) throw new AppError("This appointment changed meanwhile. Please reload.", 409, "INVALID_STATE");
    return updated;
  }

  assertTransition(from, to) {
    const result = validateStatusTransition(from, to);
    if (!result.ok) {
      throw new AppError(result.errors[0], 409, "INVALID_TRANSITION");
    }
  }
}
