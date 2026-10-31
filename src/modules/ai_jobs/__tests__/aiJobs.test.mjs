import { describe, test, expect, vi } from "vitest";
import { createAiJobs } from "../aiJobs.js";
import AppError from "../../../core/errors/AppError.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

describe("AI jobs", () => {
  test("answers at once with a job id, and the owner can read the result later", async () => {
    const ai = createAiJobs();
    let finish;
    const res = fakeRes();
    ai.start(res, { userId: 7, run: () => new Promise((resolve) => (finish = resolve)) });

    expect(res.statusCode).toBe(202);
    const { job_id, status } = res.body.data;
    expect(status).toBe("processing");
    expect(ai.status(job_id, 7)).toMatchObject({ job_id, status: "processing" });

    await flush();
    finish({ session_summary: "ok" });
    await flush();
    expect(ai.status(job_id, 7)).toEqual({ job_id, status: "completed", result: { session_summary: "ok" }, error: null });
  });

  test("another therapist can't see the job", () => {
    const ai = createAiJobs();
    const res = fakeRes();
    ai.start(res, { userId: 7, run: async () => ({ secret: true }) });
    expect(() => ai.status(res.body.data.job_id, 8)).toThrow(/not found/i);
  });

  test("an unknown job id (e.g. after a server restart) is not found", () => {
    expect(() => createAiJobs().status("nope", 7)).toThrow(/not found/i);
  });

  test("asking twice for the same thing while it runs reuses the job", async () => {
    const ai = createAiJobs();
    const run = vi.fn(() => new Promise(() => {}));
    const first = fakeRes();
    const second = fakeRes();
    ai.start(first, { userId: 7, key: "report:5", run });
    ai.start(second, { userId: 7, key: "report:5", run });
    await flush();
    expect(second.body.data.job_id).toBe(first.body.data.job_id);
    expect(run).toHaveBeenCalledTimes(1);
  });

  test("the same key from different therapists gives separate jobs", () => {
    const ai = createAiJobs();
    const a = fakeRes();
    const b = fakeRes();
    ai.start(a, { userId: 7, key: "report:5", run: () => new Promise(() => {}) });
    ai.start(b, { userId: 8, key: "report:5", run: () => new Promise(() => {}) });
    expect(a.body.data.job_id).not.toBe(b.body.data.job_id);
  });

  test("an app error keeps its message; an unexpected error doesn't leak details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ai = createAiJobs();
    const known = fakeRes();
    const unknown = fakeRes();
    ai.start(known, { userId: 7, run: async () => { throw new AppError("Session not found", 404, "NOT_FOUND"); } });
    ai.start(unknown, { userId: 7, run: async () => { throw new Error("connect ECONNREFUSED 10.0.0.5:8001"); } });
    await flush();
    await flush();

    expect(ai.status(known.body.data.job_id, 7).error).toEqual({ message: "Session not found", code: "NOT_FOUND" });
    const hidden = ai.status(unknown.body.data.job_id, 7).error;
    expect(hidden.code).toBe("AI_JOB_FAILED");
    expect(hidden.message).not.toMatch(/ECONNREFUSED|10\.0\.0\.5/);
  });
});
