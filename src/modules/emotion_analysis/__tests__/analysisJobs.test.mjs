import { describe, test, expect, vi } from "vitest";
import http from "node:http";
import { createJobRegistry } from "../application/analysisJobs.js";
import { postFormData } from "../../../core/http/postFormData.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("analysis job registry", () => {
  test("a job runs in the background and reports completion", async () => {
    const jobs = createJobRegistry();
    let finish;
    const { job, started } = jobs.start("tok", () => new Promise((resolve) => (finish = resolve)));
    expect(started).toBe(true);
    expect(job.status).toBe("processing");

    await flush(); // the work starts on the next tick
    finish({ session_id: 1 });
    await flush();
    expect(jobs.get("tok")).toMatchObject({ status: "completed", result: { session_id: 1 } });
  });

  test("a failing job keeps a readable error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const jobs = createJobRegistry();
    jobs.start("tok", async () => {
      throw Object.assign(new Error("ML service unavailable"), { code: "ML_SERVICE_UNAVAILABLE" });
    });
    await flush();
    await flush();
    expect(jobs.get("tok")).toMatchObject({
      status: "failed",
      error: { message: "ML service unavailable", code: "ML_SERVICE_UNAVAILABLE" },
    });
  });

  test("uploading again while it runs doesn't start a second analysis", () => {
    const jobs = createJobRegistry();
    const run = vi.fn(() => new Promise(() => {}));
    jobs.start("tok", run);
    const second = jobs.start("tok", run);
    expect(second.started).toBe(false);
    return flush().then(() => expect(run).toHaveBeenCalledTimes(1));
  });

  test("a failed job can be retried", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const jobs = createJobRegistry();
    jobs.start("tok", async () => {
      throw new Error("boom");
    });
    await flush();
    await flush();
    expect(jobs.start("tok", async () => ({ ok: 1 })).started).toBe(true);
  });

  test("finished jobs are forgotten after an hour", async () => {
    let clock = 0;
    const jobs = createJobRegistry({ now: () => clock });
    jobs.start("tok", async () => ({}));
    await flush();
    clock = 61 * 60 * 1000;
    expect(jobs.get("tok")).toBeNull();
  });
});

describe("postFormData (no response time limit)", () => {
  function serverReplyingAfter(ms, handler) {
    const server = http.createServer((req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => setTimeout(() => handler(req, Buffer.concat(chunks).toString("utf8"), res), ms));
    });
    return new Promise((resolve) => server.listen(0, () => resolve(server)));
  }

  test("sends multipart form data and returns the body", async () => {
    const server = await serverReplyingAfter(0, (req, body, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: req.headers["content-type"].split(";")[0], hasField: body.includes("job_id") }));
    });
    const form = new FormData();
    form.append("job_id", "tok");
    form.append("files", new Blob(["x"]), "audio_0.webm");
    const res = await postFormData(`http://127.0.0.1:${server.address().port}/api/analyze`, form);
    server.close();
    expect(res.ok).toBe(true);
    expect(JSON.parse(res.text)).toEqual({ type: "multipart/form-data", hasField: true });
  });

  test("waits for a slow response instead of giving up", async () => {
    const server = await serverReplyingAfter(1500, (_req, _body, res) => res.end("done"));
    const form = new FormData();
    form.append("x", "1");
    const started = Date.now();
    const res = await postFormData(`http://127.0.0.1:${server.address().port}/`, form);
    server.close();
    expect(res.text).toBe("done");
    expect(Date.now() - started).toBeGreaterThanOrEqual(1400);
  });

  test("reports server errors without throwing", async () => {
    const server = await serverReplyingAfter(0, (_req, _body, res) => {
      res.writeHead(500);
      res.end("Analysis failed");
    });
    const res = await postFormData(`http://127.0.0.1:${server.address().port}/`, new FormData());
    server.close();
    expect(res).toEqual({ ok: false, status: 500, text: "Analysis failed" });
  });
});
