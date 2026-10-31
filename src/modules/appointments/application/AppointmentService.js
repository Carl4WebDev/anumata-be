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
  canRecordOutcome,
  assertValid,
} from "./validators/appointmentValidator.js";
import { freeSlotsForDay, phDateOf, phDayRange, toRange } from "./slots.js";

const MAX_AVAILABILITY_WINDOWS = 50;

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
    const [settings, availability, unavailable] = await Promise.all([
      this.repo.getOrCreateSettings(therapistId),
      this.repo.getAvailability(therapistId),
      this.repo.getUnavailable(therapistId),
    ]);
    return { settings, availability, unavailable };
  }

  async updateSettings(therapistId, body) {
    return this.repo.updateSettings(therapistId, assertValid(validateSettings(body)));
  }

  async setAvailability(therapistId, windows) {
    if (!Array.isArray(windows)) {
      throw new AppError("windows must be a list.", 422, "VALIDATION_ERROR");
    }
    if (windows.length > MAX_AVAILABILITY_WINDOWS) {
      throw new AppError(`At most ${MAX_AVAILABILITY_WINDOWS} working-hour windows are allowed.`, 422, "VALIDATION_ERROR");
    }
    return this.repo.replaceAvailability(therapistId, assertValid(validateAvailabilityWindows(windows)));
  }

  async addUnavailable(therapistId, body) {
    return this.repo.addUnavailable(therapistId, assertValid(validateUnavailableRange(body)));
  }

  async removeUnavailable(therapistId, unavailableId) {
    const removed = await this.repo.removeUnavailable(therapistId, unavailableId);
    if (!removed) throw new NotFoundError("Blocked period not found.");
    return { removed: true };
  }

  // ---------- slots ----------

  /** Free slots on one Manila calendar day, as ISO strings. */
  async getFreeSlots(therapistId, query, now = new Date()) {
    const { date, excludeId } = assertValid(validateSlotQuery(query));
    const { slots, slotMinutes } = await this.freeSlotMs(therapistId, date, excludeId, now);
    return { date, slot_minutes: slotMinutes, slots: slots.map((ms) => new Date(ms).toISOString()) };
  }

  async freeSlotMs(therapistId, date, excludeId, now) {
    const { startMs, endMs } = phDayRange(date);
    const [settings, availability, unavailable, busy] = await Promise.all([
      this.repo.getOrCreateSettings(therapistId),
      this.repo.getAvailability(therapistId),
      this.repo.getUnavailable(therapistId),
      this.repo.getBusyRanges(therapistId, startMs, endMs, excludeId),
    ]);
    const slots = freeSlotsForDay({
      availability,
      slotMinutes: settings.slot_minutes,
      dateStr: date,
      notBeforeMs: now.getTime(),
      unavailableRanges: toRange(unavailable, "start_at", "end_at"),
      busyRanges: toRange(busy, "start_at", "end_at"),
    });
    return { slots, slotMinutes: settings.slot_minutes };
  }

  /**
   * The start must be one of the day's free slots: in the future, inside
   * working hours, outside blocked periods and not already booked. Returns the
   * slot's end. The DB exclusion constraint still guards concurrent bookings.
   */
  async assertBookable(therapistId, startAt, excludeId, now) {
    if (startAt.getTime() <= now.getTime()) {
      throw new AppError("The appointment time must be in the future.", 422, "SLOT_UNAVAILABLE");
    }
    const { slots, slotMinutes } = await this.freeSlotMs(therapistId, phDateOf(startAt.getTime()), excludeId, now);
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
    const endAt = await this.assertBookable(therapistId, data.start_at, null, now);
    return this.repo.create({
      therapist_id: therapistId,
      patient_id: data.patient_id,
      follow_up_id: data.follow_up_id,
      start_at: data.start_at,
      end_at: endAt,
      reason: data.reason,
    });
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

  /** Edit a scheduled appointment: move it to another free slot and/or change the reason. */
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
      changes.end_at = await this.assertBookable(therapistId, patch.start_at, appointmentId, now);
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

  async cancel(therapistId, appointmentId, body) {
    const { reason } = assertValid(validateCancel(body));
    return this.close(therapistId, appointmentId, "cancelled", reason);
  }

  async recordOutcome(therapistId, appointmentId, toStatus, now = new Date()) {
    const appointment = await this.findOwned(therapistId, appointmentId);
    this.assertTransition(appointment.status, toStatus);
    assertValid(canRecordOutcome(appointment, now));
    return this.close(therapistId, appointmentId, toStatus, null, appointment);
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
