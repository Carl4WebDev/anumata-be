import { describe, test, expect } from "vitest";
import { followUpAskedFields, parseFollowUpsAsked } from "../application/followUpsAsked.js";

describe("follow-ups asked during the interview", () => {
  test("reads the question indexes, ignoring anything that isn't one", () => {
    expect([...parseFollowUpsAsked("[0, 2, -1, 1.5, \"3\", 999]")]).toEqual([0, 2]);
  });

  test("malformed input means none", () => {
    expect(parseFollowUpsAsked(undefined).size).toBe(0);
    expect(parseFollowUpsAsked("oops").size).toBe(0);
    expect(parseFollowUpsAsked("{\"a\":1}").size).toBe(0);
  });

  test("a transcript entry names the follow-up only when it was asked", () => {
    const asked = new Set([1]);
    const question = { text: "How have you been sleeping?", follow_up: "What keeps you up?" };
    expect(followUpAskedFields(question, 1, asked)).toEqual({ follow_up_asked: "What keeps you up?" });
    expect(followUpAskedFields(question, 0, asked)).toEqual({});
    expect(followUpAskedFields({ text: "No follow-up" }, 1, asked)).toEqual({});
    expect(followUpAskedFields("plain question", 1, asked)).toEqual({});
  });
});
