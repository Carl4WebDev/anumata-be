import { describe, test, expect, afterEach, vi } from "vitest";
import { aiServiceHeaders } from "../aiService.js";

afterEach(() => vi.unstubAllEnvs());

describe("aiServiceHeaders", () => {
  test("sends Modal's proxy-auth headers when the key and secret are set", () => {
    vi.stubEnv("AI_SERVICE_KEY", "wk-123");
    vi.stubEnv("AI_SERVICE_SECRET", "ws-456");
    expect(aiServiceHeaders()).toEqual({ "Modal-Key": "wk-123", "Modal-Secret": "ws-456" });
  });

  test("nothing extra for a local AI service (no key set)", () => {
    vi.stubEnv("AI_SERVICE_KEY", "");
    vi.stubEnv("AI_SERVICE_SECRET", "");
    expect(aiServiceHeaders()).toEqual({});
  });
});
