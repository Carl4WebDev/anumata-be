import { describe, test, expect } from "vitest";
import {
  agreementMetrics,
  collectQuestionPairs,
  feelingCounts,
  moodAgreement,
  negativeShare,
  selfReportLabel,
  spearman,
} from "../selfReportMetrics.js";

describe("self-report label for a question", () => {
  test("words that point to one emotion give that emotion", () => {
    expect(selfReportLabel(["sad", "lonely", "worried"])).toEqual({ label: "Sad" });
    expect(selfReportLabel(["hopeful"])).toEqual({ label: "Happy" });
  });

  test("questions that can't be compared say why", () => {
    expect(selfReportLabel([])).toEqual({ skip: "none" });
    expect(selfReportLabel(undefined)).toEqual({ skip: "none" });
    expect(selfReportLabel(["worried", "scared"])).toEqual({ skip: "unmapped" });
    expect(selfReportLabel(["sad", "hopeful"])).toEqual({ skip: "mixed" });
  });
});

describe("pairs of patient report and AI reading", () => {
  const sessions = [
    {
      transcript: [
        { feelings_tapped: ["sad"], combined_emotion: "Sad", fer_emotion: "Neutral", ser_emotion: "sad" },
        { feelings_tapped: ["okay"], combined_emotion: "Happy" },
        { feelings_tapped: [], combined_emotion: "Sad" },
        { feelings_tapped: ["worried"], combined_emotion: "Sad" },
        { feelings_tapped: ["angry"], combined_emotion: null },
      ],
    },
  ];

  test("uses the fused result by default, or one model", () => {
    expect(collectQuestionPairs(sessions).pairs).toEqual([
      { self: "Sad", ai: "Sad" },
      { self: "Neutral", ai: "Happy" },
    ]);
    expect(collectQuestionPairs(sessions, "ser").pairs).toEqual([{ self: "Sad", ai: "Sad" }]);
  });

  test("counts what was skipped and why", () => {
    expect(collectQuestionPairs(sessions).skipped).toEqual({ none: 1, unmapped: 1, mixed: 0, noAi: 1 });
  });
});

describe("agreement metrics", () => {
  test("confusion matrix, accuracy, per-emotion scores and kappa", () => {
    const pairs = [
      { self: "Sad", ai: "Sad" },
      { self: "Sad", ai: "Sad" },
      { self: "Sad", ai: "Neutral" },
      { self: "Happy", ai: "Happy" },
      { self: "Neutral", ai: "Neutral" },
      { self: "Neutral", ai: "Sad" },
    ];
    const m = agreementMetrics(pairs);
    expect(m.n).toBe(6);
    expect(m.matrix[3]).toEqual([0, 0, 1, 2]); // patient Sad → AI Neutral 1, Sad 2
    expect(m.accuracy).toBeCloseTo(4 / 6);
    const sad = m.perClass.find((c) => c.label === "Sad");
    expect(sad.precision).toBeCloseTo(2 / 3);
    expect(sad.recall).toBeCloseTo(2 / 3);
    expect(sad.support).toBe(3);
    expect(m.perClass.find((c) => c.label === "Angry")).toMatchObject({ precision: null, recall: null, f1: null, support: 0 });
    expect(m.kappa).toBeGreaterThan(0);
    expect(m.kappa).toBeLessThan(1);
  });

  test("no data gives empty results, not errors", () => {
    expect(agreementMetrics([])).toMatchObject({ n: 0, accuracy: null, macroF1: null, kappa: null });
  });
});

describe("mood check vs the AI", () => {
  test("spearman correlation handles ties and needs at least 3 points", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1);
    expect(spearman([1, 1, 2], [5, 5, 9])).toBeCloseTo(1);
    expect(spearman([1, 2], [1, 2])).toBeNull();
    expect(spearman([3, 3, 3], [1, 2, 3])).toBeNull();
  });

  test("negative share is Sad + Angry from the session distribution", () => {
    expect(negativeShare({ emotion_summary: { distribution: { Sad: 40, Angry: 10, Happy: 50, Neutral: 0 } } })).toBe(50);
    expect(negativeShare({})).toBe(0);
  });

  test("a patient feeling worse with more Sad/Angry answers gives a negative correlation", () => {
    const session = (before, after, sad) => ({
      emotion_summary: { distribution: { Sad: sad, Angry: 0 }, self_report: { mood_before: before, mood_after: after } },
    });
    const result = moodAgreement([session(1, 2, 80), session(2, 2, 60), session(4, 5, 20), session(5, 4, 10), { emotion_summary: {} }]);
    expect(result.sessionsWithMood).toBe(4);
    expect(result.before.n).toBe(4);
    expect(result.before.spearman).toBeCloseTo(-1);
    expect(result.before.byMood.find((g) => g.mood === 1)).toEqual({ mood: 1, sessions: 1, meanNegativeShare: 80 });
    expect(result.change).toEqual({ n: 4, better: 2, same: 1, worse: 1 });
  });
});

test("feeling word counts include words with no AI match", () => {
  const counts = feelingCounts([{ transcript: [{ feelings_tapped: ["worried", "sad"] }, { feelings_tapped: ["worried"] }] }]);
  expect(counts.worried).toBe(2);
  expect(counts.sad).toBe(1);
  expect(counts.hopeful).toBe(0);
});
