import { describe, test, expect } from "vitest";
import { checkInFields, parseCheckIns, parseSkipped, resultsWithoutSkipped } from "../application/interviewCheckIns.js";

describe("check-ins from the interview room", () => {
  test("keeps known reasons, defaults the outcome to 'continued'", () => {
    const checkIns = parseCheckIns(
      JSON.stringify({ 1: { reason: "head_down", outcome: "break" }, 2: { reason: "no_answer" }, 3: { reason: "mind_reading" } }),
    );
    expect(checkIns.get(1)).toEqual({ reason: "head_down", outcome: "break" });
    expect(checkIns.get(2)).toEqual({ reason: "no_answer", outcome: "continued" });
    expect(checkIns.has(3)).toBe(false);
  });

  test("malformed input means none", () => {
    expect(parseCheckIns("oops").size).toBe(0);
    expect(parseCheckIns("[1]").size).toBe(0);
    expect(parseSkipped("{\"a\":1}").size).toBe(0);
    expect([...parseSkipped("[2, -1, 1.5, 4]")]).toEqual([2, 4]);
  });

  test("a transcript entry records the check-in and whether it was skipped", () => {
    const checkIns = new Map([[2, { reason: "said_hard", outcome: "skipped" }]]);
    expect(checkInFields(2, checkIns, new Set([2]))).toEqual({ check_in: { reason: "said_hard", outcome: "skipped" }, skipped: true });
    expect(checkInFields(0, checkIns, new Set([2]))).toEqual({});
  });
});

describe("results without skipped questions", () => {
  const mlResult = {
    overall_distribution: { Angry: 0, Happy: 0, Neutral: 50, Sad: 50 },
    risk_level: "Moderate",
    indicators: [],
    spikes: [{ question_index: 1, type: "transition" }, { question_index: 3, type: "high_confidence" }],
    per_question: [
      { combined_emotion: "Sad" },
      { combined_emotion: "Neutral" }, // skipped: silent, read as Neutral
      { combined_emotion: "Sad" },
      { combined_emotion: "Neutral" },
    ],
  };

  test("a skipped question no longer waters down the emotion mix and risk", () => {
    const result = resultsWithoutSkipped(mlResult, new Set([1]));
    expect(result.distribution).toEqual({ Angry: 0, Happy: 0, Neutral: 33.3, Sad: 66.7 });
    expect(result.riskLevel).toBe("High");
    expect(result.indicators).toContain("Predominantly sad affect");
    expect(result.spikes).toEqual([{ question_index: 3, type: "high_confidence" }]);
  });

  test("nothing skipped (or everything) keeps the AI service's results", () => {
    expect(resultsWithoutSkipped(mlResult, new Set()).riskLevel).toBe("Moderate");
    expect(resultsWithoutSkipped(mlResult, new Set([0, 1, 2, 3])).distribution).toEqual(mlResult.overall_distribution);
  });
});
