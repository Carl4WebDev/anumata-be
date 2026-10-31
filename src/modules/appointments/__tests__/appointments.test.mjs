import { describe, test, expect, vi } from "vitest";
import {
  validateStatusTransition,
  validateBookAppointment,
  validateUpdateAppointment,
  validateSlotQuery,
  validateListQuery,
  validateAvailabilityWindow,
  validateAvailabilityWindows,
  validateUnavailableRange,
  validateSettings,
  parseAppointmentId,
  canRecordOutcome,
  APPOINTMENT_TRANSITIONS,
} from "../application/validators/appointmentValidator.js";
import {
  generateCandidateSlots,
  computeFreeSlots,
  toRange,
  phDayRange,
  phDateOf,
  freeSlotsForDay,
} from "../application/slots.js";
import AppointmentService from "../application/AppointmentService.js";

// ---------- status lifecycle ----------

describe("validateStatusTransition", () => {
  test("a scheduled appointment can be completed, missed or cancelled", () => {
    expect(validateStatusTransition("scheduled", "completed").ok).toBe(true);
    expect(validateStatusTransition("scheduled", "no_show").ok).toBe(true);
    expect(validateStatusTransition("scheduled", "cancelled").ok).toBe(true);
  });

  test("closed statuses admit no transitions", () => {
    for (const closed of ["completed", "no_show", "cancelled"]) {
      expect(APPOINTMENT_TRANSITIONS[closed]).toEqual([]);
      expect(validateStatusTransition(closed, "scheduled").ok).toBe(false);
    }
  });

  test("rejects unknown statuses", () => {
    expect(validateStatusTransition("mystery", "completed").ok).toBe(false);
  });
});

// ---------- input validation ----------

describe("validateBookAppointment", () => {
  test("accepts patient + time + optional reason", () => {
    const result = validateBookAppointment({ patient_id: "4", start_at: "2026-11-02T01:00:00Z", reason: " Follow-up " });
    expect(result).toEqual({
      ok: true,
      data: { patient_id: 4, start_at: new Date("2026-11-02T01:00:00Z"), reason: "Follow-up", follow_up_id: null },
    });
  });

  test("accepts an optional follow-up id", () => {
    const result = validateBookAppointment({ patient_id: 4, start_at: "2026-11-02T01:00:00Z", follow_up_id: "3" });
    expect(result.data.follow_up_id).toBe(3);
    expect(validateBookAppointment({ patient_id: 4, start_at: "2026-11-02T01:00:00Z", follow_up_id: "x" }).ok).toBe(false);
  });

  test("requires a patient and a valid time", () => {
    const result = validateBookAppointment({ start_at: "nope" });
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(2);
  });

  test("limits reason length", () => {
    expect(validateBookAppointment({ patient_id: 1, start_at: "2026-11-02T01:00:00Z", reason: "x".repeat(256) }).ok).toBe(false);
  });
});

describe("validateUpdateAppointment", () => {
  test("needs at least one change", () => {
    expect(validateUpdateAppointment({}).ok).toBe(false);
  });

  test("reason alone is a valid edit, and can be cleared", () => {
    expect(validateUpdateAppointment({ reason: "" })).toEqual({ ok: true, data: { reason: null } });
  });

  test("rejects an invalid new time", () => {
    expect(validateUpdateAppointment({ start_at: "garbage" }).ok).toBe(false);
  });
});

describe("validateSlotQuery / validateListQuery / parseAppointmentId", () => {
  test("slot date must be YYYY-MM-DD", () => {
    expect(validateSlotQuery({ date: "2026-11-02" })).toEqual({ ok: true, data: { date: "2026-11-02", excludeId: null } });
    expect(validateSlotQuery({ date: "11/02/2026" }).ok).toBe(false);
    expect(validateSlotQuery({ date: "2026-11-02", exclude: "x" }).ok).toBe(false);
  });

  test("list filters are validated and normalized", () => {
    expect(validateListQuery({ status: "nope" }).ok).toBe(false);
    expect(validateListQuery({ from: "garbage" }).ok).toBe(false);
    const result = validateListQuery({ status: "scheduled", patient_id: "3", from: "2026-11-01" });
    expect(result.data).toEqual({ status: "scheduled", patient_id: 3, from: "2026-11-01T00:00:00.000Z" });
  });

  test("ids must be positive integers", () => {
    expect(parseAppointmentId("12")).toEqual({ ok: true, data: 12 });
    expect(parseAppointmentId("abc").ok).toBe(false);
    expect(parseAppointmentId("-1").ok).toBe(false);
  });
});

