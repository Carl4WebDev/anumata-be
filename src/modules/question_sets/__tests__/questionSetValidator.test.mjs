import { describe, test, expect } from "vitest";
import {
  validateQuestionSet,
  validateQuestionSetUpdate,
  MAX_FOLLOW_UP_LENGTH,
} from "../application/validators/questionSetValidator.js";

const base = { name: "Intake", description: "" };

describe("question set follow-ups", () => {
  test("a question can carry an optional follow-up; blank ones are dropped", () => {
    const { questions } = validateQuestionSet({
      ...base,
      questions: [
        { text: "How have you been sleeping?", follow_up: "  What keeps you up?  " },
        { text: "What helps you relax?", follow_up: "   " },
        "How is work?",
      ],
    });
    expect(questions).toEqual([
      { text: "How have you been sleeping?", order: 0, follow_up: "What keeps you up?" },
      { text: "What helps you relax?", order: 1 },
      { text: "How is work?", order: 2 },
    ]);
  });

  test("follow-ups are kept when a set is edited", () => {
    const { questions } = validateQuestionSetUpdate({ questions: [{ text: "Q1", order: 0, follow_up: "Tell me more?" }] });
    expect(questions).toEqual([{ text: "Q1", order: 0, follow_up: "Tell me more?" }]);
  });

  test("a follow-up that is too long or not text is refused", () => {
    expect(() =>
      validateQuestionSet({ ...base, questions: [{ text: "Q1", follow_up: "x".repeat(MAX_FOLLOW_UP_LENGTH + 1) }] }),
    ).toThrow();
    expect(() => validateQuestionSetUpdate({ questions: [{ text: "Q1", follow_up: 5 }] })).toThrow();
  });
});

describe("sensitive questions", () => {
  test("a question can be marked sensitive; anything but true is ignored", () => {
    const { questions } = validateQuestionSet({
      ...base,
      questions: [{ text: "Q1", sensitive: true }, { text: "Q2", sensitive: "yes" }, "Q3"],
    });
    expect(questions).toEqual([
      { text: "Q1", order: 0, sensitive: true },
      { text: "Q2", order: 1 },
      { text: "Q3", order: 2 },
    ]);
  });

  test("the mark is kept when a set is edited", () => {
    const { questions } = validateQuestionSetUpdate({ questions: [{ text: "Q1", order: 0, sensitive: true, follow_up: "More?" }] });
    expect(questions).toEqual([{ text: "Q1", order: 0, follow_up: "More?", sensitive: true }]);
  });
});
