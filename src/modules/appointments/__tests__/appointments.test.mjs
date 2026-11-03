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
  validateSessionType,
  parseAppointmentId,
  canRecordOutcome,
  validateCancel,
  APPOINTMENT_TRANSITIONS,
} from "../application/validators/appointmentValidator.js";
import {
  generateCandidateSlots,
  computeFreeSlots,
  toRange,
  phDayRange,
  isWithinHours,
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
      data: {
        patient_id: 4,
        start_at: new Date("2026-11-02T01:00:00Z"),
        reason: "Follow-up",
        follow_up_id: null,
        session_type_id: null,
        repeat: null,
        skip_unavailable: false,
      },
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
    expect(validateSlotQuery({ date: "2026-11-02" })).toEqual({ ok: true, data: { date: "2026-11-02", excludeId: null, sessionTypeId: null } });
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
    listSessionTypes: vi.fn().mockResolvedValue([]),
    findSessionType: vi.fn().mockResolvedValue(null),
    createSessionType: vi.fn().mockImplementation(async (_id, data) => ({ session_type_id: 7, ...data })),
    updateSessionType: vi.fn(),
    deactivateSessionType: vi.fn().mockResolvedValue(true),
    getAvailability: vi.fn().mockResolvedValue([{ weekday: 0, start_time: "09:00", end_time: "12:00" }]),
    replaceAvailability: vi.fn().mockImplementation(async (_id, windows) => windows),
    getUnavailable: vi.fn().mockResolvedValue([]),
    addUnavailable: vi.fn(),
    removeUnavailable: vi.fn().mockResolvedValue(true),
    getBusyRanges: vi.fn().mockResolvedValue([]),
    findScheduled: vi.fn().mockResolvedValue([]),
    createSeries: vi.fn().mockImplementation(async (data) => data.starts.map((s, i) => ({ appointment_id: 100 + i, status: "scheduled", start_at: s.toISOString(), series_id: data.series_id }))),
    findSeriesFrom: vi.fn().mockResolvedValue([]),
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
      break_minutes: 0,
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

describe("isWithinHours", () => {
  const hours = [
    { weekday: 0, start_time: "09:00", end_time: "12:00" }, // Monday morning
    { weekday: 0, start_time: "13:00", end_time: "17:00" }, // Monday afternoon
  ];
  const at = (iso) => Date.parse(iso);

  test("an appointment fully inside a working window fits", () => {
    // Mon 10:00–11:00 Manila
    expect(isWithinHours(at("2026-11-02T02:00:00.000Z"), at("2026-11-02T03:00:00.000Z"), hours)).toBe(true);
  });

  test("one that runs past the window's end, or into lunch, does not", () => {
    // Mon 11:30–12:30 Manila
    expect(isWithinHours(at("2026-11-02T03:30:00.000Z"), at("2026-11-02T04:30:00.000Z"), hours)).toBe(false);
  });

  test("a closed day does not", () => {
    // Tue 10:00–11:00 Manila
    expect(isWithinHours(at("2026-11-03T02:00:00.000Z"), at("2026-11-03T03:00:00.000Z"), hours)).toBe(false);
  });
});

describe("AppointmentService — schedule changes that clash with booked appointments", () => {
  const booked = {
    appointment_id: 7,
    patient_name: "ANA CRUZ",
    start_at: "2026-11-02T02:00:00.000Z", // Mon 10:00 Manila
    end_at: "2026-11-02T03:00:00.000Z",
  };

  test("blocking time over a booked appointment warns first, listing it, and saves nothing", async () => {
    const repo = mockRepo({ findScheduled: vi.fn().mockResolvedValue([booked]) });
    const error = await new AppointmentService(repo)
      .addUnavailable(1, { start_at: "2026-11-02T00:00:00.000Z", end_at: "2026-11-02T09:00:00.000Z", reason: "Leave" })
      .catch((e) => e);
    expect(error).toMatchObject({ statusCode: 409, code: "SCHEDULE_CONFLICT" });
    expect(error.details.conflicts).toEqual([booked]);
    expect(repo.addUnavailable).not.toHaveBeenCalled();
    expect(repo.findScheduled).toHaveBeenCalledWith(1, { from: new Date("2026-11-02T00:00:00.000Z"), to: new Date("2026-11-02T09:00:00.000Z") });
  });

  test("…and saves once the therapist confirms", async () => {
    const repo = mockRepo({ findScheduled: vi.fn().mockResolvedValue([booked]) });
    await new AppointmentService(repo).addUnavailable(1, {
      start_at: "2026-11-02T00:00:00.000Z",
      end_at: "2026-11-02T09:00:00.000Z",
      confirm: true,
    });
    expect(repo.addUnavailable).toHaveBeenCalled();
  });

  test("blocking free time saves straight away", async () => {
    const repo = mockRepo();
    await new AppointmentService(repo).addUnavailable(1, { start_at: "2026-11-02T00:00:00.000Z", end_at: "2026-11-02T09:00:00.000Z" });
    expect(repo.addUnavailable).toHaveBeenCalled();
  });

  test("new working hours that leave an upcoming appointment outside them warn first", async () => {
    const repo = mockRepo({ findScheduled: vi.fn().mockResolvedValue([booked]) });
    const afternoonsOnly = [{ weekday: 0, start_time: "13:00", end_time: "17:00" }];
    const error = await new AppointmentService(repo).setAvailability(1, afternoonsOnly, {}, BEFORE_MONDAY).catch((e) => e);
    expect(error).toMatchObject({ statusCode: 409, code: "SCHEDULE_CONFLICT" });
    expect(error.details.conflicts).toEqual([booked]);
    expect(repo.replaceAvailability).not.toHaveBeenCalled();
    expect(repo.findScheduled).toHaveBeenCalledWith(1, { from: BEFORE_MONDAY });

    await new AppointmentService(repo).setAvailability(1, afternoonsOnly, { confirm: true }, BEFORE_MONDAY);
    expect(repo.replaceAvailability).toHaveBeenCalled();
  });

  test("new hours that still cover every appointment save straight away", async () => {
    const repo = mockRepo({ findScheduled: vi.fn().mockResolvedValue([booked]) });
    await new AppointmentService(repo).setAvailability(1, [{ weekday: 0, start_time: "09:00", end_time: "17:00" }], {}, BEFORE_MONDAY);
    expect(repo.replaceAvailability).toHaveBeenCalled();
  });
});

// ---------- recurring appointments ----------

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const plusWeeks = (iso, n) => new Date(Date.parse(iso) + n * WEEK_MS).toISOString();

describe("validateBookAppointment — repeating", () => {
  test("weekly or every 2 weeks, for 2–12 sessions", () => {
    const ok = validateBookAppointment({ patient_id: 9, start_at: MONDAY_9AM, repeat: { every_weeks: 2, count: 6 } });
    expect(ok.ok).toBe(true);
    expect(ok.data.repeat).toEqual({ every_weeks: 2, count: 6 });
    expect(ok.data.skip_unavailable).toBe(false);
  });

  test("rejects other intervals and counts", () => {
    expect(validateBookAppointment({ patient_id: 9, start_at: MONDAY_9AM, repeat: { every_weeks: 3, count: 4 } }).ok).toBe(false);
    expect(validateBookAppointment({ patient_id: 9, start_at: MONDAY_9AM, repeat: { every_weeks: 1, count: 13 } }).ok).toBe(false);
    expect(validateBookAppointment({ patient_id: 9, start_at: MONDAY_9AM, repeat: { every_weeks: 1, count: 1 } }).ok).toBe(false);
  });

  test("no repeat stays a single appointment", () => {
    expect(validateBookAppointment({ patient_id: 9, start_at: MONDAY_9AM }).data.repeat).toBeNull();
  });
});

describe("AppointmentService — booking a weekly series", () => {
  test("every date free: all sessions are booked together, one week apart, sharing a series id", async () => {
    const repo = mockRepo();
    const result = await new AppointmentService(repo).book(
      1,
      { patient_id: 9, start_at: MONDAY_9AM, reason: "Weekly therapy", repeat: { every_weeks: 1, count: 4 } },
      BEFORE_MONDAY,
    );
    const call = repo.createSeries.mock.calls[0][0];
    expect(call.starts.map((d) => d.toISOString())).toEqual([0, 1, 2, 3].map((n) => plusWeeks(MONDAY_9AM, n)));
    expect(call.series_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(call).toMatchObject({ therapist_id: 1, patient_id: 9, reason: "Weekly therapy", duration_minutes: 60 });
    expect(result.appointments).toHaveLength(4);
    expect(result.skipped).toEqual([]);
    expect(repo.create).not.toHaveBeenCalled();
  });

  test("every 2 weeks spaces sessions two weeks apart", async () => {
    const repo = mockRepo();
    await new AppointmentService(repo).book(1, { patient_id: 9, start_at: MONDAY_9AM, repeat: { every_weeks: 2, count: 3 } }, BEFORE_MONDAY);
    expect(repo.createSeries.mock.calls[0][0].starts.map((d) => d.toISOString())).toEqual([0, 2, 4].map((n) => plusWeeks(MONDAY_9AM, n)));
  });

  test("some dates taken: nothing is booked, and the taken dates are listed", async () => {
    const takenWeek2 = plusWeeks(MONDAY_9AM, 1);
    const repo = mockRepo({
      getBusyRanges: vi.fn().mockImplementation(async (_t, fromMs) =>
        fromMs <= Date.parse(takenWeek2) && Date.parse(takenWeek2) < fromMs + 24 * 3600 * 1000
          ? [{ start_at: takenWeek2, end_at: plusWeeks("2026-11-02T02:00:00.000Z", 1) }]
          : [],
      ),
    });
    const error = await new AppointmentService(repo)
      .book(1, { patient_id: 9, start_at: MONDAY_9AM, repeat: { every_weeks: 1, count: 3 } }, BEFORE_MONDAY)
      .catch((e) => e);
    expect(error).toMatchObject({ statusCode: 409, code: "RECURRENCE_CONFLICT" });
    expect(error.details).toEqual({ unavailable: [takenWeek2], available_count: 2 });
    expect(repo.createSeries).not.toHaveBeenCalled();
  });

  test("…skip_unavailable books the free dates only", async () => {
    const takenWeek2 = plusWeeks(MONDAY_9AM, 1);
    const repo = mockRepo({
      getBusyRanges: vi.fn().mockImplementation(async (_t, fromMs) =>
        fromMs <= Date.parse(takenWeek2) && Date.parse(takenWeek2) < fromMs + 24 * 3600 * 1000
          ? [{ start_at: takenWeek2, end_at: plusWeeks("2026-11-02T02:00:00.000Z", 1) }]
          : [],
      ),
    });
    const result = await new AppointmentService(repo).book(
      1,
      { patient_id: 9, start_at: MONDAY_9AM, repeat: { every_weeks: 1, count: 3 }, skip_unavailable: true },
      BEFORE_MONDAY,
    );
    expect(repo.createSeries.mock.calls[0][0].starts.map((d) => d.toISOString())).toEqual([MONDAY_9AM, plusWeeks(MONDAY_9AM, 2)]);
    expect(result.skipped).toEqual([takenWeek2]);
  });

  test("no date free at all: a clear error, nothing booked", async () => {
    const repo = mockRepo({ getAvailability: vi.fn().mockResolvedValue([]) });
    await expect(
      new AppointmentService(repo).book(1, { patient_id: 9, start_at: MONDAY_9AM, repeat: { every_weeks: 1, count: 3 }, skip_unavailable: true }, BEFORE_MONDAY),
    ).rejects.toMatchObject({ statusCode: 409, code: "SLOT_UNAVAILABLE" });
    expect(repo.createSeries).not.toHaveBeenCalled();
  });

  test("a follow-up is checked and passed along (it goes on the first session only)", async () => {
    const repo = mockRepo();
    await new AppointmentService(repo).book(
      1,
      { patient_id: 9, start_at: MONDAY_9AM, follow_up_id: 3, repeat: { every_weeks: 1, count: 2 } },
      BEFORE_MONDAY,
    );
    expect(repo.findFollowUpForBooking).toHaveBeenCalledWith(1, 3);
    expect(repo.createSeries.mock.calls[0][0].follow_up_id).toBe(3);
  });
});

describe("AppointmentService — cancelling within a series", () => {
  const session = { appointment_id: 5, status: "scheduled", series_id: "s-1", start_at: plusWeeks(MONDAY_9AM, 2) };

  test("'only this session' cancels just this one", async () => {
    const repo = mockRepo({ findById: vi.fn().mockResolvedValue(session) });
    await new AppointmentService(repo).cancel(1, 5, { reason: "Sick", scope: "one" });
    expect(repo.closeScheduled).toHaveBeenCalledTimes(1);
    expect(repo.findSeriesFrom).not.toHaveBeenCalled();
  });

  test("'this and following' cancels this session and every later scheduled one in the series", async () => {
    const later = [session, { ...session, appointment_id: 6 }, { ...session, appointment_id: 7 }];
    const repo = mockRepo({ findById: vi.fn().mockResolvedValue(session), findSeriesFrom: vi.fn().mockResolvedValue(later) });
    const result = await new AppointmentService(repo).cancel(1, 5, { reason: "Moved away", scope: "following" });
    expect(repo.findSeriesFrom).toHaveBeenCalledWith(1, "s-1", session.start_at);
    expect(repo.closeScheduled.mock.calls.map((c) => c[0])).toEqual([5, 6, 7]);
    expect(repo.closeScheduled.mock.calls.every((c) => c[2] === "cancelled" && c[3] === "Moved away")).toBe(true);
    expect(result).toMatchObject({ cancelled: 3 });
  });

  test("an unknown scope is rejected", () => {
    expect(validateCancel({ scope: "all-of-time" }).ok).toBe(false);
  });
});

// ---------- session types & break ----------

describe("validateSettings — break", () => {
  test("a break of 0–30 minutes, on its own or with the session length", () => {
    expect(validateSettings({ break_minutes: 10 })).toEqual({ ok: true, data: { break_minutes: 10 } });
    expect(validateSettings({ slot_minutes: 50, break_minutes: 0 })).toEqual({ ok: true, data: { slot_minutes: 50, break_minutes: 0 } });
    expect(validateSettings({ break_minutes: 31 }).ok).toBe(false);
    expect(validateSettings({ break_minutes: -5 }).ok).toBe(false);
    expect(validateSettings({}).ok).toBe(false);
  });
});

describe("validateSessionType", () => {
  test("needs a name and a 15–240 minute length", () => {
    expect(validateSessionType({ name: " Consultation ", duration_minutes: "30" })).toEqual({
      ok: true,
      data: { name: "Consultation", duration_minutes: 30 },
    });
    expect(validateSessionType({ name: "", duration_minutes: 30 }).ok).toBe(false);
    expect(validateSessionType({ name: "x".repeat(61), duration_minutes: 30 }).ok).toBe(false);
    expect(validateSessionType({ name: "Consultation", duration_minutes: 10 }).ok).toBe(false);
  });

  test("an edit may change just the length", () => {
    expect(validateSessionType({ duration_minutes: 45 }, { partial: true })).toEqual({ ok: true, data: { duration_minutes: 45 } });
    expect(validateSessionType({}, { partial: true }).ok).toBe(false);
  });

  test("booking and slot lookup accept an optional session type", () => {
    expect(validateBookAppointment({ patient_id: 4, start_at: MONDAY_9AM, session_type_id: "7" }).data.session_type_id).toBe(7);
    expect(validateBookAppointment({ patient_id: 4, start_at: MONDAY_9AM, session_type_id: "x" }).ok).toBe(false);
    expect(validateSlotQuery({ date: "2026-11-02", session_type_id: "7" }).data.sessionTypeId).toBe(7);
  });
});

describe("slots with a session length and a break", () => {
  const monday = { weekday: 0, start_time: "09:00", end_time: "12:00" };
  const day = { dateStr: "2026-11-02", notBeforeMs: 0, unavailableRanges: [] };
  const iso = (slots) => slots.map((ms) => new Date(ms).toISOString());

  test("a break spaces the sessions out", () => {
    // 50 min + 10 min break in 09:00–12:00 → 09:00, 10:00, 11:00
    const slots = freeSlotsForDay({ ...day, availability: [monday], slotMinutes: 50, breakMinutes: 10, busyRanges: [] });
    expect(iso(slots)).toEqual(["2026-11-02T01:00:00.000Z", "2026-11-02T02:00:00.000Z", "2026-11-02T03:00:00.000Z"]);
  });

  test("a longer session only gets starts where it fits", () => {
    // 90 min in 09:00–12:00 → 09:00, 10:30
    const slots = freeSlotsForDay({ ...day, availability: [monday], slotMinutes: 90, busyRanges: [] });
    expect(iso(slots)).toEqual(["2026-11-02T01:00:00.000Z", "2026-11-02T02:30:00.000Z"]);
  });

  test("the break after a booked appointment keeps the next slot free", () => {
    // 30-min sessions; booked 09:00–09:30
    const busy = [{ startMs: Date.parse("2026-11-02T01:00:00.000Z"), endMs: Date.parse("2026-11-02T01:30:00.000Z") }];
    const tight = freeSlotsForDay({ ...day, availability: [monday], slotMinutes: 30, breakMinutes: 0, busyRanges: busy });
    expect(iso(tight)).toContain("2026-11-02T01:30:00.000Z");
    // with a 15-min break the grid is 09:00, 09:45, 10:30, 11:15 and 09:45 is still free (09:30 + 15)
    const spaced = freeSlotsForDay({ ...day, availability: [monday], slotMinutes: 30, breakMinutes: 15, busyRanges: busy });
    expect(iso(spaced)).toEqual(["2026-11-02T01:45:00.000Z", "2026-11-02T02:30:00.000Z", "2026-11-02T03:15:00.000Z"]);
  });

  test("the break also keeps a new session from ending right before a booked one", () => {
    // booked 10:00–11:00, 60-min session at 09:00 would end at 10:00 with no break
    const busy = [{ startMs: Date.parse("2026-11-02T02:00:00.000Z"), endMs: Date.parse("2026-11-02T03:00:00.000Z") }];
    const candidates = [Date.parse("2026-11-02T01:00:00.000Z")];
    expect(computeFreeSlots({ candidates, unavailableRanges: [], busyRanges: busy, slotMs: 3600000 })).toEqual(candidates);
    expect(computeFreeSlots({ candidates, unavailableRanges: [], busyRanges: busy, slotMs: 3600000, breakMs: 15 * 60000 })).toEqual([]);
  });
});

describe("AppointmentService — session types", () => {
  const consultation = { session_type_id: 7, therapist_id: 1, name: "Consultation", duration_minutes: 30, is_active: true };

  test("the schedule lists the therapist's session types", async () => {
    const repo = mockRepo({ listSessionTypes: vi.fn().mockResolvedValue([consultation]) });
    const schedule = await new AppointmentService(repo).getSchedule(1);
    expect(schedule.session_types).toEqual([consultation]);
  });

  test("adding, editing and removing a type", async () => {
    const repo = mockRepo({ updateSessionType: vi.fn().mockResolvedValue({ ...consultation, duration_minutes: 45 }) });
    const service = new AppointmentService(repo);
    await service.createSessionType(1, { name: "Consultation", duration_minutes: 30 });
    expect(repo.createSessionType).toHaveBeenCalledWith(1, { name: "Consultation", duration_minutes: 30 });
    await service.updateSessionType(1, 7, { duration_minutes: 45 });
    expect(repo.updateSessionType).toHaveBeenCalledWith(1, 7, { duration_minutes: 45 });
    expect(await service.removeSessionType(1, 7)).toEqual({ removed: true });
  });

  test("editing or removing another therapist's type is a 404", async () => {
    const repo = mockRepo({ updateSessionType: vi.fn().mockResolvedValue(null), deactivateSessionType: vi.fn().mockResolvedValue(false) });
    const service = new AppointmentService(repo);
    await expect(service.updateSessionType(2, 7, { name: "X" })).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.removeSessionType(2, 7)).rejects.toMatchObject({ statusCode: 404 });
  });

  test("booking with a type takes its length and records its name", async () => {
    const repo = mockRepo({ findSessionType: vi.fn().mockResolvedValue(consultation) });
    await new AppointmentService(repo).book(1, { patient_id: 9, start_at: MONDAY_9AM, session_type_id: 7 }, BEFORE_MONDAY);
    expect(repo.findSessionType).toHaveBeenCalledWith(1, 7);
    const created = repo.create.mock.calls[0][0];
    expect(created.end_at.toISOString()).toBe("2026-11-02T01:30:00.000Z");
    expect(created).toMatchObject({ session_type_id: 7, session_type: "Consultation" });
  });

  test("booking without a type uses the default session length", async () => {
    const repo = mockRepo();
    await new AppointmentService(repo).book(1, { patient_id: 9, start_at: MONDAY_9AM }, BEFORE_MONDAY);
    expect(repo.create.mock.calls[0][0]).toMatchObject({ session_type_id: null, session_type: null });
  });

  test("an unknown or removed type cannot be booked", async () => {
    const repo = mockRepo({ findSessionType: vi.fn().mockResolvedValue(null) });
    await expect(
      new AppointmentService(repo).book(1, { patient_id: 9, start_at: MONDAY_9AM, session_type_id: 7 }, BEFORE_MONDAY),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.create).not.toHaveBeenCalled();
  });

  test("free slots follow the chosen type's length and the break", async () => {
    const repo = mockRepo({
      findSessionType: vi.fn().mockResolvedValue(consultation),
      getOrCreateSettings: vi.fn().mockResolvedValue({ therapist_id: 1, slot_minutes: 60, break_minutes: 15 }),
    });
    const result = await new AppointmentService(repo).getFreeSlots(1, { date: "2026-11-02", session_type_id: "7" }, BEFORE_MONDAY);
    expect(result.slot_minutes).toBe(30);
    expect(result.break_minutes).toBe(15);
    // 30 + 15 in 09:00–12:00 → 09:00, 09:45, 10:30, 11:15
    expect(result.slots).toEqual([
      "2026-11-02T01:00:00.000Z",
      "2026-11-02T01:45:00.000Z",
      "2026-11-02T02:30:00.000Z",
      "2026-11-02T03:15:00.000Z",
    ]);
  });

  test("a weekly series uses the type's length for every session", async () => {
    const repo = mockRepo({ findSessionType: vi.fn().mockResolvedValue({ ...consultation, duration_minutes: 90 }) });
    await new AppointmentService(repo).book(
      1,
      { patient_id: 9, start_at: MONDAY_9AM, session_type_id: 7, repeat: { every_weeks: 1, count: 2 } },
      BEFORE_MONDAY,
    );
    expect(repo.createSeries.mock.calls[0][0]).toMatchObject({ duration_minutes: 90, session_type_id: 7, session_type: "Consultation" });
  });

  test("rescheduling keeps the appointment's own length", async () => {
    const ninetyMinutes = { appointment_id: 5, therapist_id: 1, status: "scheduled", start_at: MONDAY_9AM, end_at: "2026-11-02T02:30:00.000Z" };
    const repo = mockRepo({ findById: vi.fn().mockResolvedValue(ninetyMinutes) });
    // a 90-min session can move to 10:30 (ends 12:00) even though the default length is 60
    await new AppointmentService(repo).update(1, 5, { start_at: "2026-11-02T02:30:00.000Z" }, BEFORE_MONDAY);
    expect(repo.updateScheduled.mock.calls[0][2].end_at.toISOString()).toBe("2026-11-02T04:00:00.000Z");
  });

  test("free times for moving an appointment fit its own length", async () => {
    const ninetyMinutes = { appointment_id: 5, therapist_id: 1, status: "scheduled", start_at: MONDAY_9AM, end_at: "2026-11-02T02:30:00.000Z" };
    const repo = mockRepo({ findById: vi.fn().mockResolvedValue(ninetyMinutes) });
    const result = await new AppointmentService(repo).getFreeSlots(1, { date: "2026-11-02", exclude: "5" }, BEFORE_MONDAY);
    expect(repo.findById).toHaveBeenCalledWith(5, 1);
    expect(result.slot_minutes).toBe(90);
    expect(result.slots).toEqual(["2026-11-02T01:00:00.000Z", "2026-11-02T02:30:00.000Z"]);
  });
});

// ---------- undo an outcome ----------

describe("AppointmentService — undo an outcome", () => {
  const closedAt = new Date("2026-11-02T03:00:00.000Z");
  const closed = (status) => ({ appointment_id: 5, therapist_id: 1, status, start_at: MONDAY_9AM, updated_at: closedAt.toISOString() });
  const minutesLater = (m) => new Date(closedAt.getTime() + m * 60000);

  test.each(["completed", "no_show", "cancelled"])("%s can be undone within 15 minutes", async (status) => {
    const repo = mockRepo({
      findById: vi.fn().mockResolvedValue(closed(status)),
      reopenClosed: vi.fn().mockResolvedValue({ ...closed("scheduled") }),
    });
    const result = await new AppointmentService(repo).undoOutcome(1, 5, minutesLater(14));
    expect(repo.reopenClosed).toHaveBeenCalledWith(5, 1, status);
    expect(result.status).toBe("scheduled");
  });

  test("after 15 minutes it is final", async () => {
    const repo = mockRepo({ findById: vi.fn().mockResolvedValue(closed("completed")), reopenClosed: vi.fn() });
    await expect(new AppointmentService(repo).undoOutcome(1, 5, minutesLater(16))).rejects.toMatchObject({ code: "UNDO_EXPIRED" });
    expect(repo.reopenClosed).not.toHaveBeenCalled();
  });

  test("a scheduled appointment has nothing to undo", async () => {
    const repo = mockRepo({ findById: vi.fn().mockResolvedValue(closed("scheduled")), reopenClosed: vi.fn() });
    await expect(new AppointmentService(repo).undoOutcome(1, 5, minutesLater(1))).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  test("another therapist's appointment is not found", async () => {
    const repo = mockRepo({ findById: vi.fn().mockResolvedValue(null), reopenClosed: vi.fn() });
    await expect(new AppointmentService(repo).undoOutcome(2, 5, minutesLater(1))).rejects.toMatchObject({ statusCode: 404 });
  });

  test("a change made meanwhile is reported", async () => {
    const repo = mockRepo({ findById: vi.fn().mockResolvedValue(closed("cancelled")), reopenClosed: vi.fn().mockResolvedValue(null) });
    await expect(new AppointmentService(repo).undoOutcome(1, 5, minutesLater(1))).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});
