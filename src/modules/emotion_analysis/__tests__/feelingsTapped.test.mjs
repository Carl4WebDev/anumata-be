import { describe, test, expect } from "vitest";
import { feelingsTappedFields, parseFeelingsTapped } from "../application/feelingsTapped.js";

describe("feeling words tapped during the interview", () => {
  test("keeps known words per question, at most three, without repeats", () => {
    const tapped = parseFeelingsTapped(
      JSON.stringify({ 0: ["worried", "tired"], 2: ["sad", "sad", "angry", "lonely", "scared"], 3: ["furious"] }),
    );
    expect(tapped.get(0)).toEqual(["worried", "tired"]);
    expect(tapped.get(2)).toEqual(["sad", "angry", "lonely"]);
    expect(tapped.has(3)).toBe(false);
  });

  test("malformed input means none", () => {
    expect(parseFeelingsTapped(undefined).size).toBe(0);
    expect(parseFeelingsTapped("nope").size).toBe(0);
    expect(parseFeelingsTapped("[\"sad\"]").size).toBe(0);
    expect(parseFeelingsTapped(JSON.stringify({ x: ["sad"], "-1": ["sad"], 1: "sad" })).size).toBe(0);
  });

  test("a transcript entry lists the words only when some were tapped", () => {
    const tapped = new Map([[1, ["okay"]]]);
    expect(feelingsTappedFields(1, tapped)).toEqual({ feelings_tapped: ["okay"] });
    expect(feelingsTappedFields(0, tapped)).toEqual({});
  });
});