describe("canRecordOutcome", () => {
  const startAt = new Date("2026-11-01T02:00:00.000Z");

  test("rejects completed/no_show before the appointment starts", () => {
    expect(canRecordOutcome({ start_at: startAt }, new Date(startAt.getTime() - 1000)).ok).toBe(false);
  });

  test("allows outcomes after start", () => {
    expect(canRecordOutcome({ start_at: startAt }, new Date(startAt.getTime() + 1000)).ok).toBe(true);
  });
});

describe("schedule validators", () => {
  test("rejects invalid weekday/time windows", () => {
    expect(validateAvailabilityWindow({ weekday: 7, start_time: "09:00", end_time: "17:00" }).ok).toBe(false);
    expect(validateAvailabilityWindow({ weekday: 0, start_time: "9am", end_time: "17:00" }).ok).toBe(false);
    expect(validateAvailabilityWindow({ weekday: 0, start_time: "17:00", end_time: "09:00" }).ok).toBe(false);
  });

  test("rejects overlapping windows on the same day, allows split days", () => {
    expect(
      validateAvailabilityWindows([
        { weekday: 0, start_time: "09:00", end_time: "12:00" },
        { weekday: 0, start_time: "11:00", end_time: "15:00" },
      ]).ok,
    ).toBe(false);
    const split = validateAvailabilityWindows([
      { weekday: 0, start_time: "13:00", end_time: "17:00" },
      { weekday: 0, start_time: "09:00", end_time: "12:00" },
      { weekday: 1, start_time: "09:00", end_time: "12:00" },
    ]);
    expect(split.ok).toBe(true);
    expect(split.data[0].start_time).toBe("09:00");
  });

  test("rejects inverted blocked periods", () => {
    expect(validateUnavailableRange({ start_at: "2026-11-05T00:00:00Z", end_at: "2026-11-04T00:00:00Z" }).ok).toBe(false);
  });

  test("bounds session length", () => {
    expect(validateSettings({ slot_minutes: 5 }).ok).toBe(false);
    expect(validateSettings({ slot_minutes: 241 }).ok).toBe(false);
    expect(validateSettings({ slot_minutes: 45 })).toEqual({ ok: true, data: { slot_minutes: 45 } });
  });
});

// ---------- slot computation ----------

describe("slot computation", () => {
  const settings = { slot_minutes: 60 };
  // Mon 2026-11-02 in +08:00 (no DST).
  const horizonStart = new Date("2026-11-01T16:00:00.000Z").getTime();
  const horizonEnd = horizonStart + 2 * 24 * 60 * 60 * 1000;
  const availability = [{ weekday: 0, start_time: "09:00", end_time: "12:00" }]; // Monday 9-12 → 3 slots

  test("generates one slot per slot_minutes within the window", () => {
    const candidates = generateCandidateSlots({
      availability,
      settings,
      horizonStartMs: horizonStart,
      horizonEndMs: horizonEnd,
      notBeforeMs: horizonStart,
    });
    expect(candidates).toHaveLength(3);
    // First slot is Monday 09:00 +08:00 = 01:00Z.
    expect(new Date(candidates[0]).toISOString()).toBe("2026-11-02T01:00:00.000Z");
  });

  test("excludes slots that overlap unavailable ranges or busy appointments", () => {
    const candidates = generateCandidateSlots({
      availability,
      settings,
      horizonStartMs: horizonStart,
      horizonEndMs: horizonEnd,
      notBeforeMs: horizonStart,
    });
    const free = computeFreeSlots({
      candidates,
      unavailableRanges: [{ startMs: candidates[0], endMs: candidates[0] + 3600000 }],
      busyRanges: [{ startMs: candidates[1], endMs: candidates[1] + 3600000 }],
      slotMs: 3600000,
    });
    expect(free).toEqual([candidates[2]]);
  });

  test("variable durations block only overlapping slots", () => {
    const starts = [0, 3600000, 7200000];
    const free = computeFreeSlots({
      candidates: starts,
      unavailableRanges: [],
      busyRanges: [{ startMs: 3600000, endMs: 3600000 + 30 * 60000 }], // 30-min meeting
      slotMs: 3600000,
    });
    expect(free).toEqual([0, 7200000]);
  });

  test("toRange drops invalid rows", () => {
    const ranges = toRange(
      [{ a: "2026-11-01T00:00:00Z", b: "2026-11-01T01:00:00Z" }, { a: "bad", b: "2026-11-01T01:00:00Z" }],
      "a",
      "b",
    );
    expect(ranges).toHaveLength(1);
  });

  test("Manila day helpers", () => {
    expect(phDayRange("2026-11-02")).toEqual({
      startMs: Date.parse("2026-11-01T16:00:00.000Z"),
      endMs: Date.parse("2026-11-02T16:00:00.000Z"),
    });
    // 23:30 UTC on Nov 1 is already Nov 2 in Manila.
    expect(phDateOf(Date.parse("2026-11-01T23:30:00.000Z"))).toBe("2026-11-02");
  });

  test("freeSlotsForDay stays inside that day and after `notBefore`", () => {
    const slots = freeSlotsForDay({
      availability: [
        { weekday: 0, start_time: "09:00", end_time: "12:00" },
        { weekday: 1, start_time: "09:00", end_time: "12:00" },
      ],
      slotMinutes: 60,
      dateStr: "2026-11-02",
      notBeforeMs: Date.parse("2026-11-02T01:30:00.000Z"), // 09:30 Manila
      unavailableRanges: [],
      busyRanges: [],
    });
    expect(slots.map((ms) => new Date(ms).toISOString())).toEqual([
      "2026-11-02T02:00:00.000Z",
      "2026-11-02T03:00:00.000Z",
    ]);
  });
});

