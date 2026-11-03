import { describe, test, expect, vi } from "vitest";
import InterviewLinkService from "../application/InterviewLinkService.js";

const link = { interview_link_id: 3, token: "tok", status: "pending", patient_id: 9, therapist_id: 1, questions: [] };

describe("the patient's interview link", () => {
  test("includes when their next appointment is", async () => {
    const repo = {
      findByToken: vi.fn().mockResolvedValue(link),
      findNextAppointmentStart: vi.fn().mockResolvedValue("2026-11-16T01:00:00.000Z"),
    };
    const result = await new InterviewLinkService(repo).getPublicByToken("tok");
    expect(repo.findNextAppointmentStart).toHaveBeenCalledWith(9, 1);
    expect(result.next_appointment_at).toBe("2026-11-16T01:00:00.000Z");
  });

  test("no appointment booked yet gives null", async () => {
    const repo = { findByToken: vi.fn().mockResolvedValue(link), findNextAppointmentStart: vi.fn().mockResolvedValue(null) };
    expect((await new InterviewLinkService(repo).getPublicByToken("tok")).next_appointment_at).toBeNull();
  });

  test("an expired link is still refused", async () => {
    const repo = { findByToken: vi.fn().mockResolvedValue({ ...link, status: "expired" }), findNextAppointmentStart: vi.fn() };
    await expect(new InterviewLinkService(repo).getPublicByToken("tok")).rejects.toMatchObject({ statusCode: 410 });
  });
});
