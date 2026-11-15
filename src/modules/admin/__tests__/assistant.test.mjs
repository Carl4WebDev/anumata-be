import { describe, test, expect, vi } from "vitest";
import express from "express";
import AssistantService, { ASK_LIMITS, validateAsk } from "../application/AssistantService.js";
import { assistantLimiter, ASSISTANT_MAX_PER_WINDOW } from "../../../core/middleware/AssistantRateLimiter.js";

const PASSAGE = { id: "qa:fusion", source: "Defense Q&A", title: "How are face and voice combined?", text: "Face 50%, voice 50%." };

const reply = (body, ok = true) => vi.fn(async () => ({ ok, json: async () => body }));
const serviceWith = (fetchImpl) => new AssistantService({ fetchImpl, baseUrl: "http://ai", headers: () => ({ "Modal-Key": "k" }) });

describe("validateAsk", () => {
  test("keeps only what the AI needs, trimmed", () => {
    expect(validateAsk({ question: "  How does fusion work? ", passages: [PASSAGE] })).toEqual({
      question: "How does fusion work?",
      passages: [{ source: "Defense Q&A", title: "How are face and voice combined?", text: "Face 50%, voice 50%." }],
    });
  });

  test("rejects an empty or too-long question", () => {
    expect(() => validateAsk({ question: "  ", passages: [] })).toThrow(/1 to 500/);
    expect(() => validateAsk({ question: "x".repeat(ASK_LIMITS.question + 1) })).toThrow(/1 to 500/);
  });

  test("rejects too many, malformed or oversized entries", () => {
    const many = Array.from({ length: ASK_LIMITS.passages + 1 }, () => PASSAGE);
    expect(() => validateAsk({ question: "q", passages: many })).toThrow(/at most 8/);
    expect(() => validateAsk({ question: "q", passages: [{ ...PASSAGE, text: 42 }] })).toThrow(/source, title and text/);
    expect(() => validateAsk({ question: "q", passages: [{ ...PASSAGE, text: "x".repeat(ASK_LIMITS.text + 1) }] })).toThrow();
    const long = Array.from({ length: 5 }, () => ({ ...PASSAGE, text: "x".repeat(1400) }));
    expect(() => validateAsk({ question: "q", passages: long })).toThrow(/too long in total/);
  });

  test("no entries is allowed (the AI then says it isn't documented)", () => {
    expect(validateAsk({ question: "Anything?" }).passages).toEqual([]);
  });
});

describe("AssistantService.ask", () => {
  test("sends the question and entries to the AI service and returns its answer", async () => {
    const fetchImpl = reply({ ok: true, answer: "Half and half [1].", found: true, sources: [1] });
    const result = await serviceWith(fetchImpl).ask({ question: "How does fusion work?", passages: [PASSAGE] });

    expect(result).toEqual({ answer: "Half and half [1].", found: true, sources: [1] });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://ai/api/assistant/answer");
    expect(options.headers["Modal-Key"]).toBe("k");
    expect(JSON.parse(options.body).passages[0]).not.toHaveProperty("id");
  });

  test("a validation error never reaches the AI", async () => {
    const fetchImpl = reply({});
    await expect(serviceWith(fetchImpl).ask({ question: "" })).rejects.toMatchObject({ statusCode: 422 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("AI down, erroring or timing out → a friendly 503", async () => {
    const down = vi.fn(async () => {
      throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const fetchImpl of [down, reply({}, false), reply({ ok: false })]) {
      await expect(serviceWith(fetchImpl).ask({ question: "q", passages: [PASSAGE] })).rejects.toMatchObject({
        statusCode: 503,
        code: "ASSISTANT_UNAVAILABLE",
      });
    }
  });
});

describe("assistantLimiter", () => {
  test("counts each admin separately and stops at the limit", async () => {
    const app = express();
    app.use((req, res, next) => {
      req.user = { id: Number(req.headers["x-user"]) };
      next();
    });
    app.post("/ask", assistantLimiter, (req, res) => res.json({ ok: true }));
    const server = app.listen(0);
    const url = `http://127.0.0.1:${server.address().port}/ask`;
    const ask = (user) => fetch(url, { method: "POST", headers: { "x-user": String(user) } }).then((r) => r.status);

    try {
      for (let i = 0; i < ASSISTANT_MAX_PER_WINDOW; i += 1) expect(await ask(1)).toBe(200);
      expect(await ask(1)).toBe(429);
      expect(await ask(2)).toBe(200);
    } finally {
      server.close();
    }
  });
});