// ---------- service flows with a mock repo ----------

const MONDAY_9AM = "2026-11-02T01:00:00.000Z"; // Mon 09:00 Manila
const BEFORE_MONDAY = new Date("2026-10-30T00:00:00.000Z");

function mockRepo(overrides = {}) {
  return {
    getOrCreateSettings: vi.fn().mockResolvedValue({ therapist_id: 1, slot_minutes: 60 }),
    updateSettings: vi.fn(),
    getAvailability: vi.fn().mockResolvedValue([{ weekday: 0, start_time: "09:00", end_time: "12:00" }]),
    replaceAvailability: vi.fn().mockImplementation(async (_id, windows) => windows),
    getUnavailable: vi.fn().mockResolvedValue([]),
    addUnavailable: vi.fn(),
    removeUnavailable: vi.fn().mockResolvedValue(true),
    getBusyRanges: vi.fn().mockResolvedValue([]),
    findActivePatient: vi.fn().mockResolvedValue({ patient_id: 9, full_name: "ANA CRUZ" }),
    findFollowUpForBooking: vi.fn().mockResolvedValue({ follow_up_id: 3, patient_id: 9, status: "recommended", is_booked: false }),
    create: vi.fn().mockImplementation(async (data) => ({ appointment_id: 1, status: "scheduled", ...data })),
    updateScheduled: vi.fn().mockImplementation(async (id, _t, changes) => ({ appointment_id: id, status: "scheduled", ...changes })),
    closeScheduled: vi.fn().mockImplementation(async (id, _t, status) => ({ appointment_id: id, status })),
    findById: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    getEvents: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("AppointmentService — booking", () => {
  test("books a patient into a free slot; end comes from session length", async () => {
    const repo = mockRepo();
    const result = await new AppointmentService(repo).book(1, { patient_id: 9, start_at: MONDAY_9AM, reason: "Intake" }, BEFORE_MONDAY);
    expect(result.status).toBe("scheduled");
    const created = repo.create.mock.calls[0][0];
    expect(created.end_at.toISOString()).toBe("2026-11-02T02:00:00.000Z");
    expect(created.reason).toBe("Intake");
  });

  test("rejects a time outside working hours", async () => {
    const repo = mockRepo();
    await expect(
      new AppointmentService(repo).book(1, { patient_id: 9, start_at: "2026-11-02T10:00:00.000Z" }, BEFORE_MONDAY),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    expect(repo.create).not.toHaveBeenCalled();
  });

  test("rejects a time that is not on a slot boundary", async () => {
    const repo = mockRepo();
    await expect(
      new AppointmentService(repo).book(1, { patient_id: 9, start_at: "2026-11-02T01:30:00.000Z" }, BEFORE_MONDAY),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });

  test("rejects an already booked slot", async () => {
    const repo = mockRepo({
      getBusyRanges: vi.fn().mockResolvedValue([{ start_at: MONDAY_9AM, end_at: "2026-11-02T02:00:00.000Z" }]),
    });
    await expect(new AppointmentService(repo).book(1, { patient_id: 9, start_at: MONDAY_9AM }, BEFORE_MONDAY))
      .rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });

  test("rejects a blocked period", async () => {
    const repo = mockRepo({
      getUnavailable: vi.fn().mockResolvedValue([{ start_at: "2026-11-01T16:00:00.000Z", end_at: "2026-11-02T16:00:00.000Z" }]),
    });
    await expect(new AppointmentService(repo).book(1, { patient_id: 9, start_at: MONDAY_9AM }, BEFORE_MONDAY))
      .rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });

  test("rejects past times", async () => {
    const repo = mockRepo();
    await expect(
      new AppointmentService(repo).book(1, { patient_id: 9, start_at: MONDAY_9AM }, new Date("2026-11-03T00:00:00Z")),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });

  test("patient must belong to the therapist and be active", async () => {
    const repo = mockRepo({ findActivePatient: vi.fn().mockResolvedValue(null) });
    await expect(new AppointmentService(repo).book(1, { patient_id: 9, start_at: MONDAY_9AM }, BEFORE_MONDAY))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(repo.create).not.toHaveBeenCalled();
  });

  test("free slots for a day hide booked times", async () => {
    const repo = mockRepo({
      getBusyRanges: vi.fn().mockResolvedValue([{ start_at: MONDAY_9AM, end_at: "2026-11-02T02:00:00.000Z" }]),
    });
    const result = await new AppointmentService(repo).getFreeSlots(1, { date: "2026-11-02" }, BEFORE_MONDAY);
    expect(result).toEqual({
      date: "2026-11-02",
      slot_minutes: 60,
      slots: ["2026-11-02T02:00:00.000Z", "2026-11-02T03:00:00.000Z"],
    });
  });
});

describe("AppointmentService — booking from a follow-up", () => {
  const body = { patient_id: 9, start_at: MONDAY_9AM, follow_up_id: 3 };

  test("links the appointment to the follow-up", async () => {
    const repo = mockRepo();
    await new AppointmentService(repo).book(1, body, BEFORE_MONDAY);
    expect(repo.findFollowUpForBooking).toHaveBeenCalledWith(1, 3);
    expect(repo.create.mock.calls[0][0].follow_up_id).toBe(3);
  });

  test("a missed follow-up can be rebooked", async () => {
    const repo = mockRepo({
      findFollowUpForBooking: vi.fn().mockResolvedValue({ follow_up_id: 3, patient_id: 9, status: "missed", is_booked: false }),
    });
    await new AppointmentService(repo).book(1, body, BEFORE_MONDAY);
    expect(repo.create).toHaveBeenCalled();
  });

  test("rejects another therapist's or unknown follow-up", async () => {
    const repo = mockRepo({ findFollowUpForBooking: vi.fn().mockResolvedValue(null) });
    await expect(new AppointmentService(repo).book(1, body, BEFORE_MONDAY)).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.create).not.toHaveBeenCalled();
  });

  test("rejects a follow-up of a different patient", async () => {
    const repo = mockRepo({
      findFollowUpForBooking: vi.fn().mockResolvedValue({ follow_up_id: 3, patient_id: 99, status: "recommended", is_booked: false }),
    });
    await expect(new AppointmentService(repo).book(1, body, BEFORE_MONDAY)).rejects.toMatchObject({ statusCode: 422 });
  });

  test("rejects a closed follow-up", async () => {
    const repo = mockRepo({
      findFollowUpForBooking: vi.fn().mockResolvedValue({ follow_up_id: 3, patient_id: 9, status: "completed", is_booked: false }),
    });
    await expect(new AppointmentService(repo).book(1, body, BEFORE_MONDAY)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  test("rejects a follow-up that is already booked", async () => {
    const repo = mockRepo({
      findFollowUpForBooking: vi.fn().mockResolvedValue({ follow_up_id: 3, patient_id: 9, status: "scheduled", is_booked: true }),
    });
    await expect(new AppointmentService(repo).book(1, body, BEFORE_MONDAY)).rejects.toMatchObject({ code: "FOLLOW_UP_ALREADY_BOOKED" });
  });

  test("booking without a follow-up skips the follow-up checks", async () => {
    const repo = mockRepo();
    await new AppointmentService(repo).book(1, { patient_id: 9, start_at: MONDAY_9AM }, BEFORE_MONDAY);
    expect(repo.findFollowUpForBooking).not.toHaveBeenCalled();
    expect(repo.create.mock.calls[0][0].follow_up_id).toBeNull();
  });
});

describe("AppointmentService — editing", () => {
  const scheduled = { appointment_id: 5, therapist_id: 1, status: "scheduled", start_at: MONDAY_9AM, patient_id: 9 };

  test("moving to another free slot reschedules and ignores its own current slot", async () => {
    const repo = mockRepo({ findById: vi.fn().mockResolvedValue(scheduled) });
    await new AppointmentService(repo).update(1, 5, { start_at: "2026-11-02T02:00:00.000Z" }, BEFORE_MONDAY);
    expect(repo.getBusyRanges.mock.calls[0][3]).toBe(5);
    const [, , changes, event] = repo.updateScheduled.mock.calls[0];
    expect(changes.end_at.toISOString()).toBe("2026-11-02T03:00:00.000Z");
    expect(event.action).toBe("rescheduled");
  });

  test("editing only the reason does not re-check the slot", async () => {
    const repo = mockRepo({ findById: vi.fn().mockResolvedValue(scheduled) });
    await new AppointmentService(repo).update(1, 5, { reason: "Changed focus" }, BEFORE_MONDAY);
    expect(repo.getBusyRanges).not.toHaveBeenCalled();
    expect(repo.updateScheduled.mock.calls[0][2]).toEqual({ reason: "Changed focus" });
    expect(repo.updateScheduled.mock.calls[0][3].action).toBe("updated");
  });

  test("cannot edit a closed appointment", async () => {
    const repo = mockRepo({ findById: vi.fn().mockResolvedValue({ ...scheduled, status: "completed" }) });
    await expect(new AppointmentService(repo).update(1, 5, { reason: "x" })).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  test("cancel keeps the record with a reason", async () => {
    const repo = mockRepo({ findById: vi.fn().mockResolvedValue(scheduled) });
    const result = await new AppointmentService(repo).cancel(1, 5, { reason: "Patient called in sick" });
    expect(repo.closeScheduled).toHaveBeenCalledWith(5, 1, "cancelled", "Patient called in sick");
    expect(result.status).toBe("cancelled");
  });

  test("cannot cancel twice", async () => {
    const repo = mockRepo({ findById: vi.fn().mockResolvedValue({ ...scheduled, status: "cancelled" }) });
    await expect(new AppointmentService(repo).cancel(1, 5, {})).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  test("completed / no-show only after the start time", async () => {
    const repo = mockRepo({ findById: vi.fn().mockResolvedValue(scheduled) });
    const service = new AppointmentService(repo);
    await expect(service.recordOutcome(1, 5, "completed", BEFORE_MONDAY)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await service.recordOutcome(1, 5, "no_show", new Date("2026-11-02T03:00:00Z"));
    expect(repo.closeScheduled).toHaveBeenCalledWith(5, 1, "no_show", null);
  });

  test("ownership enforced: other therapist's appointment is not found", async () => {
    const repo = mockRepo({ findById: vi.fn().mockResolvedValue(null) });
    await expect(new AppointmentService(repo).cancel(2, 5, {})).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("AppointmentService — schedule setup", () => {
  test("working hours are validated before saving", async () => {
    const repo = mockRepo();
    await expect(
      new AppointmentService(repo).setAvailability(1, [{ weekday: 9, start_time: "09:00", end_time: "10:00" }]),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(repo.replaceAvailability).not.toHaveBeenCalled();
  });

  test("windows must be a list", async () => {
    await expect(new AppointmentService(mockRepo()).setAvailability(1, undefined)).rejects.toMatchObject({ statusCode: 422 });
  });

  test("removing an unknown blocked period is a 404", async () => {
    const repo = mockRepo({ removeUnavailable: vi.fn().mockResolvedValue(false) });
    await expect(new AppointmentService(repo).removeUnavailable(1, 3)).rejects.toMatchObject({ statusCode: 404 });
  });
});
