import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { dueReminder, enabledKinds, DEFAULT_REMINDER_KINDS } from "../application/reminderSchedule.js";
import { reminderTemplateParams } from "../application/reminderEmail.js";
import ReminderService from "../application/ReminderService.js";
import { isEmailConfigured, sendEmail } from "../infrastructure/emailjsSender.js";

const HOUR = 60 * 60 * 1000;
const both = DEFAULT_REMINDER_KINDS;

describe("when a reminder is due", () => {
  test("day-before once within 24 hours, hours-before once within 2 hours", () => {
    expect(dueReminder(30 * HOUR, 0, both, new Set())).toBeNull();
    expect(dueReminder(23 * HOUR, 0, both, new Set())).toBe("day_before");
    expect(dueReminder(90 * 60 * 1000, 0, both, new Set(["day_before"]))).toBe("hours_before");
  });

  test("each kind only once; nothing after the start", () => {
    expect(dueReminder(23 * HOUR, 0, both, new Set(["day_before"]))).toBeNull();
    expect(dueReminder(HOUR, 0, both, new Set(["day_before", "hours_before"]))).toBeNull();
    expect(dueReminder(-1, 0, both, new Set())).toBeNull();
  });

  test("booked less than 2 hours ahead → only the hours-before reminder", () => {
    expect(dueReminder(HOUR, 0, both, new Set())).toBe("hours_before");
  });

  test("kinds can be turned off with REMINDER_KINDS", () => {
    expect(enabledKinds("day_before")).toEqual(["day_before"]);
    expect(enabledKinds("")).toEqual(both);
    expect(enabledKinds("weekly, hours_before")).toEqual(["hours_before"]);
    expect(dueReminder(HOUR, 0, ["day_before"], new Set())).toBeNull();
  });
});

describe("the reminder email", () => {
  test("names the patient and therapist and says when — in Philippine time, no clinical details", () => {
    const params = reminderTemplateParams(
      { start_at: "2026-11-03T05:00:00.000Z", session_type: null, patient_first_name: "JUAN", patient_email: "juan@gmail.com", therapist_name: "Ana Reyes" },
      "day_before",
    );
    expect(params).toMatchObject({
      to_email: "juan@gmail.com",
      to_name: "Juan",
      therapist_name: "Ana Reyes",
      appointment_date: "Tuesday, November 3, 2026",
      session_type: "Therapy session",
    });
    expect(params.appointment_time).toMatch(/^1:00\sPM$/);
    expect(Object.keys(params)).not.toContain("concern");
  });
});

describe("sending the due reminders", () => {
  const appt = (id, hoursAway, sent = []) => ({
    appointment_id: id,
    start_at: new Date(Date.UTC(2026, 10, 3, 0) + hoursAway * HOUR).toISOString(),
    session_type: "Consultation",
    patient_first_name: "Ana",
    patient_email: "ana@gmail.com",
    therapist_name: "Dr. Cruz",
    sent_kinds: sent,
  });
  const now = new Date(Date.UTC(2026, 10, 3, 0));

  test("sends what's due, logs the result, skips the rest", async () => {
    const repo = {
      findUpcoming: vi.fn().mockResolvedValue([appt(1, 20), appt(2, 20, ["day_before"]), appt(3, 1)]),
      claim: vi.fn().mockImplementation(async (id, kind) => `${id}-${kind}`),
      finish: vi.fn(),
    };
    const send = vi.fn().mockResolvedValue({ ok: true });
    const result = await new ReminderService(repo, send, both).sendDue(now);
    expect(result).toEqual({ sent: 2, failed: 0 });
    expect(repo.claim.mock.calls).toEqual([
      [1, "day_before"],
      [3, "hours_before"],
    ]);
    expect(repo.finish).toHaveBeenCalledWith("1-day_before", "sent");
  });

  test("a reminder another run already claimed is not sent twice", async () => {
    const repo = { findUpcoming: vi.fn().mockResolvedValue([appt(1, 20)]), claim: vi.fn().mockResolvedValue(null), finish: vi.fn() };
    const send = vi.fn();
    expect(await new ReminderService(repo, send, both).sendDue(now)).toEqual({ sent: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  test("a failed send is logged with its error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const repo = { findUpcoming: vi.fn().mockResolvedValue([appt(1, 20)]), claim: vi.fn().mockResolvedValue(7), finish: vi.fn() };
    const send = vi.fn().mockResolvedValue({ ok: false, error: "EmailJS 403: blocked" });
    expect(await new ReminderService(repo, send, both).sendDue(now)).toEqual({ sent: 0, failed: 1 });
    expect(repo.finish).toHaveBeenCalledWith(7, "failed", "EmailJS 403: blocked");
  });
});

describe("EmailJS sender", () => {
  const env = { ...process.env };
  beforeEach(() => {
    Object.assign(process.env, {
      EMAILJS_SERVICE_ID: "service_x",
      EMAILJS_TEMPLATE_ID: "template_y",
      EMAILJS_PUBLIC_KEY: "pub",
      EMAILJS_PRIVATE_KEY: "priv",
    });
  });
  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  test("posts the template and keys to EmailJS", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    expect(isEmailConfigured()).toBe(true);
    expect(await sendEmail({ to_email: "a@b.co" }, fetchImpl)).toEqual({ ok: true });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.emailjs.com/api/v1.0/email/send");
    expect(JSON.parse(options.body)).toEqual({
      service_id: "service_x",
      template_id: "template_y",
      user_id: "pub",
      accessToken: "priv",
      template_params: { to_email: "a@b.co" },
    });
  });

  test("errors come back as a result, never thrown", async () => {
    const rejected = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "API calls are disabled for non-browser applications" });
    expect(await sendEmail({}, rejected)).toEqual({ ok: false, error: "EmailJS 403: API calls are disabled for non-browser applications" });
    const offline = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    expect((await sendEmail({}, offline)).error).toMatch(/unreachable/);
  });

  test("not configured without all four keys", () => {
    delete process.env.EMAILJS_PRIVATE_KEY;
    expect(isEmailConfigured()).toBe(false);
  });
});
