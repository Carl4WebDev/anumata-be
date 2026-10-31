import { describe, test, expect, vi, afterEach } from "vitest";
import NotificationService from "../application/NotificationService.js";
import EmotionAnalysisService from "../../emotion_analysis/application/EmotionAnalysisService.js";
import { postFormData } from "../../../core/http/httpPost.js";

vi.mock("../../../core/http/httpPost.js", () => ({ postFormData: vi.fn() }));

const LINK = {
  interview_link_id: 7,
  therapist_id: 3,
  patient_id: 9,
  patient_name: "MARIA SANTOS ",
  status: "pending",
  questions: ["How are you?"],
};

function fakeRepo(overrides = {}) {
  return {
    create: vi.fn().mockImplementation(async (n) => ({ notification_id: 1, ...n })),
    listForUser: vi.fn().mockResolvedValue([]),
    countUnread: vi.fn().mockResolvedValue(0),
    markRead: vi.fn().mockResolvedValue(true),
    markAllRead: vi.fn().mockResolvedValue(2),
    ...overrides,
  };
}

describe("NotificationService.notifyInterview", () => {
  test("interview finished → therapist notified with the patient's name", async () => {
    const repo = fakeRepo();
    await new NotificationService(repo).notifyInterview(LINK, "interview_finished");
    expect(repo.create).toHaveBeenCalledWith({
      user_id: 3,
      type: "interview_finished",
      title: "MARIA SANTOS finished the interview",
      message: expect.stringContaining("being analysed"),
      link: "/patients/9",
      patient_id: 9,
      interview_link_id: 7,
    });
  });

  test("results ready links straight to the session review", async () => {
    const repo = fakeRepo();
    await new NotificationService(repo).notifyInterview(LINK, "results_ready", { sessionId: 42 });
    expect(repo.create.mock.calls[0][0]).toMatchObject({ title: "Results ready for MARIA SANTOS", link: "/sessions/42" });
  });

  test("a database error never escapes (the interview must not break)", async () => {
    const repo = fakeRepo({ create: vi.fn().mockRejectedValue(new Error("db down")) });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(new NotificationService(repo).notifyInterview(LINK, "interview_finished")).resolves.toBeNull();
  });

  test("inbox returns items and the unread count", async () => {
    const repo = fakeRepo({ listForUser: vi.fn().mockResolvedValue([{ notification_id: 1 }]), countUnread: vi.fn().mockResolvedValue(1) });
    expect(await new NotificationService(repo).getInbox(3)).toEqual({ items: [{ notification_id: 1 }], unread_count: 1 });
  });

  test("marking someone else's notification is a 404", async () => {
    const repo = fakeRepo({ markRead: vi.fn().mockResolvedValue(false) });
    await expect(new NotificationService(repo).markRead(3, 99)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("EmotionAnalysisService — notifies the therapist", () => {
  afterEach(() => vi.unstubAllGlobals());

  function setup({ status = "pending", aiOk = true } = {}) {
    const link = { ...LINK, status };
    const interviewLinkRepo = { findByToken: vi.fn().mockResolvedValue(link), updateStatus: vi.fn().mockResolvedValue({}) };
    const sessionRepo = {
      findByInterviewLinkId: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ session_id: 42, report: null }),
      findCompletedWithReportsByPatientId: vi.fn().mockResolvedValue([]),
    };
    const notifier = { notifyInterview: vi.fn().mockResolvedValue({}) };
    vi.mocked(postFormData).mockReset().mockResolvedValue({
      ok: aiOk,
      status: aiOk ? 200 : 500,
      text: aiOk
        ? JSON.stringify({ per_question: [], overall_distribution: {}, indicators: [], spikes: [], risk_level: "Low", report: null })
        : "boom",
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    return { service: new EmotionAnalysisService(interviewLinkRepo, sessionRepo, notifier), notifier };
  }

  test("finished → results ready, in that order", async () => {
    const { service, notifier } = setup();
    await service.analyzeByToken("tok", []);
    expect(notifier.notifyInterview.mock.calls.map((c) => c[1])).toEqual(["interview_finished", "results_ready"]);
    expect(notifier.notifyInterview.mock.calls[1][2]).toEqual({ sessionId: 42 });
  });

  test("AI failure → finished, then analysis failed", async () => {
    const { service, notifier } = setup({ aiOk: false });
    await expect(service.analyzeByToken("tok", [])).rejects.toMatchObject({ code: "ML_SERVICE_ERROR" });
    expect(notifier.notifyInterview.mock.calls.map((c) => c[1])).toEqual(["interview_finished", "analysis_failed"]);
  });

  test("re-running an already completed interview doesn't notify 'finished' again", async () => {
    const { service, notifier } = setup({ status: "completed" });
    await service.analyzeByToken("tok", []);
    expect(notifier.notifyInterview.mock.calls.map((c) => c[1])).not.toContain("interview_finished");
  });

  test("an already analysed interview returns the stored result without re-running the AI", async () => {
    const { service, notifier } = setup();
    service.sessionRepo.findByInterviewLinkId.mockResolvedValue({ session_id: 5, risk_level: "Low", transcript: [] });
    const result = await service.analyzeByToken("tok", []);
    expect(result.session_id).toBe(5);
    expect(postFormData).not.toHaveBeenCalled();
    expect(notifier.notifyInterview).not.toHaveBeenCalled();
  });

  test("the AI call carries the job id so progress can be reported", async () => {
    const { service } = setup();
    await service.analyzeByToken("tok-123", []);
    const form = vi.mocked(postFormData).mock.calls[0][1];
    expect(form.get("job_id")).toBe("tok-123");
  });

  test("works without a notifier (optional dependency)", async () => {
    const { service } = setup();
    service.notifier = null;
    await expect(service.analyzeByToken("tok", [])).resolves.toMatchObject({ session_id: 42 });
  });
});

describe("NotificationService — crisis flag", () => {
  test("urgent alert to the therapist, without what the patient said", async () => {
    const repo = fakeRepo();
    const result = await new NotificationService(repo).notifyInterview(LINK, "crisis_flag");
    expect(result).not.toBeNull();
    expect(repo.create).toHaveBeenCalledWith({
      user_id: 3,
      type: "crisis_flag",
      title: "Urgent: please check on MARIA SANTOS",
      message: expect.stringContaining("thoughts of self-harm"),
      link: "/patients/9",
      patient_id: 9,
      interview_link_id: 7,
    });
  });

  test("a second alert for the same interview counts as already sent", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const duplicate = Object.assign(new Error("duplicate key"), { code: "23505" });
    const repo = fakeRepo({ create: vi.fn().mockRejectedValue(duplicate) });
    expect(await new NotificationService(repo).notifyInterview(LINK, "crisis_flag")).toEqual({ already_notified: true });
  });

  test("a database failure still reports that nothing was sent", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const repo = fakeRepo({ create: vi.fn().mockRejectedValue(new Error("relation does not exist")) });
    expect(await new NotificationService(repo).notifyInterview(LINK, "crisis_flag")).toBeNull();
  });
});
