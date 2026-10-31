import { describe, test, expect, vi, beforeEach } from "vitest";

const link = { interview_link_id: 7, therapist_id: 3, patient_id: 9, patient_name: "Maria", status: "pending" };
const findByToken = vi.fn();
const notifyInterview = vi.fn();

vi.mock("../../interview_links/infrastructure/InterviewLinkRepo.js", () => ({
  default: class {
    findByToken(token) {
      return findByToken(token);
    }
  },
}));
vi.mock("../../sessions/infrastructure/SessionRepo.js", () => ({ default: class {} }));
vi.mock("../../notifications/notificationServiceInstance.js", () => ({
  notificationService: { notifyInterview: (...args) => notifyInterview(...args) },
}));

const { reportCrisis } = await import("../interface/controller/EmotionAnalysisController.js");

/** Run the asyncHandler-wrapped handler; resolve with the response or the error passed to next(). */
function call(token) {
  return new Promise((resolve) => {
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ statusCode: this.statusCode, body });
      },
    };
    reportCrisis({ params: { token } }, res, (err) => resolve({ error: err }));
  });
}

beforeEach(() => {
  findByToken.mockReset().mockResolvedValue(link);
  notifyInterview.mockReset().mockResolvedValue({ notification_id: 1 });
});

describe("POST /token/:token/crisis-alert", () => {
  test("alerts the patient's therapist urgently", async () => {
    const { statusCode, body } = await call("tok");
    expect(statusCode).toBe(200);
    expect(body.data).toEqual({ notified: true });
    expect(notifyInterview).toHaveBeenCalledWith(link, "crisis_flag");
  });

  test("an alert sent earlier for this interview still counts as notified", async () => {
    notifyInterview.mockResolvedValue({ already_notified: true });
    expect((await call("tok")).body.data).toEqual({ notified: true });
  });

  test("reports honestly when the alert couldn't be saved", async () => {
    notifyInterview.mockResolvedValue(null);
    expect((await call("tok")).body.data).toEqual({ notified: false });
  });

  test("refuses an interview that has already ended", async () => {
    findByToken.mockResolvedValue({ ...link, status: "completed" });
    const { error } = await call("tok");
    expect(error.statusCode).toBe(409);
    expect(notifyInterview).not.toHaveBeenCalled();
  });

  test("unknown interview link → not found", async () => {
    findByToken.mockResolvedValue(null);
    const { error } = await call("nope");
    expect(error.statusCode).toBe(404);
  });
});
