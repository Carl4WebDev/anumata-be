import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../database/db.js", () => ({ default: { query: vi.fn().mockResolvedValue({ rows: [] }) } }));

const { default: router } = await import("../healthRoutes.js");

/** Call the /api/system/health handler directly; resolves with { status, body }. */
function systemHealth() {
  const layer = router.stack.find((l) => l.route?.path === "/api/system/health");
  return new Promise((resolve) => {
    const res = {
      status(code) {
        this.code = code;
        return this;
      },
      json(body) {
        resolve({ status: this.code, body });
      },
    };
    layer.route.stack[0].handle({}, res);
  });
}

const aiHealthy = {
  status: "ok",
  models_loaded: { fer: true, ser: true, ler: true, stt: true },
  ollama: { status: "ok", model: "llama3.2:3b" },
};
const jsonResponse = (body) => ({ ok: true, json: async () => body });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("GET /api/system/health", () => {
  test("AI awake: models and Ollama (reported by the AI service itself) are ready", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(aiHealthy)));
    const { status, body } = await systemHealth();
    expect(status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.ai_service).toEqual({ status: "ok", models: { fer: true, ser: true, ler: true, stt: true } });
    expect(body.ollama).toEqual({ status: "ok", model: "llama3.2:3b" });
  });

  test("AI asleep (no answer in 5 s): reported as starting, and woken in the background", async () => {
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url, init = {}) => {
        calls.push(init);
        // Never answers by itself; a request that is aborted rejects.
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        });
      }),
    );
    const pending = systemHealth();
    await vi.advanceTimersByTimeAsync(5000);
    const { status, body } = await pending;

    expect(status).toBe(207);
    expect(body.status).toBe("starting");
    expect(body.ai_service.status).toBe("starting");
    expect(body.ollama.status).toBe("starting");
    // A second request was sent without a time limit, so Modal finishes waking up.
    expect(calls).toHaveLength(2);
    expect(calls[1].signal).toBeUndefined();
  });

  test("AI address unreachable (wrong URL, service down): reported as unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    const { body } = await systemHealth();
    expect(body.status).toBe("degraded");
    expect(body.ai_service.status).toBe("unreachable");
    expect(body.ollama.status).toBe("unreachable");
  });
});
